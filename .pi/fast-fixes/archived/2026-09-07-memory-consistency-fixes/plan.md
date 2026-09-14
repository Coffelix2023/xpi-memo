# 修复计划：memory consistency hardening

- workflowId: `ff-20260907-memory-consistency-fixes`
- createdAt: `2026-09-07T01:45:50Z`
- planStatus: `archived`
- executionStatus: `deferred`
- 关联 README：`README.md`
- 关联任务：`tasks.md`
- 只读基线：`tasks.initial.md`

## 目标

1. 保证按 `--session <id>` 执行 daily export 时，发生 MEMORY 影响事件的全局 `MEMORY.md` projection 仍从所有可读 session 的完整 L0 历史重建。
2. 保证 T1 backend 成功但 L0 commit 失败的 `unresolved` 状态穿过 candidate lifecycle 和 offline extraction governance，不被错误报告为 `rejected`。
3. 保证 TUI candidate review 只在实际 `stored` 时写入 `candidate_confirmed`。
4. 保证删除 recovery 或 backend 失败时，如果 `memory_failed` 终态事件也无法写入，工具结果返回 `unresolved`。
5. 以最小回归测试覆盖 A/B session、candidate/offline unresolved、TUI 事件边界和 deletion failure-event failure。

## 非目标

- 不重构 T1/L0 为事务系统，不新增缓存、依赖或持久化格式。
- 不改变合法用户拒绝、策略拒绝、backend failure 且 failure event 已写入时的 `rejected`/`failed` 语义。
- 不改变 L0 event schema、MEMORY.md section/sort/duplicate/source traceability 行为。
- 不处理审核报告中与本修复无关的 `AGENTS.md` 约束 diff，不回滚工作区已有改动。
- 不提交、推送、合并或执行破坏性 Git 操作。

## 已有证据

- `src/markdown-export/exporter.ts` 在 `options.sessionId` 存在时先缩小 `sessionIds`，后续 MEMORY projection 的 `fullReads` 复用该集合。
- `src/candidate-lifecycle.ts` 的 `CandidateLifecycleResult` 当前没有 `unresolved`，且 `confirm()` 将 commit outcome 的所有非 `stored` 状态返回为 `rejected`。
- `src/offline-extraction.ts` 的 `OfflineExtractionGovernanceResult` 当前没有 `unresolved`，direct store 对 `runT1Write()` 的非 `stored` 结果统一返回 `rejected`。
- `src/index.ts` 的 TUI `reviewCandidate` 在 `confirm()` 后无条件写 `candidate_confirmed`；另一路 remember flow 已有 `stored` 条件，可作为本地模式参考。
- `src/deletion-lifecycle.ts` 的 `recordFailure()` 捕获并吞掉 `l0.record("memory_failed")` 异常，调用方仍固定返回 `failed`。
- 现有测试已经覆盖普通失败/成功，但将 candidate unresolved 断言为 rejected，且 deletion 测试未覆盖 failure event 写入失败。

## 根因与待验证假设

### 根因

- daily session filter 与全局 MEMORY projection 共用同一个 `sessionIds` 集合，破坏了 projection 的全量输入边界。
- lifecycle 结果类型和映射逻辑把 `failed` 与 `unresolved` 合并，丢失“backend 已处理但 L0 无法确认终态”的信息。
- deletion failure helper 没有把 terminal event 写入结果返回给调用方。

### 假设

- `options.sessionId` 只应限制 daily export 结果和 session 返回集；MEMORY projection 仍应扫描 `sessionsRoot` 下全部 session。
- `runT1Write()`、candidate commit callback 和 offline direct store 的已有 `unresolved` 状态是本次传播的事实来源。
- TUI `candidate_confirmed` 是成功确认事件，不应代表尝试确认；失败/未决状态由 lifecycle/failure 事件表达。

## 推荐方案

