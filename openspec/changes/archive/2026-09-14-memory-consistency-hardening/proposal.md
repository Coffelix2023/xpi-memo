## Why

xpi-memo 的 T1 backend、L0 会话事件、audit 和 Markdown 投影是独立存储。当前 governed write 在 T1 成功后才追加 L0 事件，L0 写入失败会留下无法重建的孤儿 T1 记录；删除路径又依赖语义 `recall` 模拟精确 ID 查询，导致有效记忆无法完成 recovery 与删除。普通增量 export 还会用新事件重写完整 `MEMORY.md`，造成旧记忆消失或删除状态陈旧。

本 change 建立失败可识别、可重放的写入/删除生命周期，并把 `MEMORY.md` 明确为可从完整 L0 历史重建的派生投影。Mnemosyne 当前没有稳定的精确按 ID 读取命令，因此本 change 不引入 export 扫描、直接 SQLite 访问或其他 workaround，而是让该限制显式、可诊断。

## What Changes

- 增加 T1 写入和删除的 failure-aware lifecycle 语义，区分请求、成功、失败和未决状态，并使用 operation ID 关联跨层事件。
- 统一直接写入、候选确认和离线提取的生命周期记录，避免某条写入路径仍使用不可恢复的 best-effort 记录。
- 将 `MEMORY.md` 定义为完整 L0 历史上的确定性重建结果；daily 日志继续使用独立的增量导出路径。
- 分离 daily export cursor 与 MEMORY projection 状态；MEMORY 投影失败时不得把对应状态标记为已完成。
- 成功删除后触发 MEMORY 投影重建；缺少 `memoryId` 的历史事件保持可见并报告无法关联，不按正文猜测删除。
- 在 Mnemosyne 提供稳定精确 ID 读取能力前，`forget` 不使用语义 `recall`、全库 `export` 扫描或直接 SQLite 访问，并返回有界、明确的上游能力限制。
- 增加增量导出、删除可见性、投影失败重试、backend 失败和损坏事件处理的行为测试，并更新当前限制文档。

## Capabilities

### New Capabilities

- `memory-consistency`: 定义 T1、L0、删除 recovery 和 Markdown 派生投影之间的 failure-aware 一致性与重建契约。

### Modified Capabilities

- `l0-session-trace`: 增加 governed memory lifecycle 事件的可重放、不可变和关联要求。
- `t1-governance`: 让成功、失败和未决的 T1 写入结果具有明确的 L0/audit 语义。
- `memory-operation-closure`: 明确精确 ID 读取是删除 recovery 的前置能力；上游能力缺失时不得伪造精确查询或声称删除成功。
- `markdown-export`: 将 MEMORY.md 从“仅增量事件投影”调整为可重建的当前投影，并定义游标与失败行为。

## Impact

- 运行时路径：`src/index.ts`、`src/operations.ts`、`src/candidate-lifecycle.ts`、`src/memory-activation.ts`、`src/offline-extraction.ts`。
- L0 契约与实现：`src/l0/types.ts`、`src/l0/*` 及相关测试。
- 导出实现与测试：`src/markdown-export/*`。
- 删除 recovery、状态诊断和相关用户文档。
- 不新增运行时依赖，不耦合 Mnemosyne 数据库 schema，不修改 `xpi-memo-ui-visual-layer.bak`，不决定 L0 凭证原文保留策略。
