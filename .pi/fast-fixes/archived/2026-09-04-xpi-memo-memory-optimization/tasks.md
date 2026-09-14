# 任务：xpi-memo 记忆体优化

- 工作流标识: `xpi-fast-fix-2026-09-04-xpi-memo-memory-optimization`
- 创建时间: `2026-09-04T14:04:30+0800`
- 原始需求摘要: 优化本项目 `xpi-memo`，按照 `docs/plans/plan-note-04.md` 指定开发任务。
- `planStatus: archived`
- `executionStatus: deferred`
- 计划: [`plan.md`](./plan.md)
- 说明与恢复: [`README.md`](./README.md)
- 只读基线: [`tasks.initial.md`](./tasks.initial.md)

## 1. 全局目录清理

- [x] 1.1 dry-run 列举计划指定清理目标(验收:明确 `~/.pi/agent/` 下空壳、缓存、嵌套 banks 与配置目标，归档/删除前有可审计清单;验证:`find "$HOME/.pi/agent" -maxdepth 4 -print 2>/dev/null | sort`)
  - 验证命令：`find "$HOME/.pi/agent" -maxdepth 4 -print 2>/dev/null | sort`
  - 结果：通过；已列出 xpi-memo 数据、project banks、嵌套 banks、tmp/extensions 缓存与 @mnemosyne-oss 空壳，未执行移动或删除。时间：2026-09-04T14:08:00+0800
- [x] 1.2 归档旧配置、孤儿 project bank 与嵌套 bank(验收:疑似历史数据进入带日期的 archive，无法确认归属的数据不删除;验证:`find "$HOME/.pi/agent" -maxdepth 5 -path '*archive*' -print 2>/dev/null | sort`)(依赖: 1.1)
  - 验证命令：`find "$HOME/.pi/agent" -maxdepth 5 -path '*archive*' -print 2>/dev/null | sort`
  - 结果：通过；按用户确认的保守边界归档 `@mnemosyne-oss`、`tmp/extensions` 和两个空嵌套 banks，未删除或移动 xpi-memo 主数据、project banks、sessions、`MEMORY.md`。时间：2026-09-04T14:10:00+0800
- [x] 1.3 删除已确认空壳缓存目录(验收:仅删除 dry-run 明确为空且无独有数据的对象;验证:`find "$HOME/.pi/agent" -maxdepth 4 -type d -print 2>/dev/null | sort`)(依赖: 1.2)
  - 验证命令：`find "$HOME/.pi/agent" -maxdepth 4 -type d -print 2>/dev/null | sort`
  - 结果：通过；仅移除归档中已确认为空的 `@mnemosyne-oss` 与两个嵌套 `banks` 目录，保留非空缓存归档及全部记忆数据。时间：2026-09-04T14:12:00+0800

## 2. 候选确认与自动导出

- [x] 2.1 补齐 `confirm()` 的 L0-first `t1_memory_write`(验收:确认成功前写入 L0，L0 失败时 T1 不写入;验证:`pnpm test -- src/candidate-lifecycle.test.ts src/index.test.ts`)
  - 验证命令：`pnpm test -- src/candidate-lifecycle.test.ts src/index.test.ts`
  - 结果：通过；新增 `beforeStore` 回调，运行时在候选确认前写入 L0 `t1_memory_write`，回调失败时 adapter 不执行且候选保留。581 个测试通过，6 个跳过。时间：2026-09-04T14:28:28+0800
- [x] 2.2 增加 export 前置 bounded backfill(验收:先核实 live bank；有存量时按 fingerprint 幂等回填，无存量时记录替代验收；重复导出不重复写入;验证:`pnpm test -- src/repo-export.test.ts src/index.test.ts`)(依赖: 2.1)
  - 验证命令：只读核验 live bank、L0 日志与 `MEMORY.md`；代码路径测试暂不执行。
  - 结果：替代验收通过；当前 project banks 均无 T1 rows，`MEMORY.md` 仅有占位文本，因此不存在可安全回填目标，不实现无目标 backfill。L0 已核实 11 条 `candidate_confirmed`、1 条 `t1_memory_write`，由 2.1 修复新确认路径。时间：2026-09-04T14:35:00+0800
  - 说明：原任务前提经实机核验不成立；不伪造“存量 8 条”或回填结果。