1. 在 exporter 中拆分 daily export 的 session IDs 与 MEMORY projection 的全量 session IDs。保留单 session daily 限制，projection 分支读取并折叠所有 session 的完整历史；为 A/B session 加回归测试。
2. 在 `CandidateLifecycleResult` 和 `OfflineExtractionGovernanceResult` 增加 `unresolved`。仅把 lifecycle `unresolved` 原样传播，继续把明确的 `failed` 转为当前对外 rejected 语义；更新候选保留断言和 offline direct-store 测试。
3. 在 TUI review path 仅当 `stored.status === "stored"` 时记录 `candidate_confirmed`，并验证 rejected/unresolved 不产生该事件。
4. 让 `recordFailure()` 返回是否成功落盘 `memory_failed`。recovery/backend failure 调用点据此返回 `failed` 或 `unresolved`；补充两类 failure event 写入失败测试。
5. 按任务顺序运行局部测试、类型检查、lint 和完整测试；任何验证失败立即暂停并记录现场。

## 放弃方案及原因

- **禁止单 session 导出触发 MEMORY projection**：会让用户完成一次 session 导出后无法同步预期的全局投影，且需要新增用户可见的“projection skipped”语义；全量读取更符合 MEMORY.md 的全局派生视图契约。
- **引入事务/缓存/统一状态机重构**：超出三个已定位缺口，增加改动面和回归风险；现有生命周期模块已有足够边界，只需修正状态类型与返回值。
- **在每个调用方单独补状态判断**：会重复传播规则；本次优先修复共享 lifecycle 返回类型，再保留调用方必要的事件条件。

## 最小涉及范围

实现文件：

- `src/markdown-export/exporter.ts`
- `src/candidate-lifecycle.ts`
- `src/offline-extraction.ts`
- `src/index.ts`
- `src/deletion-lifecycle.ts`

测试文件：

- `src/markdown-export/exporter.test.ts`
- `src/candidate-lifecycle.test.ts`
- `src/offline-extraction-governance.test.ts`
- `src/deletion-lifecycle.test.ts`

## 决策

- 使用方案 A：全量 MEMORY projection + `unresolved` 传播 + deletion failure-event 成功标志。
- 保持现有文件边界和依赖，禁止引入新库。
- 单 session export 的 daily 输出仍只包含目标 session；全局 `MEMORY.md` 不受该过滤影响。
- `rejected` 继续表示用户拒绝或明确策略/失败路径；`unresolved` 表示 backend/T1 结果无法由 L0 终态确认。
- deletion failure event 写入失败时，结果必须为 `unresolved`，因为 L0 只有 request event。

## 风险与兼容性

- 新增 union member 可能要求调用方显式处理；执行时用 `rg` 和 typecheck 检查所有分支。
- 全量 projection 会在单 session 导出时读取更多日志，但这是 MEMORY.md 正确性的必要成本，且复用现有 bounded event reader。
- L0 event schema 与文件格式不变，不需要迁移。
- 现有工作区有未提交改动；只在本计划范围内协作修改，避免覆盖无关修改。

## 验证命令

局部验证：

```bash
pnpm test src/markdown-export/exporter.test.ts
pnpm test src/candidate-lifecycle.test.ts
pnpm test src/offline-extraction-governance.test.ts
pnpm test src/deletion-lifecycle.test.ts
```

最终验证：

```bash
pnpm typecheck
pnpm -w run lint
pnpm test
git diff --check
```

## 验收标准

- A、B 两个 session 均有 memory-affecting event 时，执行 `--session A` 后 `MEMORY.md` 同时保留 A、B 的投影；daily 文件仍只包含 A。
- candidate commit 返回 `unresolved` 时，结果为 `unresolved`、candidate 仍保留，且不会写 `candidate_confirmed`。
- offline direct store 收到 T1 `unresolved` 时，对外返回 `unresolved`，不误报 `rejected`，且已有 backend memory 不被当作已确认成功。
- TUI review 的 `candidate_confirmed` 只在 `stored` 时写入。
- deletion recovery failure 和 backend delete failure 在 `memory_failed` 写入成功时保持 `failed`；写入失败时返回 `unresolved`。
- 所有计划任务完成，`tasks.md` 与 `tasks.initial.md` 的任务 ID 和顺序完全一致。
- `pnpm typecheck`、`pnpm -w run lint`、`pnpm test`、`git diff --check` 均成功。
