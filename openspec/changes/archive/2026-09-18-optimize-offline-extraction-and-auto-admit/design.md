## Context

当前实现存在两个问题：

1. **离线提取阻塞用户体验**：`session_shutdown` 和 `session_before_compact` 钩子都调用 `runOfflineExtractionForLifecycle()`，该函数会读取 L0 事件、调用模型提取候选记忆，可能耗时数秒。但整个过程完全静默，用户只看到系统"卡住"，不知道在做什么。虽然代码中已有 spinner 逻辑（`正在提取记忆候选...`），但需要 `showProgress=true` 且 `ctx.mode === "tui"` 才显示。

2. **自动审核配置缺失**：`autoAdmitEnabled()` 检查环境变量 `XPI_MEMO_AUTO_ADMIT === "true"`，但该变量未设置，导致所有候选记忆进入待审队列，155 条堆积。自动审核功能已实现但从未启用。

相关文件：
- `src/index.ts`: 注册生命周期钩子，已有 `runOfflineExtractionForLifecycle()` 辅助函数
- `src/offline-extraction.ts`: 离线提取核心逻辑，包含预算检查和事件处理
- `src/kind-routing.ts`: 准入策略路由，`autoAdmitEnabled()` 决定是否自动存储
- `src/config.ts`: 配置加载与默认值，当前无 `autoAdmit` 字段

## Goals / Non-Goals

**Goals:**
- 在 TUI 模式下，离线提取运行时在用户输入编辑器上方显示进度指示器
- 将 `autoAdmit` 加入配置文件，默认值 `true`，让新用户默认启用自动审核
- 环境变量 `XPI_MEMO_AUTO_ADMIT` 作为覆盖选项，优先级高于配置文件
- 优化离线提取性能：在预算检查阶段提前退出，避免不必要的 L0 读取和模型调用
- 保持向后兼容：环境变量显式设置的行为不变

**Non-Goals:**
- 改变离线提取的核心算法或治理逻辑
- 引入新的进度显示 UI 组件（使用现有 `ctx.ui.spinner`）
- 改变除 `autoAdmit` 外的其他准入策略
- 实现 `accumulate` 策略（当前为保留策略）
- 修改非 TUI 模式的行为（保持静默）

## Decisions

### Decision 1: 进度显示放在 `runOfflineExtractionForLifecycle()` 辅助函数内

**选择：** 在 `runOfflineExtractionForLifecycle()` 内部统一处理进度显示逻辑，而不是在两个钩子各自调用。

**理由：**
- 两个钩子（`session_shutdown` 和 `session_before_compact`）都调用同一辅助函数
- 辅助函数已接受 `showProgress` 参数并有 spinner 逻辑，只需确保默认启用
- 避免代码重复，进度显示逻辑集中维护

**替代方案：**
- 在每个钩子内部调用 `ctx.ui.spinner`：需要两处重复代码，违反 DRY 原则
- 创建新的进度显示包装函数：引入不必要的抽象层

### Decision 2: 配置文件 `autoAdmit` 默认值 `true`，环境变量作为覆盖

**选择：**
```typescript
// config.ts
export const DEFAULT_XPI_MEMO_CONFIG = {
  // ... existing fields
  autoAdmit: true,
} as const;

// kind-routing.ts
export function autoAdmitEnabled(
  config: XpiMemoConfig,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const override = env.XPI_MEMO_AUTO_VERIFY;
  if (override === "false" || override === "0") return false;

  // Environment variable takes precedence
  if (env.XPI_MEMO_AUTO_ADMIT !== undefined) {
    return env.XPI_MEMO_AUTO_ADMIT === "true";
  }

  // Fall back to config file
  return config.autoAdmit;
}
```

**理由：**
- 新用户默认获得自动审核功能，不需要手动设置环境变量
- 环境变量优先级更高，现有显式设置不受影响
- 配置文件值可被用户编辑（通过 `/xpi-memo config` 命令）
- 修复了"功能已实现但从未启用"的 bug

**替代方案：**
- 保持 `autoAdmit` 默认 `false`：155 条待审堆积问题不会自动解决，新用户仍需手动配置
- 只依赖环境变量：用户需要修改 shell 配置文件，门槛高
- 项目级配置覆盖：增加复杂度，当前契约明确排除项目级策略

### Decision 3: 预算检查提前退出优化

**选择：** 在 `runOfflineExtraction()` 开始时立即检查预算，如果已耗尽则返回 `"budget-exhausted"` 状态，不读取 L0 事件或调用模型。