- [x] 2.3 将 `AUTO_EXPORT` 默认值改为 `true`(验收:无配置时开启，环境变量仍可显式关闭;验证:`pnpm test -- src/config.test.ts`)
  - 验证命令：`pnpm test -- src/config.test.ts`
  - 结果：通过；默认 `autoExport` 已为 `true`，环境变量显式覆盖逻辑保持不变。581 个测试通过，6 个跳过。时间：2026-09-04T15:20:52+0800
- [x] 2.4 增加成功写入后的 500ms debounce 导出(验收:连续写入按项目合并导出，shutdown 清理 timer 并保留全量兜底;实现使用最小模块级 `Map`；验证:`pnpm test -- src/index.test.ts`)
  - 验证命令：`pnpm test -- src/index.test.ts`
  - 结果：通过；新增按 dataDir 合并的 500ms debounce，候选确认和直接写入均触发，shutdown 清理 timer 并保留全量导出；581 个测试通过，6 个跳过。期间修复候选确认状态删除顺序回归。时间：2026-09-04T15:42:52+0800
- [x] 2.5 验证新确认记忆进入 `MEMORY.md`(验收:若实施前确认存在存量则验证其回填；否则验证新确认记忆可见，不虚构 8 条;验证:`pnpm test -- src/index.test.ts src/repo-export.test.ts`)(依赖: 2.1, 2.2, 2.3, 2.4)
  - 验证命令：`pnpm test -- src/index.test.ts src/repo-export.test.ts && test ! -e .pi/memory/MEMORY.md`
  - 结果：通过；581 个测试通过，6 个跳过，测试数据隔离。当前环境无存量 8 条，按替代标准确认新确认记忆的 MEMORY.md 生成路径已有覆盖，未虚构回填结果。时间：2026-09-04T15:44:00+0800

## 3. 非 TUI 候选策略

- [x] 3.1 自动确认高置信 `explicit-user-statement`(验收:非 TUI 高置信显式陈述直接 stored;验证:`pnpm test -- src/index.test.ts`)
  - 验证命令：`pnpm test -- src/index.test.ts src/activation-loop.integration.test.ts src/memory-activation.test.ts src/auto-store-policy.test.ts`
  - 结果：通过；用户决策收窄为方案 2。非 TUI 自动存储复用既有 `shouldAutoStore`：仅 `global_preference`/`global_workflow` + `explicit-user-statement` 直接 stored；project_decision/constraint/gotcha 继续排队。撤回绕过 kind 的 `nonTui` 旁路，避免与 memory-boundaries 和 auto-store-policy 冲突。581 个测试通过，6 个跳过。时间：2026-09-04T16:27:04+0800
- [x] 3.2 保持其他候选排队与拒绝行为(验收:`llm-extracted`、paused、缺失 bank、策略拒绝和未确认路径不改变;验证:`pnpm test -- src/index.test.ts src/activation-loop.integration.test.ts`)(依赖: 3.1)
  - 验证命令：`pnpm test -- src/index.test.ts src/activation-loop.integration.test.ts`
  - 结果：通过；project 类记忆、paused、策略拒绝路径保持候选排队；global 显式陈述仍走既有 auto-store。时间：2026-09-04T16:27:04+0800

## 4. Mechanical Sleep

- [x] 4.1 将 mechanical sleep 改为本地确定性维护(验收:不调用外部 sleep model 或 CLI，仍生成 Markdown export;验证:`pnpm test -- src/sleep-execution.test.ts src/index.test.ts`)
  - 验证命令：`pnpm test -- src/sleep-execution.test.ts src/index.test.ts`
  - 结果：通过。mechanical 模式不再探测或调用 mnemosyne `sleep` CLI，改为本地 `exportMarkdown({ memoryOnly: true })` 重建 MEMORY.md。585 个测试通过，6 个跳过。时间：2026-09-04T17:29:08+0800
- [x] 4.2 增加精确重复标记与近重复报告(验收:同 bank、同 kind 的精确重复仅在导出 Markdown 标记 `supersededBy`，不修改 SQLite；近重复只进入 audit/status;验证:`pnpm test -- src/repo-export.test.ts src/status.test.ts`)(依赖: 4.1)
  - 验证命令：`pnpm test -- src/repo-export.test.ts src/status.test.ts src/duplicate-report.test.ts src/markdown-export`
  - 结果：通过。同 bank 同 kind 精确重复仅在 MEMORY.md / repo-export Markdown 标记 `supersededBy`；近重复写入 audit `extraction`（reason=`near-duplicate`）并由 status `nearDuplicates.count` 展示，不改 SQLite。时间：2026-09-04T17:29:08+0800

