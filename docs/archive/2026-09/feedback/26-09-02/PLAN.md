# xpi-memo 架构问题与优化方案总结

## 摘要
基于 `xpi-memo-test-report.md`、`xpi-memo-git-analysis.md` 和审核结论，当前项目的核心架构问题不是“是否支持项目记忆”，而是 **非 TUI、非 git 场景下的记忆链路不完整、失败不可观测、语义分层不一致**。现有设计的优点是全局记忆与项目记忆物理隔离清晰，但在真实使用中暴露出“自动捕获未闭环”“非 git 降级静默”“session_context 绑定位置不合理”等问题。

## 暴露出的主要架构问题

### 1. 自动记忆链路没有闭环
- 实测成功写入主要来自手动 `xpi_memo_remember`。
- 激活循环（activation loop）的自动捕获没有被验证通过。
- 在非 TUI / RPC 风格使用中，候选可能无法自然进入确认与落库路径，导致系统回到“零记忆稳态”。

### 2. 非 git 目录被设计成“二等公民”
- `global_preference`、`global_workflow` 可用，但所有 `project_*` 和 `session_context` 在非 git 目录直接失败。
- `recall` 在非 git 下只搜 global bank，旧项目记忆也无法参与检索。
- 这使得“能用”和“能沉淀上下文”被强行拆开，真实体验是残血模式。

### 3. `session_context` 的路由语义不合理
- `session_context` 被路由到 project bank，导致“当前会话上下文”依赖 git 仓库身份。
- 这是和其语义不匹配的绑定，会让最常见的短期上下文在非 git 场景失效。

### 4. 失败路径不可观测
- 路由阶段失败没有写入 L0 事件，也没有 `routing_rejected` 一类可统计事件。
- 工具只返回通用错误 `Memory write failed.`，吞掉了真正原因。
- 结果是：用户和 agent 都无法区分“内容不合格”“配置缺失”“环境不支持”。

### 5. 元数据语义与物理存储不一致
- 项目 bank 里的记忆 scope 仍标成 `global`，但物理上存放在 project bank。
- 这会污染后续的召回、排序、导出或跨项目聚合逻辑。
- 当前状态属于“隔离了，但元数据还假装没隔离”。

### 6. sleep / 合并功能缺少降级路径
- `xpi_memo_sleep` 依赖专用模型，未配置时直接不可用。
- 没有 fallback 到当前会话模型或机械合并模式。
- doctor 也没有把“功能因配置缺失被禁用”显式暴露出来。

## 优化方案

### P0：先修断链和可观测性
1. **路由失败必须写 L0 事件**
   - 增加 `routing_rejected` / `write_rejected` 事件。
   - 记录 `kind`、`reason`、`cwd`、`projectIdentity` 是否缺失。

2. **错误信息原样透传**
   - 向 agent 返回明确原因，例如 `Project memory requires a recognized Git project`。
   - 不要统一吞成 `Memory write failed.`。

3. **补齐自动捕获验收**
   - 把 activation loop 作为核心验收项，而不是待验证项。
   - 必须验证非 TUI 场景下也能形成完整候选 → 确认 → 落库链路。

### P1：修正语义分层
4. **将 `session_context` 从 git 解绑**
   - 优先路由到 global 或独立 ephemeral bank。
   - 让“会话上下文”真正服务于短期记忆，而不是项目身份。

5. **修正 scope 语义**
   - project bank 内记忆的 scope 应与物理边界一致。
   - 如需跨项目可见性，新增独立字段，不复用 scope。

6. **给非 git 场景明确降级策略**
   - 两条路线二选一：
     - fallback 到 global bank，并标记 `degraded: true`；
     - 提供显式 `xpi_memo_init_project(path)` 建立非 git 项目身份。

### P2：补强功能完整性
7. **为 sleep 加 fallback**
   - 未配置专用模型时，允许降级到当前会话模型或机械合并。
   - doctor 增加 `SLEEP_DISABLED` 状态，避免“看起来支持、实际上不可用”。

8. **补齐 recall 体验**
   - 非 git 下不要只搜 default bank；至少让用户知道当前检索范围。
   - 在输出中标注当前处于 global-only 还是 project+global 模式。

## 预期收益
- 非 git 场景不再静默失忆。
- agent 能从错误信息中自我修正，而不是重复失败。
- L0 审计链完整后，丢失率、降级率、禁用率都能被统计。
- `session_context`、`project_*`、`global_*` 的边界会更符合语义和使用直觉。

## 验证标准
- 非 git 目录下：
  - `global_*` 可用；
  - `session_context` 行为符合新语义；
  - 路由失败有明确事件和明确错误；
  - recall 能显示当前检索范围。
- git 目录下：
  - project 级写入、召回、删除、sleep 全链路通过；
  - activation loop 能在非手动 remember 前提下完成一次完整闭环。

## 关键假设
- 以当前两份报告为准，不额外假设隐藏实现细节。
- 先优化“可观测性”和“语义一致性”，再谈体验增强。
- 不建议优先做大重构；先把失败路径、session_context 路由和 non-git 降级补齐。
