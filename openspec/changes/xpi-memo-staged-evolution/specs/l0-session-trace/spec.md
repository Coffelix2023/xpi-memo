## Purpose

Provides an append-only ordered event log that captures the complete execution history of a Pi session, enabling deterministic context reconstruction and serving as the source of truth for higher memory tiers.

## ADDED Requirements

### Requirement: Append-only event capture

The system SHALL record session events (user messages, assistant messages, tool calls, tool results, file changes, compaction events, lifecycle events) in an append-only JSONL file without mutating or deleting earlier events.

#### Scenario: Event persisted immediately
- **WHEN** a session event occurs (user prompt, tool call, etc.)
- **THEN** the event is appended to the session's JSONL log with an auto-incrementing position
- **AND** earlier events remain unchanged

#### Scenario: Multiple event types captured
- **WHEN** a session includes user messages, tool calls, and file edits
- **THEN** all event types appear in the log in chronological order
- **AND** each event includes a type field identifying its category

### Requirement: Event ordering

The system SHALL assign each event a monotonically increasing position number unique within its session.

#### Scenario: Ordered event stream
- **WHEN** events A, B, C occur in sequence
- **THEN** their positions satisfy position(A) < position(B) < position(C)

#### Scenario: Concurrent event ordering
- **WHEN** multiple events occur in rapid succession
- **THEN** each receives a unique position
- **AND** the order reflects actual occurrence sequence

### Requirement: Event payload structure

Each event SHALL include: event type, timestamp, position, and type-specific payload. The payload remains in the owning trace file.

#### Scenario: User message event
- **WHEN** user sends a prompt
- **THEN** event includes type="user_message", timestamp, position, content
- **AND** payload preserves original message text

#### Scenario: Tool call event
- **WHEN** agent invokes a tool
- **THEN** event includes type="tool_call", timestamp, position, toolName, arguments
- **AND** payload preserves structured arguments

#### Scenario: Tool result event
- **WHEN** tool execution completes
- **THEN** event includes type="tool_result", timestamp, position, toolCallId, output, status
- **AND** payload preserves full output

#### Scenario: Compaction event
- **WHEN** session context is compacted
- **THEN** event includes type="compaction", timestamp, position, foldedRange, summary
- **AND** folded event range is recorded but original events remain in log

### Requirement: Deterministic context derivation

The system SHALL provide a pure function that derives a model-visible context view from the event log using explicit rules (event type filtering, budget application, folding) without calling an LLM.

#### Scenario: Same input produces same output
- **WHEN** deriving context from the same event log with same policy and budget
- **THEN** the derived context is identical across multiple invocations

#### Scenario: Context policy filters events
- **WHEN** context policy excludes tool result details
- **THEN** derived view omits those payloads
- **AND** event log still contains full payloads

#### Scenario: Context budget applied
- **WHEN** event log exceeds context budget
- **THEN** older events are represented by folding markers
- **AND** recent events appear in full

### Requirement: Folding markers

When the derived view is compacted, the system SHALL insert folding markers that indicate a range of raw events is represented by a bounded summary, without removing the raw events from the log.

#### Scenario: Folding preserves raw events
- **WHEN** events 1-100 are folded into a summary
- **THEN** a folding marker references the range [1, 100]
- **AND** events 1-100 remain unchanged in the JSONL file

#### Scenario: Folding marker content
- **WHEN** a folding marker is created
- **THEN** it includes foldedStart, foldedEnd, summaryText
- **AND** summary is bounded (e.g., max 500 characters)

### Requirement: Session isolation

Each session SHALL have its own event log file, isolated from other sessions.

#### Scenario: Concurrent sessions
- **WHEN** multiple Pi sessions run simultaneously
- **THEN** each writes to a separate JSONL file
- **AND** events never intermix

#### Scenario: Session identification
- **WHEN** a session starts
- **THEN** a unique session ID is generated
- **AND** log file path includes the session ID

### Requirement: No automatic promotion to T1

The system SHALL NOT automatically promote folded content, tool output, or reasoning to T1 memory. Only content passing T1's provenance, evidence, scope, confidence, and confirmation rules may enter T1.

#### Scenario: Fold summary stays in L0
- **WHEN** session context is compacted with a summary
- **THEN** the fold summary remains in L0 log
- **AND** no T1 memory is written unless explicitly confirmed

#### Scenario: Tool output isolation
- **WHEN** a tool returns output
- **THEN** output is captured in L0
- **AND** no automatic T1 promotion occurs

### Requirement: Read-only event access

The system SHALL provide read access to historical events without modifying the log.

#### Scenario: Query events by range
- **WHEN** requesting events in position range [50, 100]
- **THEN** system returns events with positions 50-100 inclusive
- **AND** log file remains unchanged

#### Scenario: Query events by type
- **WHEN** filtering for tool_call events
- **THEN** system returns only events with type="tool_call"
- **AND** maintains original ordering

### Requirement: Graceful handling of missing or corrupt log

The system SHALL continue operating when a session log is missing or corrupt, logging the issue and starting a new log without blocking the session.

#### Scenario: Missing log file
- **WHEN** expected log file does not exist
- **THEN** system creates a new log and continues
- **AND** session is not blocked

#### Scenario: Corrupt log entry
- **WHEN** a log line cannot be parsed as JSON
- **THEN** system logs the error and skips the corrupt line
- **AND** continues reading subsequent lines
