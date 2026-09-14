# Task 4：可观测性与兼容性

## 目的

让跨层生命周期的不确定状态可诊断，并明确新旧 L0 事件的迁移与回滚边界；不泄漏记忆正文，也不改变非目标能力。

## 完成内容

- 在 `src/t1-lifecycle.ts` 增加 body-free、bounded lifecycle diagnostics：暴露 `operationId`、`status`、`reason`、`scope`、`bank`、`kind`，最多返回 20 条并保留总数。
- request-only lifecycle 明确标记为 `unresolved` / `no-terminal-event`；失败事件保留 bounded failure reason。
- 在 `/xpi-memo-status` 的 `MemoryStatus.consistency` 中接入所有 session 的 lifecycle diagnostics 与 `memory-projection-state.json` 状态（`complete`、`pending`、`failed`、`unknown`）。
- 增加状态输出测试，验证 operation ID、reason、scope/bank 元数据存在，memory body 不会进入诊断。
- 增加历史 L0 fixture replay 测试，验证没有 `operationId` 的 legacy write/delete 事件仍可读取，不产生伪造关联。
- 在 `docs/COMPATIBILITY.md` 记录新增事件类型、旧 reader 兼容行为，以及回滚前必须完成导出并停止写入新 lifecycle events 的边界。
- 使用差异检查和相关 L0、recall policy、content policy、candidate governance 测试确认非目标行为未改变；`xpi-memo-ui-visual-layer.bak` 未被修改。

## 验证

- `pnpm exec vitest run src/l0/l0-integration.test.ts src/l0/event-log.test.ts src/recall-policy-integration.test.ts src/memory-activation.test.ts src/candidate-lifecycle.test.ts src/activation-loop.integration.test.ts --passWithNoTests`：57 passed。
- `pnpm exec vitest run src/t1-lifecycle.test.ts src/status.test.ts src/markdown-export/exporter.test.ts src/markdown-export/generators.test.ts --passWithNoTests`：31 passed。
- `pnpm typecheck`：通过。
- `pnpm -w run lint`：通过。
- `git diff --check`：通过。

## 边界

Mnemosyne 当前仍没有稳定的精确 ID 读取命令；`forget` 继续 fail-closed，不使用 semantic recall、全库 export 扫描或直接 SQLite 访问作为 workaround。
