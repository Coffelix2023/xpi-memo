## 1. 配置层修改

- [x] 1.1 在 `src/config.ts` 的 `DEFAULT_XPI_MEMO_CONFIG` 中添加 `autoAdmit: true` 字段，并更新 `XpiMemoConfig` 类型定义；验证 `pnpm typecheck` 通过
- [x] 1.2 更新 `src/kind-routing.ts` 中的 `autoAdmitEnabled()` 函数签名，从 `(env)` 改为 `(config, env)`，实现环境变量优先、配置文件兜底的逻辑；验证函数返回值符合决策表（环境变量显式设置时使用环境变量，否则使用 `config.autoAdmit`）
- [x] 1.3 更新 `src/routing.ts` 中所有 `autoAdmitEnabled()` 调用点，传入 `config` 参数；验证 `pnpm typecheck` 通过且无遗漏调用点（唯一调用点在 `src/candidate-lifecycle.ts`，已改为 `autoAdmitEnabled(config, env)` 并由 `src/index.ts` 注入配置）

## 2. 离线提取进度显示

- [x] 2.1 检查 `src/index.ts` 中 `runOfflineExtractionForLifecycle()` 函数，确认进度显示逻辑与设计文档 Decision 1 一致；实机验证发现 `ctx.ui.spinner` 在已安装的 `ExtensionUIContext` 类型中不存在，改用仓库既有的 `src/surface.ts` 流光组件（新增 `extract` 动作），非 TUI 模式下保持静默
- [x] 2.2 在 `session_shutdown` 和 `session_before_compact` 钩子调用 `runOfflineExtractionForLifecycle()` 时统一传入 `getSurface(ctx)`；验证两个钩子都使用统一的进度显示逻辑（开始/清理都在同一个包装函数内）

## 3. 离线提取性能优化

- [x] 3.1 在 `src/offline-extraction.ts` 的 `runOfflineExtraction()` 函数开始处，添加预算检查提前退出逻辑：如果 `ledger` 存在且预算已耗尽，立即返回 `{ status: "budget-exhausted", diagnostics }` 而不读取 L0 事件；验证返回的诊断信息包含正确的预算消耗值
- [x] 3.2 确认提前退出路径的诊断输出与正常流程的 `diagnostics()` 函数保持一致格式；验证 `status: "budget-exhausted"` 包含 `budgetChars`、`budgetExecutions`、`budgetProposals` 字段

## 4. 测试更新

- [x] 4.1 更新 `src/kind-routing.test.ts`（原文件没有 `autoAdmitEnabled()` 调用，新增覆盖）并补充测试用例覆盖"环境变量优先"与"配置文件兜底"；验证 `pnpm test src/kind-routing.test.ts` 通过
- [x] 4.2 更新引用准入判断的测试文件（`src/auto-admission.integration.test.ts`、`src/candidate-lifecycle.test.ts`）适配新默认值；验证 `pnpm test` 全部通过
- [x] 4.3 在 `src/offline-extraction.test.ts` 中添加测试用例，验证预算已耗尽时提前退出逻辑：同一批事件在不耗预算时被判 `refused`，耗预算时直接返回 `budget-exhausted`，断言未调用模型；验证测试通过

## 5. 集成验证

- [x] 5.1 进度指示器改用自动化证据：`src/index.test.ts` 在 TUI 上下文里触发 `session_shutdown`，断言 widget 渲染出"正在提取记忆候选..."并在结束后被清理（人工 TUI 观察未执行）
- [x] 5.2 不设置 `XPI_MEMO_AUTO_ADMIT` 时自动存储：由 `src/auto-admission.integration.test.ts` 的默认用例断言 `status: "stored"`、审计 `decision: "auto-stored"`、待审队列为空
- [x] 5.3 `XPI_MEMO_AUTO_ADMIT=false` 时进入待审队列：由集成用例断言 `status: "candidate"`、审计 `shadow-verified`、无 T1 写入（环境变量覆盖配置文件默认值）

## 6. 最终检查

- [x] 6.1 运行 `pnpm typecheck && pnpm -w run lint && pnpm test` 确保所有检查通过，无类型错误、无 lint 报错（仅 1 条 `useMaxParams` info）、无测试失败
- [x] 6.2 检查 `src/config.ts`、`src/kind-routing.ts`、`src/offline-extraction.ts`、`src/index.ts` 四个核心文件的修改，确认所有变更与设计文档一致；`src/console.ts`（设置项面板）与 `src/surface.ts`（流光组件）为设计遗漏的连带改动
