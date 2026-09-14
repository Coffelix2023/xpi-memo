# Task 3 Report — MEMORY.md Projection

## 目的

让 `MEMORY.md` 成为完整 L0（会话级不可变事件日志）历史的确定性派生投影，避免 daily 增量导出覆盖旧记忆，并让确认删除、投影失败和重试状态可区分。

## 实现

- 将 daily 增量读取与 MEMORY 全量重建分离：daily 使用独立的 `export-state.json` 游标，MEMORY 在 memory-affecting event、`force` 或待重试状态下调用每个可读 session 的 `readAll()`。
- 仅把 `t1_memory_write` 作为当前记忆写入来源，把 `memory_deleted` 的明确 `memoryId` 作为删除依据；不会按正文猜测 legacy 删除目标。
- 历史 write 缺少 `memoryId` 时保留条目，并产生 bounded diagnostic：`legacy-memory-id-unavailable`。
- 新增独立 `memory-projection-state.json`，保存 `complete`、`pending` 或 `failed`；MEMORY 原子替换失败时不影响 daily cursor，下一次 export 自动重试。
- confirmed deletion 后调用独立的 MEMORY 全量投影；工具结果同时表达 T1 deletion 和 MEMORY projection，投影失败不会伪造 T1 删除失败。
- 保留现有 section 顺序、事件位置排序、duplicate `supersededBy` 标记、session/position source traceability、privacy redaction 与 corrupt-event daily warning。

## 特点与边界

- 正确性优先于全量扫描性能；没有新增 checkpoint、缓存或第二套 Markdown 真源。
- daily 日志是增量活动记录，`MEMORY.md` 是完整 L0 历史上的当前记忆视图，两者状态不可互相替代。
- unresolved lifecycle 和上游精确 ID 能力限制仍由 task 2 的生命周期/诊断负责；本 task 不实现 Mnemosyne 精确 ID API。
- 既有 `AGENTS.md`、`mise.toml` 工作区改动保持不变。

## 验证

- `pnpm typecheck`
- 定向 Biome：`src/index.ts`、`src/markdown-export/exporter.ts`、相关测试文件通过。
- 目标测试：`src/markdown-export/exporter.test.ts`、`src/markdown-export/generators.test.ts`、`src/deletion-lifecycle.test.ts`、`src/index.test.ts`、`src/staged-evolution.integration.test.ts`：95 passed。
- 新增覆盖：A→B 增量投影保留 A/B、confirmed deletion 投影、legacy 无 ID 诊断、daily 成功且 MEMORY 失败后的重试、删除后投影结果区分。