**理由：**
- 当前代码先读取事件、构造输入，最后才在 `runOfflineExtraction()` 内检查预算
- 预算检查是 O(1) 操作（读取 JSON 文件中的计数器），而读取 L0 事件可能扫描数百行
- 提前退出可节省磁盘 I/O 和内存分配
- 不改变外部可观测行为，仅优化执行路径

**替代方案：**
- 保持现有流程：不必要的 L0 读取增加延迟
- 缓存预算状态：引入状态同步复杂度，收益不明显

### Decision 4: `autoAdmitEnabled()` 签名改为接受 `config` 参数

**选择：** 修改 `autoAdmitEnabled()` 签名从 `(env)` 改为 `(config, env)`，让调用方传入已加载的配置对象。

**理由：**
- 函数需要读取 `config.autoAdmit`，不应在函数内部重复加载配置
- 所有调用方已经加载了配置对象，可直接传入
- 保持函数无副作用，测试时可注入 mock 配置

**替代方案：**
- 在函数内部加载配置：重复加载配置对象，违反单一职责原则
- 使用全局配置单例：引入全局状态，测试困难

## Risks / Trade-offs

**[风险] 默认启用自动审核可能自动存储低质量候选 → 缓解措施：**
- 工具验证路径已有治理层（`repository-fact` 验证、内容策略检查）
- `global_preference` 等 kind 仍走 `manual-confirm` 或 `accumulate`
- 用户可通过 `XPI_MEMO_AUTO_ADMIT=false` 或编辑配置文件关闭
- 审计日志记录所有自动存储操作，可追溯

**[风险] 进度指示器在快速完成时闪烁 → 接受：**
- 离线提取通常需要 1-5 秒，足够显示有意义的进度
- 快速完成（<100ms）时短暂闪烁优于长时间无反馈
- 现有 `ctx.ui.spinner` 已有防闪烁优化

**[权衡] `autoAdmitEnabled()` 签名变化破坏现有调用方 → 影响有限：**
- 该函数是内部 API，非公开扩展点
- 调用方集中在 `src/routing.ts` 和测试文件，修改成本低
- 签名改进使函数更易测试和理解

**[风险] 预算检查提前退出可能错误拒绝有效提取 → 不存在：**
- 预算检查逻辑未改变，只是执行时机提前
- 预算耗尽是明确状态，不是错误条件
- 诊断输出清楚说明 `budget-exhausted` 原因

## Migration Plan

**部署步骤：**

1. 修改 `src/config.ts`：添加 `autoAdmit: true` 到 `DEFAULT_XPI_MEMO_CONFIG`
2. 修改 `src/kind-routing.ts`：
   - 更新 `autoAdmitEnabled()` 签名和实现
   - 确保环境变量优先级高于配置文件
3. 修改 `src/offline-extraction.ts`：
   - 在 `runOfflineExtraction()` 开始时添加预算检查提前退出
4. 修改 `src/index.ts`：
   - 确保 `runOfflineExtractionForLifecycle()` 默认 `showProgress=true`
   - 更新 `autoAdmitEnabled()` 调用传入 `config` 参数
5. 更新所有测试：适配 `autoAdmitEnabled()` 新签名
6. 运行 `pnpm typecheck && pnpm -w run lint && pnpm test` 确保无回归

**回滚策略：**
- 用户可通过 `XPI_MEMO_AUTO_ADMIT=false` 环境变量立即关闭自动审核
- 或通过 `/xpi-memo config` 命令编辑配置文件 `autoAdmit: false`
- 已自动存储的记忆不会回滚，但可通过 `/xpi-memo forget` 手动删除
- 如需完全回滚代码，恢复 `src/config.ts` 和 `src/kind-routing.ts` 修改即可

**兼容性：**
- 现有显式设置 `XPI_MEMO_AUTO_ADMIT=true` 的用户：行为不变
- 现有显式设置 `XPI_MEMO_AUTO_ADMIT=false` 的用户：行为不变
- 未设置环境变量的用户：从"自动审核关闭"变为"自动审核开启"，这是预期的 bug 修复行为
- 配置文件向后兼容：旧配置文件缺少 `autoAdmit` 字段时，使用默认值 `true`

**监控：**
- 观察待审队列堆积趋势（`/xpi-memo status` 中的 `pendingReview` 计数）
- 检查审计日志中 `auto-admit` 事件频率和拒绝率
- 收集用户反馈关于误审或质量问题
