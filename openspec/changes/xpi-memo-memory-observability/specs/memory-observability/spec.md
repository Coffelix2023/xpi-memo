## Purpose

This capability defines the memory-state behavior that must exist behind xpi-memo's user-facing surfaces. It makes memory observable to humans, improves how memory enters the system, and keeps recall understandable through scope, provenance, lifecycle, and ranking rules.

## ADDED Requirements

### Requirement: Memory state MUST be human-readable
The system MUST expose memory items through human-readable labels that describe the memory's meaning, not only its internal kind.

#### Scenario: User inspects stored memories
- **WHEN** a user inspects stored memories in the console or status surface
- **THEN** each item MUST display a human-readable label
- **AND THEN** the item MUST make its scope and lifecycle state understandable

#### Scenario: Label mapping is consistent
- **WHEN** the system renders the same memory in different visual surfaces
- **THEN** the human-readable label MUST be consistent
- **AND THEN** the mapping MUST remain deterministic

### Requirement: Memory visibility MUST include scope, trust, and provenance
The system MUST show the memory scope, trust or confirmation state, and provenance summary for visible memory items without exposing sensitive raw body text as the default presentation.

#### Scenario: Candidate review card is rendered
- **WHEN** a candidate memory is shown for review
- **THEN** the view MUST show the target scope, candidate state, and provenance summary
- **AND THEN** the view MUST not require the user to infer those details from internal identifiers

#### Scenario: Diagnostic view shows counts
- **WHEN** the user opens a diagnostic or status view
- **THEN** the system MUST show useful counts for stored, pending, rejected, and recall-related states
- **AND THEN** the view MUST remain readable without revealing full sensitive memory bodies

### Requirement: Candidate backlog MUST be visible to the user
The system MUST surface pending review work so that candidate memories are not hidden in an invisible queue.

#### Scenario: Pending queue exists
- **WHEN** pending candidates exist
- **THEN** the system MUST provide a visible summary of the backlog
- **AND THEN** the user MUST be able to reach the pending items from the primary console flow

#### Scenario: Backlog digest is shown
- **WHEN** the backlog exceeds the lightweight visible summary threshold
- **THEN** the system MUST still surface that pending review work exists
- **AND THEN** the summary MUST be concise enough to fit into a routine startup or review flow

### Requirement: Explicit memory intent MUST be captured deterministically
The system MUST capture explicit user memory intent through a deterministic activation path that does not depend on the agent remembering to call memory capture at the right moment.

#### Scenario: User states a durable preference
- **WHEN** the user states a durable preference, workflow, or decision explicitly
- **THEN** the system MUST be able to route that content into the memory activation flow
- **AND THEN** the flow MUST produce a memory outcome or a candidate outcome

#### Scenario: Activation does not require guesswork
- **WHEN** the system processes explicit memory intent
- **THEN** it MUST not require ambiguous agent-side inference to decide that the content belongs in memory
- **AND THEN** the resulting state MUST be explainable from provenance

### Requirement: Offline extraction MAY enrich memory capture when gated
The system MUST support a gated offline extraction path that can enrich memory capture from session context, but the path MUST remain optional and MUST NOT be required for core capture.

#### Scenario: Extraction path is enabled
- **WHEN** the gated extraction path is enabled
- **THEN** the system MUST be able to propose additional candidate memories from session context
- **AND THEN** the path MUST preserve provenance and confidence information

#### Scenario: Extraction path is disabled
- **WHEN** the gated extraction path is disabled
- **THEN** the system MUST continue to support explicit deterministic capture
- **AND THEN** no core memory behavior may depend on the extraction path being present

### Requirement: Recall MUST respect standing and contextual memory separation
The system MUST distinguish standing memory from contextual memory during recall and injection.

#### Scenario: Recall runs for a new prompt
- **WHEN** the system evaluates memory for injection into a prompt
- **THEN** it MUST treat long-lived standing memory separately from contextual memory
- **AND THEN** the system MUST apply budget limits before injection

#### Scenario: Recall ranking is computed
- **WHEN** the system ranks candidate memories for recall
- **THEN** it MUST consider relevance, intent, recency, scope priority, and diversity or dedupe constraints
- **AND THEN** stale or superseded memory MUST not dominate the injected context

### Requirement: Recall and observability MUST remain provenance-safe
The system MUST expose enough observability to explain decisions while avoiding raw sensitive body leakage in default diagnostic output.

#### Scenario: Diagnostic output is generated
- **WHEN** the system emits a status or doctor view
- **THEN** the output MUST include counts, kinds, scope, and provenance summaries
- **AND THEN** the output MUST not require dumping full memory bodies by default


### Requirement: Terminal and rich surfaces MUST consume one read-only memory contract
The terminal console and optional rich status surface MUST consume the same `MemoryStatus`, `ObservabilitySnapshot`, and canonical T1 taxonomy values. Neither surface may become a source of truth or persist UI-specific memory state.

#### Scenario: Both surfaces inspect the same status
- **WHEN** the same status is rendered in the terminal console and rich status surface
- **THEN** both surfaces MUST receive the same labels, scope, trust-state, lifecycle, provenance summaries, and bounded counts
- **AND THEN** neither surface MUST write memory bodies, candidates, audit records, or L0 events as part of rendering
#### Scenario: Traceability is needed
- **WHEN** a user or operator needs to understand why a memory exists
- **THEN** the system MUST provide a path back to its source event or review state
- **AND THEN** the traceability MUST remain bounded and readable
