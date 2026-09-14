# 任务清单

> 只读基线，禁止修改；用于与 `tasks.initial.md` 对比检测任务遗漏。
>
> - workflowId: `ff-20260907-memory-consistency-fixes`
> - createdAt: `2026-09-07T01:45:50Z`
> - planStatus: `archived`
> - executionStatus: `deferred`
> - 关联计划：`plan.md`
> - 关联说明：`README.md`

## 1. MEMORY.md 全量投影

- [ ] 1.1 分离 daily session filter 与 MEMORY projection 的 session 集合，使 `--session <id>` 的全局 projection 读取全部 session(验收:单 session 导出不会删除其他 session 的 MEMORY 投影;验证:`pnpm test src/markdown-export/exporter.test.ts`)
- [ ] 1.2 补充 A/B session 回归测试，确认 daily 只含目标 session 且 MEMORY.md 同时含 A、B(验收:测试稳定复现并锁定两种输出边界;验证:`pnpm test src/markdown-export/exporter.test.ts`)(依赖: 1.1)

## 2. unresolved 状态传播

- [ ] 2.1 扩展 `CandidateLifecycleResult` 与 `OfflineExtractionGovernanceResult`，允许对外表达 `unresolved`(验收:类型包含 unresolved 且所有调用方可通过类型检查;验证:`pnpm typecheck`)
- [ ] 2.2 修改 candidate confirm 映射，仅将明确的 unresolved 原样传播、明确 failed 保持 rejected，且未决时保留候选(验收:commit 返回 unresolved 时结果为 unresolved 并保留 candidates.json;验证:`pnpm test src/candidate-lifecycle.test.ts`)(依赖: 2.1)
- [ ] 2.3 修改 offline direct store 映射，传播 T1 unresolved 而不压缩为 rejected(验收:backend 已写入但 L0 commit 未确认时治理结果为 unresolved;验证:`pnpm test src/offline-extraction-governance.test.ts`)(依赖: 2.1)
- [ ] 2.4 修改 TUI candidate review，仅在 `stored.status === "stored"` 时写 `candidate_confirmed`(验收:rejected/unresolved 确认结果不产生 candidate_confirmed;验证:`pnpm test src/index.test.ts`)(依赖: 2.2)
- [ ] 2.5 更新并补齐 candidate/offline unresolved 回归断言，不改变用户拒绝和明确策略拒绝语义(验收:相关测试覆盖 stored、rejected、unresolved 三类结果;验证:`pnpm test src/candidate-lifecycle.test.ts src/offline-extraction-governance.test.ts`)(依赖: 2.2, 2.3)

## 3. deletion failure-event 边界

- [ ] 3.1 让 `recordFailure()` 返回 `memory_failed` 是否成功写入的布尔结果(验收:调用方可以区分 terminal event 已落盘与仅有 request;验证:`pnpm typecheck`)
- [ ] 3.2 修改 recovery failure 与 backend delete failure 调用点，failure event 写入失败时返回 unresolved(验收:写入成功仍返回 failed，写入失败返回 unresolved;验证:`pnpm test src/deletion-lifecycle.test.ts`)(依赖: 3.1)
- [ ] 3.3 补充两类 deletion failure-event 写入失败测试，并确认不误报 deletion success(验收:recovery/backend 两条路径的 L0 event 与工具结果一致;验证:`pnpm test src/deletion-lifecycle.test.ts`)(依赖: 3.2)

## 4. 最终质量门禁

- [ ] 4.1 执行 TypeScript 类型检查(验收:命令退出码为 0 且无类型错误;验证:`pnpm typecheck`)(依赖: 1.2, 2.5, 3.3)
- [ ] 4.2 执行 Biome lint(验收:命令退出码为 0 且无 lint 错误;验证:`pnpm -w run lint`)(依赖: 4.1)
- [ ] 4.3 执行完整测试与 diff 检查(验收:完整测试通过且 diff 无 whitespace error;验证:`pnpm test && git diff --check`)(依赖: 4.2)
- [ ] 4.4 核对 `tasks.md` 与只读基线的任务 ID 和顺序完全一致(验收:无任务遗漏、重排或新增;验证:`diff -u <(rg '^- \[[ x]\] [0-9]+\.[0-9]+' tasks.initial.md | sed -E 's/^- \[[ x]\] //' | sed 's/ ⏳.*$//' | sed 's/ ✗.*$//') <(rg '^- \[[ x]\] [0-9]+\.[0-9]+' tasks.md | sed -E 's/^- \[[ x]\] //' | sed 's/ ⏳.*$//' | sed 's/ ✗.*$//')`)(依赖: 4.3)
