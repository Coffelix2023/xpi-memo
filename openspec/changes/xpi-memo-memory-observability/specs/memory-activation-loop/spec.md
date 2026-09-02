## Purpose

This capability closes xpi-memo's activation gap: valuable user and project knowledge must enter governed memory without depending on perfect agent behavior, while recall remains bounded, relevant, and explainable across global, project, and session scope.

## ADDED Requirements

### Requirement: Explicit memory intent MUST enter a governed activation path
The system MUST detect explicit user intent to preserve a preference, workflow, project constraint, project decision, project gotcha, or bounded session context without requiring a separate manual memory-tool call.

#### Scenario: User states an explicit preference
- **WHEN** the user explicitly states a durable preference or workflow rule
- **THEN** the system MUST create a governed memory outcome for the appropriate global category
- **AND THEN** the outcome MUST retain the originating session and event provenance

#### Scenario: User states an explicit project decision
- **WHEN** the user explicitly confirms a project decision, constraint, or gotcha
- **THEN** the system MUST route it to the current project scope when a recognized project exists
- **AND THEN** the system MUST apply the existing candidate or storage governance for that category

#### Scenario: Ambiguous content is encountered
- **WHEN** content could map to more than one category or lacks enough scope context
- **THEN** the system MUST skip direct durable storage or create a governed candidate
- **AND THEN** it MUST NOT guess a category or silently place project content in the global scope

### Requirement: Capture evidence MUST distinguish user statements from agent-derived content
The system MUST preserve the difference between explicit user statements, verified repository or tool evidence, and model-derived suggestions.

#### Scenario: Agent proposes a memory
- **WHEN** a memory originates from an agent tool input, model inference, or offline extraction
- **THEN** the system MUST NOT label it as an explicit user statement without a linked user event that supports that claim
- **AND THEN** the evidence type and source reference MUST remain visible to governance and diagnostics

#### Scenario: Sensitive content is encountered
- **WHEN** explicit or derived content contains secrets, credentials, tokens, or prohibited personal data
- **THEN** the system MUST prevent the content from entering durable memory, candidates, or diagnostic body output
- **AND THEN** the system MUST retain only bounded non-sensitive rejection metadata where required for diagnosis

### Requirement: Offline extraction MUST be gated and non-blocking
The system MUST support an optional offline extraction path that runs at a bounded lifecycle point such as compaction or session shutdown, without blocking the active coding interaction.

#### Scenario: Offline extraction is enabled
- **WHEN** a bounded offline extraction run is enabled
- **THEN** the system MUST produce a bounded set of proposed memories with category, confidence, evidence type, and source references
- **AND THEN** high-confidence low-risk results MAY be stored while other results MUST follow the candidate lifecycle

#### Scenario: Offline extraction is disabled or unavailable
- **WHEN** the extraction feature is disabled, unavailable, or fails
- **THEN** explicit deterministic capture MUST continue to work
- **AND THEN** the failure MUST be observable without failing the active session

#### Scenario: Extraction budget is exhausted
- **WHEN** the configured per-session extraction or output budget is reached
- **THEN** the system MUST stop further extraction for that lifecycle event
- **AND THEN** it MUST record bounded diagnostic counts rather than processing unbounded history

### Requirement: Pending candidates MUST have a visible, low-noise digest
The system MUST expose pending candidates through the existing review flow and provide a concise reminder when the backlog requires attention.

#### Scenario: Pending candidates exist at session start
- **WHEN** a new session starts and pending candidates exist
- **THEN** the system MUST make the backlog count and review command or surface discoverable
- **AND THEN** the reminder MUST NOT block the user or open a mandatory confirmation dialog

#### Scenario: Candidate actions are applied
- **WHEN** a user stores, defers, or rejects a candidate
- **THEN** the system MUST preserve the existing lifecycle semantics
- **AND THEN** the resulting state MUST be reflected in counts and provenance-safe diagnostics

### Requirement: Recall MUST separate memory roles and enforce bounded ranking
The system MUST distinguish standing memory from contextual memory and MUST apply relevance, query intent, recency, scope priority, diversity, deduplication, and output budgets before automatic injection.

#### Scenario: A prompt requests project context
- **WHEN** the system evaluates memory for a prompt about the current project
- **THEN** project contextual memory and relevant standing memory MUST be ranked separately before selection
- **AND THEN** unrelated global or other-project memory MUST be excluded

#### Scenario: A prompt requests user preferences
- **WHEN** the system evaluates memory for a prompt about the user's general preferences or workflow
- **THEN** global standing memory MUST receive the appropriate scope and intent priority
- **AND THEN** project-only context MUST not crowd out relevant global preferences without a stronger relevance signal

#### Scenario: Recall results exceed the budget
- **WHEN** eligible results exceed the configured item or character budget
- **THEN** the system MUST select a bounded diverse subset and omit the remainder
- **AND THEN** an empty result MUST omit the memory block rather than injecting an empty or raw trace block

#### Scenario: A memory is stale or superseded
- **WHEN** a memory is marked superseded or has fallen below the configured freshness contribution
- **THEN** it MUST not dominate automatic recall
- **AND THEN** the ranking decision MUST remain diagnosable through bounded metrics

### Requirement: Activation and recall health MUST be measurable
The system MUST expose counts and outcomes that allow an operator to distinguish no capture, candidate accumulation, failed writes, empty recall, successful recall, and automatic injection.

#### Scenario: Health status is requested
- **WHEN** the user requests xpi-memo status or doctor information
- **THEN** the system MUST report bounded counts for explicit capture, extraction proposals, candidate creation, direct storage, confirmation, rejection, recall execution, recall hits, and injection
- **AND THEN** the report MUST identify the relevant global and current-project scope without exposing memory bodies

#### Scenario: Recall backend ran with no hits
- **WHEN** a recall backend was queried but returned no eligible memory
- **THEN** the system MUST distinguish that outcome from a recall that did not execute
- **AND THEN** it MUST report the queried scope or bank in the diagnostic evidence
