# Upstream follow-ups (Mnemosyne)

本文件记录 xpi-memo 对上游 Mnemosyne 的请求与观察，**不代表 xpi-memo 已实现或已依赖**，也不属于提出它的那次 change 的交付范围。

## FU-1: 精确按 ID 读取命令（`mnemosyne get <id>`）

- **状态**: 已记录，未实施。**本项明确 out of scope（超出范围）于 `openspec/changes/memory-forget-exact-id`** —— 该 change 只做“能力缺失时直接删除 + 能力可用时先快照”的运行时分流，不向上游提交补丁、不驱动上游 Python 环境、不引入新的上游依赖。
- **观察到的版本**: mnemosyne-memory 3.15.1（`/Users/felix/.local/share/uv/tools/mnemosyne-memory/lib/python3.12/site-packages/mnemosyne_memory-3.15.1.dist-info/METADATA`）。
- **现状**:
  - CLI 的 `COMMANDS` 字典（`.../site-packages/mnemosyne/cli.py:1621`）只有 `store/recall/update/delete/stats/export/bank/...`，没有按主键读取一条记忆的子命令；`mnemosyne get <id>` 返回 `Unknown command: get` 并退出码 2。
  - Python core 已有精确读取能力：`.../site-packages/mnemosyne/core/memory.py:552` 的 `Memory.get(memory_id)` 与 `.../core/beam.py:4265` 的 `BeamMemory.get`；只是没有在 CLI 上暴露。
  - `mnemosyne delete <id>` 自身不做预读，对不存在的 ID 返回 `Memory not found: <id>`（退出码 1），所以删除并不依赖精确读取。
- **请求内容**:
  1. 暴露一个按主键读取单条记忆的子命令（例如 `mnemosyne get <id> [--json]`），输出包含 `id`、`content`、`source`、`timestamp`。
  2. 输出必须是机器可判定的：存在时给出结构化记录，不存在时给出稳定、可解析的 not-found（而不是仅有人类可读的散文）。
  3. 明确该命令的范围语义：`BeamMemory.get` 目前的 SQL 带 `session_id = ? OR scope = 'global'` 过滤，跨 bank / 跨会话的精确读取行为需要在文档里写清楚。
- **xpi-memo 侧的接入方式**（已就绪，无需上游配合改造）:
  - `src/banks.ts` 的 `probeExactIdReadCapability` 在运行时探测该能力，结论按进程缓存，并出现在 `/xpi-memo-status` 的 `exactIdRead` 字段。
  - 一旦探测到“子命令存在且输出可解析”（结构化记录或结构化 not-found 都算），`forget` 会自动恢复“先写 recovery 快照、再删除”的路径；候选子命令名集中在 `EXACT_ID_READ_COMMANDS` 常量里，届时按实际命令名扩展即可。
  - 探测失败的方向始终是“能力不可用 → 直接删除”，绝不会因为探测不确定而拒绝删除。
- **为什么不等上游**: 记忆系统的底线是用户能删。把“无法写快照”和“无法删除”绑定，会让所有 bank 的删除功能不可用；详见 `openspec/changes/memory-forget-exact-id/proposal.md`。
