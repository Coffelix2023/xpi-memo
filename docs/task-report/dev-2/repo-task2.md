# Task 2 Report — Deletion Boundary

## 目的

让 `xpi_memo_forget` 在无法证明 T1 memory ID 对应完整记录时 fail-closed，避免语义搜索、全库扫描或不稳定的上游行为触发破坏性删除；在精确 ID 能力可用时，保证 recovery、delete 和 L0/audit 结果按顺序闭合。

## 实现

- 为 `MnemosyneAdapter` 增加可选的 `ExactMemoryReader` 能力契约。
- `createMnemosyneAdapter` 只有收到显式精确 ID reader 才暴露该能力；当前 Mnemosyne CLI 默认不暴露它，不再把 `recall <id>` 伪装成主键读取。
- 新增 `src/deletion-lifecycle.ts`：
  - project bank 优先，default bank fallback；
  - exact-ID 能力缺失返回固定 reason `upstream-exact-id-read-unavailable`，不调用 `recall`、`export`、SQLite 或 `delete`；
  - 先写 recovery，再尝试 delete；
  - recovery/delete 失败写 bounded failure 状态，不写 confirmed deletion；
  - 成功后写带 `operationId` 和实际 bank 的 `memory_deleted` 事件及 bounded audit。
- `xpi_memo_forget` 接入 deletion lifecycle，明确区分 deleted、failed、unresolved。
- audit metadata 允许保存 `operationId`，不保存记忆正文；confirmed deletion 使用独立 `deletion` action。
- 更新 `docs/GUIDE.md` 和 `docs/COMPATIBILITY.md`，说明当前上游限制、手工 recovery 与删除边界。

## 特点与边界

- 当前 CLI adapter 的 `forget` 保持不可用是有意设计：没有稳定精确 ID API 时不猜测、不删除。
- 未来上游提供稳定命令后，只需注入显式 `ExactMemoryReader` adapter 能力；删除 coordinator 保持 bank probing、recovery-before-delete 和生命周期语义。
- 手工 recovery 会产生新 memory ID，不承诺恢复原 ID。

## 验证

- `pnpm typecheck`
- `pnpm exec vitest run src/deletion-lifecycle.test.ts src/index.test.ts src/operations.test.ts --passWithNoTests`
- `pnpm -w run lint`、`pnpm typecheck`、完整 `pnpm test`：634 passed，6 skipped。
- `pnpm exec vitest run src/deletion-lifecycle.test.ts src/index.test.ts src/operations.test.ts src/audit.test.ts --passWithNoTests`：87 passed。
- 集成测试的真实 Mnemosyne forget 断言已同步为当前 `upstream-exact-id-read-unavailable` fail-closed 限制；启用 `XPI_MEMO_RUN_MNEMOSYNE_INTEGRATION=1` 时不会承诺删除成功。
