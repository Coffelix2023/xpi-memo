## ADDED Requirements

### Requirement: Bank rows without L0 provenance MUST still be projected

MEMORY.md 的条目集合 MUST 来自 bank 当前状态。当某条 bank 记录没有可对应的 L0 provenance（例如由外部工具直接写入 bank）时，系统 MUST 仍然投影该条目，并 MUST 标注其来源缺失，而不是静默丢弃或猜测来源。

#### Scenario: Bank row has no matching L0 event

- **WHEN** bank 当前状态包含一条没有可对应 L0 write 事件的记忆
- **THEN** MEMORY.md MUST 包含该条目
- **AND THEN** 该条目 MUST 被标注为来源缺失
- **AND THEN** 系统 MUST NOT 为该条目伪造 L0 provenance

#### Scenario: Bank read is bounded and does not mutate

- **WHEN** 投影需要读取 bank 当前状态
- **THEN** 读取 MUST 是有界的，且 MUST NOT 修改 bank、写回 SQLite 或触发 consolidation
- **AND THEN** 读取失败 MUST 使投影进入待重试状态，而不是产出部分或空投影

## MODIFIED Requirements

### Requirement: MEMORY.md for long-term facts

The system SHALL generate a MEMORY.md file that projects the current long-term memory state: decisions, preferences, constraints, and gotchas that exist in the bank right now. The entry set MUST come from the bank's current state, and the L0 event history MUST be used only to annotate provenance, position, and stable ordering.

#### Scenario: MEMORY.md structure

- **WHEN** exporting long-term memories
- **THEN** MEMORY.md includes sections for decisions, preferences, constraints
- **AND** each entry includes its confirming timestamp and a source reference when one is available

#### Scenario: MEMORY.md updates incrementally

- **WHEN** a confirmed T1 memory is present in the bank's current state
- **THEN** MEMORY.md is updated to include the new entry
- **AND** existing entries remain unchanged

#### Scenario: Duplicate prevention

- **WHEN** the same content appears more than once in the same bank and kind
- **THEN** the duplicates MUST remain visible and be marked with a superseded reference
- **AND** the result MUST be deterministic across repeated exports
- **AND** the bank MUST NOT be rewritten or deduplicated as a side effect of export

#### Scenario: Entry set follows bank state

- **WHEN** a memory exists in the bank's current state
- **THEN** MEMORY.md MUST contain that entry
- **AND WHEN** a memory no longer exists in the bank's current state
- **THEN** MEMORY.md MUST NOT contain it, without requiring a matching deletion event

#### Scenario: L0 annotation is optional per entry

- **WHEN** an entry has no usable L0 provenance
- **THEN** the entry MUST still appear with a bounded source-missing marker
- **AND** the export MUST NOT fail for that reason

### Requirement: MEMORY.md updates incrementally

当 bank 当前状态发生变化，或新增 confirmed deletion 需要更新长期记忆视图时，系统 MUST 重新读取 bank 当前状态并以原子方式替换 MEMORY.md 投影。增量状态 MAY 用于避免重复追加 daily 日志，但不得用本次事件子集覆盖完整 MEMORY.md。

#### Scenario: New memory does not erase existing entries

- **WHEN** MEMORY.md 已包含 memory A，之后 memory B 成功确认并触发 export
- **THEN** MEMORY.md MUST 包含 A 和 B
- **AND THEN** A 的内容、稳定排序和来源引用 MUST 保持

#### Scenario: Deletion removes only confirmed target

- **WHEN** memory A 已从 bank 删除，其他 memory B 仍在 bank 当前状态中
- **THEN** 下一次 MEMORY.md 投影 MUST 移除 A
- **AND THEN** B MUST 保持

#### Scenario: Bank read failure leaves the previous projection intact

- **WHEN** 投影读取 bank 当前状态失败
- **THEN** 既有 MEMORY.md MUST 保持上一次成功的内容
- **AND THEN** 投影状态 MUST 保持待重试，下一次 export MUST 能重新处理
