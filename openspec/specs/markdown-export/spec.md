# markdown-export Specification

## Purpose

Derives human-readable, Git-versionable Markdown files from the L0 event log to provide data sovereignty, enabling users to inspect, edit, and own their memory data outside the application.

## Requirements

### Requirement: Markdown export from event log

The system SHALL derive Markdown files from the L0 event log without requiring the event log to be modified or the agent to be running.

#### Scenario: Export runs offline

- **WHEN** user invokes export command on a session log
- **THEN** Markdown files are generated from JSONL events
- **AND** no agent or LLM is required

#### Scenario: Export preserves event order

- **WHEN** exporting events to Markdown
- **THEN** entries appear in chronological order matching L0 positions
- **AND** no events are skipped or reordered

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

### Requirement: Daily activity logs

The system SHALL generate daily log files at `daily/YYYY-MM-DD.md` containing session activity for that calendar day.

#### Scenario: Daily log filename

- **WHEN** exporting events from 2024-03-15
- **THEN** file is created at daily/2024-03-15.md
- **AND** uses ISO 8601 date format

#### Scenario: Daily log content

- **WHEN** a day includes user prompts, tool calls, and confirmations
- **THEN** daily log includes timestamped entries for each
- **AND** entries are human-readable prose

#### Scenario: Multi-session day

- **WHEN** multiple sessions occur on the same day
- **THEN** all sessions contribute to the same daily/YYYY-MM-DD.md
- **AND** session boundaries are marked

#### Scenario: Empty day handling

- **WHEN** no sessions occurred on a given day
- **THEN** no daily file is created for that day

### Requirement: Handoff log on compaction

The system SHALL append a handoff entry to the current day's log when session context is compacted, preserving progress across context resets.

#### Scenario: Compaction triggers handoff

- **WHEN** session_before_compact event occurs
- **THEN** current session state is summarized in daily log
- **AND** includes active tasks, decisions, and context

#### Scenario: Handoff boundary markers

- **WHEN** handoff is written to daily log
- **THEN** entry is marked with "Handoff:" prefix
- **AND** includes session ID for traceability

### Requirement: Human-readable format

Markdown exports SHALL use natural language prose, not raw JSON payloads, making content accessible to non-technical users.

#### Scenario: Tool call representation

- **WHEN** exporting a tool_call event
- **THEN** entry reads "Called tool_name with argument_summary"
- **AND** avoids JSON dump in favor of prose

#### Scenario: Decision representation

- **WHEN** exporting a project_decision memory
- **THEN** entry includes decision title and reasoning
- **AND** formatted as readable paragraphs

### Requirement: Source traceability

Each Markdown entry SHALL include a reference to its source event in the L0 log, enabling bidirectional navigation.

#### Scenario: Event position reference

- **WHEN** exporting an L0 event
- **THEN** Markdown entry includes event position number
- **AND** position can be used to locate raw event in JSONL

#### Scenario: Session reference

- **WHEN** multiple sessions contribute to one daily log
- **THEN** each entry includes session ID
- **AND** session ID links back to specific L0 log file

### Requirement: Git-friendly format

Markdown files SHALL be structured for clean Git diffs, with stable ordering and minimal churn on updates.

#### Scenario: Append-only daily logs

- **WHEN** new events are exported to an existing daily log
- **THEN** new entries are appended to end of file
- **AND** existing entries are not reordered

#### Scenario: MEMORY.md stable sections

- **WHEN** MEMORY.md is updated
- **THEN** entries within each section maintain stable order
- **AND** diffs show only additions or modifications

### Requirement: Export configuration

The system SHALL allow users to configure export behavior including output directory, file naming, and content filters.

#### Scenario: Custom output directory

- **WHEN** user specifies export directory in config
- **THEN** Markdown files are written to that directory
- **AND** default is <dataDir>/markdown/

#### Scenario: Content filtering

- **WHEN** user configures "exclude tool results" filter
- **THEN** exported Markdown omits tool result details
- **AND** L0 log retains full payloads

#### Scenario: Privacy redaction

- **WHEN** user enables privacy mode
- **THEN** sensitive content (file paths, API keys) is redacted in Markdown
- **AND** redaction is marked with "[REDACTED]"

