# Task 1 Report — Lifecycle Contract

## 目的

让受治理的 T1 写入在 L0（会话事件层）与后端存储不能共享事务时，仍能明确区分成功、失败和未决状态，避免将缺少 commit 事件的后端写入误报为成功。

## 实现

- 增加 `operationId` 关联的 request、commit、failure lifecycle payload，并保留历史无 `operationId` 的 committed 写入/删除事件兼容读取。
- 新增 `src/t1-lifecycle.ts`：L0-first 的统一 coordinator 与纯事件折叠逻辑。
- direct capture、candidate confirmation、offline extraction 全部经 coordinator 写入。
- candidate 仅在 L0 commit 成功后从 `candidates.json` 删除；backend 失败或 L0 commit 写入失败时保留队列条目。

## 特点与边界

- L0 是 lifecycle 事实来源；跨存储中断返回 `unresolved`，不伪造 `stored`。
- 不引入分布式事务、重试队列或新的运行时依赖。
- 新增 `memory_delete_requested` 事件类型与 payload 契约；实际 forget/recovery 删除路径属于后续 Task 2。

## 验证

- `pnpm typecheck`
- `pnpm -w run lint`
- `pnpm test`：633 passed，6 skipped
- `scripts/bench.ts` 不在 `tsconfig.json` 的 `src/**/*` 覆盖范围；其 LSP Node 类型警告为既有推断诊断，不属于本 Task。
