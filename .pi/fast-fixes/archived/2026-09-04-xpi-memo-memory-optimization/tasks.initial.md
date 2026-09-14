# 任务：xpi-memo 记忆体优化

> 只读基线，禁止修改；用于与 tasks.md 对比检测任务遗漏。

- 工作流标识: `xpi-fast-fix-2026-09-04-xpi-memo-memory-optimization`
- 创建时间: `2026-09-04T14:04:30+0800`
- 原始需求摘要: 优化本项目 `xpi-memo`，按照 `docs/plans/plan-note-04.md` 指定开发任务。
- `planStatus: archived`
- `executionStatus: deferred`
- 计划: [`plan.md`](./plan.md)
- 说明与恢复: [`README.md`](./README.md)
- 工作副本: [`tasks.md`](./tasks.md)

## 1. 全局目录清理

- [ ] 1.1 dry-run 列举计划指定清理目标(验收:明确 `~/.pi/agent/` 下空壳、缓存、嵌套 banks 与配置目标，归档/删除前有可审计清单;验证:`find "$HOME/.pi/agent" -maxdepth 4 -print 2>/dev/null | sort`)
- [ ] 1.2 归档旧配置、孤儿 project bank 与嵌套 bank(验收:疑似历史数据进入带日期的 archive，无法确认归属的数据不删除;验证:`find "$HOME/.pi/agent" -maxdepth 5 -path '*archive*' -print 2>/dev/null | sort`)(依赖: 1.1)
- [ ] 1.3 删除已确认空壳缓存目录(验收:仅删除 dry-run 明确为空且无独有数据的对象;验证:`find "$HOME/.pi/agent" -maxdepth 4 -type d -print 2>/dev/null | sort`)(依赖: 1.2)

## 2. 候选确认与自动导出

- [ ] 2.1 补齐 `confirm()` 的 L0-first `t1_memory_write`(验收:确认成功前写入 L0，L0 失败时 T1 不写入;验证:`pnpm test -- src/candidate-lifecycle.test.ts src/index.test.ts`)
- [ ] 2.2 增加 export 前置 bounded backfill(验收:先核实 live bank；有存量时按 fingerprint 幂等回填，无存量时记录替代验收；重复导出不重复写入;验证:`pnpm test -- src/repo-export.test.ts src/index.test.ts`)
- [ ] 2.3 将 `AUTO_EXPORT` 默认值改为 `true`(验收:无配置时开启，环境变量仍可显式关闭;验证:`pnpm test -- src/config.test.ts`)
- [ ] 2.4 增加成功写入后的 500ms debounce 导出(验收:连续写入按项目合并导出，shutdown 清理 timer 并保留全量兜底;实现使用最小模块级 `Map`；验证:`pnpm test -- src/index.test.ts`)
- [ ] 2.5 验证新确认记忆进入 `MEMORY.md`(验收:若实施前确认存在存量则验证其回填；否则验证新确认记忆可见，不虚构 8 条;验证:`pnpm test -- src/index.test.ts src/repo-export.test.ts`)(依赖: 2.1, 2.2, 2.3, 2.4)

## 3. 非 TUI 候选策略

- [ ] 3.1 自动确认高置信 `explicit-user-statement`(验收:非 TUI 高置信显式陈述直接 stored;验证:`pnpm test -- src/index.test.ts`)
- [ ] 3.2 保持其他候选排队与拒绝行为(验收:`llm-extracted`、paused、缺失 bank、策略拒绝和未确认路径不改变;验证:`pnpm test -- src/index.test.ts src/activation-loop.integration.test.ts`)(依赖: 3.1)

## 4. Mechanical Sleep

- [ ] 4.1 将 mechanical sleep 改为本地确定性维护(验收:不调用外部 sleep model 或 CLI，仍生成 Markdown export;验证:`pnpm test -- src/sleep-execution.test.ts src/index.test.ts`)
- [ ] 4.2 增加精确重复标记与近重复报告(验收:同 bank、同 kind 的精确重复仅在导出 Markdown 标记 `supersededBy`，不修改 SQLite；近重复只进入 audit/status;验证:`pnpm test -- src/repo-export.test.ts src/status.test.ts`)(依赖: 4.1)

## 5. Agent 初始化与恢复通道

- [ ] 5.1 注册 `xpi_memo_init` 工具(验收:agent 可初始化非 Git 项目，写入 `.pi/xpi-memo/project.json` 且权限为 0600;验证:`pnpm test -- src/index.test.ts src/local-identity.test.ts`)
- [ ] 5.2 补充 routing 错误的三通道 `recovery`(验收:agent、TUI、CLI 均收到可执行恢复建议，不泄露敏感数据;验证:`pnpm test -- src/routing.test.ts src/index.test.ts`)(依赖: 5.1)

## 6. Track B Compact 触发

- [ ] 6.1 在 `session_before_compact` 增加 bounded offline extraction(验收:复用现有 ledger，不重复消费同一 L0 区间，失败不阻塞 compact;验证:`pnpm test -- src/index.test.ts src/activation-loop.integration.test.ts`)
- [ ] 6.2 执行真实会话止损线验证(验收:证据链闭合、至少一条自动捕获候选、`MEMORY.md` 非空；若环境不支持真实会话，记录 blocker，不伪造通过;验证:`pnpm test && pnpm typecheck && pnpm -w run lint`)(依赖: 6.1)

## 7. 文档与最终门禁

- [ ] 7.1 同步 `ARCHITECTURE.md` 默认值哲学与评审状态(验收:文档明确本地确定性操作默认开启，外部资源和不可逆操作默认关闭;验证:`pnpm -w run lint`)
- [ ] 7.2 执行最终全量验证(验收:基础门禁全部通过;验证:`pnpm typecheck && pnpm -w run lint && pnpm test`)(依赖: 2.5, 3.2, 4.2, 5.2, 6.2, 7.1)
- [ ] 7.3 完成 `lens_diagnostics(mode="all")` 门禁(验收:已修改文件无 blocking error;验证:`lens_diagnostics(mode="all")`)(依赖: 7.2)