### Requirement: Manual export command

The system SHALL provide a command to manually trigger Markdown export from existing L0 logs.

#### Scenario: Export all sessions

- **WHEN** user runs export command without arguments
- **THEN** all session logs are exported to Markdown
- **AND** progress is reported

#### Scenario: Export specific session

- **WHEN** user runs export with session ID
- **THEN** only that session is exported
- **AND** existing Markdown for other sessions is unchanged

#### Scenario: Re-export overwrites

- **WHEN** exporting a session that was previously exported
- **THEN** new Markdown overwrites old files
- **AND** user is warned about overwrite

### Requirement: Automatic export on session end

The system SHALL optionally auto-export Markdown when a session ends, configurable via user settings. The export SHALL be initiated as background work that does not delay session shutdown or session switching; the session MUST NOT wait for export completion before becoming ready for the next session.

#### Scenario: Auto-export enabled

- **WHEN** session ends and auto-export is enabled
- **THEN** export is initiated and proceeds in the background
- **AND** session shutdown completes without waiting for export completion
- **AND** export errors are swallowed and do not surface as session errors

#### Scenario: Session switch is not delayed by export

- **WHEN** the user switches sessions (`/new`, `/resume`, or `/fork`) and the outgoing session has auto-export enabled
- **THEN** the switch completes without waiting for the outgoing session's Markdown export
- **AND** the export of the outgoing session still runs to completion if the process remains alive

#### Scenario: Early exit during background export

- **WHEN** the process exits while a background export from a previous session shutdown is still running
- **THEN** the session event log remains intact as the source of truth
- **AND** the next successful export converges to the correct Markdown state (no data loss)

#### Scenario: Auto-export disabled

- **WHEN** session ends and auto-export is disabled
- **THEN** no export occurs
- **AND** user must manually trigger export later

### Requirement: Export error handling

The system SHALL handle export failures gracefully without corrupting existing Markdown or blocking session operation.

#### Scenario: Disk full during export

- **WHEN** disk space runs out during Markdown export
- **THEN** partial file is deleted
- **AND** error is logged but session continues

#### Scenario: Write permission denied

- **WHEN** export directory is not writable
- **THEN** export fails with clear error message
- **AND** suggests alternative directory

#### Scenario: Corrupt event skipped

- **WHEN** L0 event cannot be parsed during export
- **THEN** event is skipped with warning in Markdown
- **AND** export continues with remaining events

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

### Requirement: Export progress MUST reflect projection success

导出进度 MUST 分别表达 daily 日志和 MEMORY.md 投影的完成状态。若 MEMORY.md 写入失败，系统 MUST 保留可重试状态，不得把相关 L0 memory events 标记为已完整投影。

#### Scenario: MEMORY.md write fails

- **WHEN** daily 日志写入成功但 MEMORY.md 原子替换失败
- **THEN** daily 日志可以报告成功
- **AND THEN** MEMORY projection MUST 报告失败或待重试
- **AND THEN** 后续 export MUST 能重新处理该投影

### Requirement: Automatic export covers confirmed deletion

系统 MUST 在 confirmed deletion 后调度 MEMORY.md 投影重建，并 MUST 把 T1 删除结果与投影结果作为两个可区分的状态暴露。

#### Scenario: Confirmed deletion schedules rebuild

- **WHEN** `xpi_memo_forget` 完成 confirmed deletion
- **THEN** 系统 MUST 调度一次 MEMORY.md 投影重建
- **AND THEN** 删除成功与投影失败 MUST 作为两个可区分的结果暴露

### Requirement: Legacy deletion correlation is explicit

系统 MUST 对缺少 backend memory ID 的历史写入采用保守兼容行为；没有可验证关联时不得根据正文猜测删除，并 MUST 暴露有界诊断。

#### Scenario: Legacy write remains without verified correlation

- **WHEN** 历史 T1 write event 没有 backend memory ID
- **THEN** export MUST 保留该条目，除非存在明确的可验证关联
- **AND THEN** export 或诊断 MUST 标记该条目无法由 deletion event 关联