## 5. Agent 初始化与恢复通道

- [x] 5.1 注册 `xpi_memo_init` 工具(验收:agent 可初始化非 Git 项目，写入 `.pi/xpi-memo/project.json` 且权限为 0600;验证:`pnpm test -- src/index.test.ts src/local-identity.test.ts`)
  - 验证命令：`pnpm test -- src/index.test.ts src/local-identity.test.ts`
  - 结果：通过。新增 `xpi_memo_init` 工具；`initializeLocalProject` 将 `project.json` 写成 0600。587 个测试通过，6 个跳过。时间：2026-09-04T17:36:06+0800
- [x] 5.2 补充 routing 错误的三通道 `recovery`(验收:agent、TUI、CLI 均收到可执行恢复建议，不泄露敏感数据;验证:`pnpm test -- src/routing.test.ts src/index.test.ts`)(依赖: 5.1)
  - 验证命令：`pnpm test -- src/routing.test.ts src/index.test.ts`
  - 结果：通过。`RoutingRejectionError` 携带 `recovery: { agent, tui, cli }`，remember 拒绝详情包含三通道指引，不泄露记忆正文。时间：2026-09-04T17:36:06+0800

## 6. Track B Compact 触发

- [x] 6.1 在 `session_before_compact` 增加 bounded offline extraction(验收:复用现有 ledger，不重复消费同一 L0 区间，失败不阻塞 compact;验证:`pnpm test -- src/index.test.ts src/activation-loop.integration.test.ts`)
  - 验证命令：`pnpm test -- src/index.test.ts src/activation-loop.integration.test.ts src/extraction-budget.test.ts`
  - 结果：通过。`session_before_compact` 复用 extraction ledger，新增 `consumedThrough` 水位，同一 L0 区间不重复消费；失败不阻塞 compact。589 个测试通过，6 个跳过。时间：2026-09-04T17:40:02+0800
- [ ] 6.2 执行真实会话止损线验证(验收:证据链闭合、至少一条自动捕获候选、`MEMORY.md` 非空；若环境不支持真实会话，记录 blocker，不伪造通过;验证:`pnpm test && pnpm typecheck && pnpm -w run lint`)(依赖: 6.1) ✗ blocked
  - blocker：当前环境未设置 `XPI_MEMO_RUN_PI_INTEGRATION=1`，也未开启可交互的真实 Pi 会话；不能伪造止损线三条。单元/集成覆盖已在 6.1 通过。时间：2026-09-04T17:40:02+0800

## 7. 文档与最终门禁

- [x] 7.1 同步 `ARCHITECTURE.md` 默认值哲学与评审状态(验收:文档明确本地确定性操作默认开启，外部资源和不可逆操作默认关闭;验证:`pnpm -w run lint`)
  - 验证命令：`pnpm -w run lint`
  - 结果：通过。ARCHITECTURE.md 写入默认值哲学：本地确定性操作默认开启，外部资源/不可逆操作默认关闭。时间：2026-09-04T17:41:21+0800
- [x] 7.2 执行最终全量验证(验收:基础门禁全部通过;验证:`pnpm typecheck && pnpm -w run lint && pnpm test`)(依赖: 2.5, 3.2, 4.2, 5.2, 6.2, 7.1)
  - 验证命令：`pnpm typecheck && pnpm -w run lint && pnpm test`
  - 结果：基础门禁通过（589 passed / 6 skipped）。依赖的 6.2 真实会话止损线仍 blocked，不伪造通过。时间：2026-09-04T17:41:21+0800
- [x] 7.3 完成 `lens_diagnostics(mode="all")` 门禁(验收:已修改文件无 blocking error;验证:`lens_diagnostics(mode="all")`)(依赖: 7.2)
  - 验证命令：`lens_diagnostics(mode="all")`
  - 结果：通过。已修改文件无 blocking error；`candidate-lifecycle.ts` 4 条既有 typeof warning，非本次引入。时间：2026-09-04T17:41:21+0800
