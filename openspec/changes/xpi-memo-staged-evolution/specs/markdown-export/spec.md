## Purpose

Derives human-readable, Git-versionable Markdown files from the L0 event log to provide data sovereignty, enabling users to inspect, edit, and own their memory data outside the application.

## ADDED Requirements

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

The system SHALL generate a MEMORY.md file containing long-term decisions, preferences, constraints, and gotchas extracted from confirmed T1 memories and session history.

#### Scenario: MEMORY.md structure
- **WHEN** exporting long-term memories
- **THEN** MEMORY.md includes sections for decisions, preferences, constraints
- **AND** each entry includes timestamp and source reference

#### Scenario: MEMORY.md updates incrementally
- **WHEN** new confirmed T1 memory is written
- **THEN** MEMORY.md is updated with the new entry
- **AND** existing entries remain unchanged

#### Scenario: Duplicate prevention
- **WHEN** same memory content appears multiple times
- **THEN** only the latest version appears in MEMORY.md
- **AND** older duplicates are omitted

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

The system SHALL optionally auto-export Markdown when a session ends, configurable via user settings.

#### Scenario: Auto-export enabled
- **WHEN** session ends and auto-export is enabled
- **THEN** session is exported to Markdown before shutdown
- **AND** errors do not block session shutdown

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
