## Context

`MEMORY.md` 当前由 `src/markdown-export/memory-generator.ts` 折叠 L0 事件生成：条目来自 `t1_memory_write`，删除靠 `memory_deleted` 事件按 `memoryId` 关联剔除。正确性依赖每条写入/删除路径都发出正确事件。见 `proposal.md - Why`。

实施前已核实的上游事实（mnemosyne 3.15.1）：

| 事实 | 位置 |
| --- | --- |
| 有 `export [file.json] [--include-sync-events]`，输出 schema v1.3，含 working / episodic / legacy / triples / annotations / canonical facts，**以及 episodic_embeddings** | `cli.py` 的 `cmd_export`、`core/memory.py` 的 `export_to_file` |
| `Memory.get_all_memories()` 存在，但按 `session_id = ? OR scope = 'global'` 过滤，**不是 bank 全量状态** | `core/memory.py` |
| 没有"列出整个 bank 当前状态"的轻量 CLI 命令 | `COMMANDS` 字典 |
| bank 是独立数据库文件，由 `MNEMOSYNE_BANK` 选择，因此 export 天然是 bank 级的 | `cli.py` 的 `_resolve_bank_name` |

**关键约束（决定本设计的形状）**：bank 行只携带 `id / content / source / timestamp / session_id / importance`，**不携带 xpi-memo 的 7 类 kind 与 scope**。kind 与 scope 是 xpi-memo 自己的路由产物，只存在于 L0 事件的 payload 中。因此"条目集合来自 bank、注解来自 L0"不是折中方案，而是唯一可行的组合：状态维度在 bank，分类与溯源维度在 L0。

## Goals / Non-Goals

**Goals:**

- 让 `MEMORY.md` 的条目集合反映 bank 当前状态，使删除、supersede 与外部写入无需专门的投影逻辑即自然正确。
- 保留全部既有可观测行为：原子替换、投影失败保持待重试、daily 与 MEMORY 进度独立、稳定排序、重复标记、来源可追溯。
- 显式记录"投影层读取 bank 状态"与"forget 不使用全库扫描"是两条不同边界，避免后续误读为自相矛盾。

**Non-Goals:**

- 不把 Markdown 整体翻转为真相源；bank 仍是状态存储，L0 仍是事件真源。
- 不改动 bank 存储布局、SQLite schema 或 L0 事件格式。
- 不改动 daily 增量导出路径与其游标。
- 不解决 `forget` 的删除能力问题（由 `memory-forget-exact-id` 负责）。
- 不引入向量检索、新运行时依赖或新配置项。

## Decisions

### D1: 状态读取原语选用 `mnemosyne export`，只解析 memory 两段

投影通过官方 `export` 读取 bank 当前状态，只解析 `working_memory` 与 `episodic_memory`，丢弃 embeddings、triples、annotations、canonical facts。

- **替代方案 A：`get_all_memories()`（Python core）**。否决。它按 `session_id OR scope='global'` 过滤，返回的不是银行状态，且需要驱动 Python 环境。
- **替代方案 B：语义 `recall` 枚举全量**。否决。相关性检索不是状态枚举，无法保证完备。
- **替代方案 C：只读 SQLite**。不默认采用，保留为 D1 的预案。
- **替代方案 D：等待上游提供有界的状态列举命令**。否决。会让本变更无限期停摆，且当前 export 已可用。

有界化要求：固定超时、解析负载大小上限、失败即进入待重试，绝不产出部分或空投影。**export 会写文件，因此必须写入临时路径并在完成后清理**，不得污染数据根。

**D1 预案（预先决定，不是开放问题）**：若实测单次 export 的耗时超过 5 秒，或需要解析的两段负载超过 5 MB，则切换为只读 SQLite 固定查询，并在本 design 记录这次反转的理由。该切换不改变 spec 的"读取 bank 当前状态"语义，因为 spec 不指定读取原语。

### D2: 以 bank 行 ID 为主键做双源合并

投影条目以 bank 行的 memory ID 为主键；L0 的 `t1_memory_write` 事件提供 kind、scope、确认时间、session 与 event position。关联不到 L0 的行仍然投影，归入显式的未分类区并标注来源缺失。

- **替代方案：以 L0 的 `session@position` 为导出 ID（现状）**。否决。它与 state 语义冲突——L0 事件的存在不保证 bank 行仍存在。
- **替代方案：猜测 kind**（例如按内容分类）。否决。属于伪造 provenance。

### D3: 排序键固定为 (section, L0 position, memory ID)

同一 section 内，能关联到 L0 的条目按 event position 升序；关联不到的条目按其 memory ID 稳定升序置于该 section 末尾。相同状态与相同注解输入必须产出逐字节相同的文件。

### D4: 保持现有重复标记行为，并修正主 spec 的旧口径

同 bank 同 kind 的精确重复保留在投影中并标注 `supersededBy`，近重复只报告，bank 永不被重写。主 spec 中 `MEMORY.md for long-term facts` 的旧场景写的是"older duplicates are omitted"，与实现和本设计冲突，在本变更的 delta 中一并修正——实施时发现的口径漂移不应留给下一次。

### D5: bank 读取失败保留上一次成功投影

读取失败、超时或解析失败时，不得写出空投影或部分投影；`MEMORY.md` 保持上一次成功内容，投影状态保持待重试。daily 进度不受影响。

### D6: 不保留 L0 折叠路径作为运行时降级

切换后删除旧的 L0 折叠实现，避免维护两条语义不同的投影路径。回滚通过 git revert 完成，不回退数据。

- **替代方案：双路径 + 开关**。否决。用配置项掩盖语义选择，会让两套正确性标准长期共存。

## Risks / Trade-offs

- **`export` 体积偏大（含 embeddings）** → 只解析两段；上限保护；D1 预案可在实测后切换原语。
- **`export` 写临时文件** → 写入临时路径并清理；失败时不得留下部分文件。
- **首次切换产生一次全量重写，diff 较大** → 排序键固定为可复现定义，重写只在首次发生；在变更说明中标注。
- **bank 行缺 kind 导致未分类区出现** → 这是如实表达"状态里有、溯源缺"的正确结果，不是缺陷；同时它使外部直接写入的记忆可见，而不是被静默丢弃。
- **边界误读**：后续读者可能认为"投影读取全库"与既有"forget 不得全库扫描"的决定矛盾 → 在本 design、`ARCHITECTURE.md` 与 spec 三处显式区分两条边界。

## Migration Plan

1. 切换投影数据源，首次运行执行一次全量重建。
2. 验证：写 A → 导出 → 删 A → 导出，`MEMORY.md` 不含 A；手工编辑后再次导出仍正确。
3. 回滚：revert 提交并从 L0 重新生成（旧折叠实现随回滚恢复）。

不涉及数据迁移，不改变 `daily/` 与 `export-state.json` 的语义。

## Open Questions

无。`export` 输出对 `superseded_by` 等字段的暴露程度由实施时的首次勘察确定，属于双源合并的实现细节，不改变本设计的数据源选择或任务拆分。
