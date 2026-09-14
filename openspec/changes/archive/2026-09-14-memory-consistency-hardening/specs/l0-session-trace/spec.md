## ADDED Requirements

### Requirement: Governed memory lifecycle events are append-only and correlated

L0 MUST record governed T1 operation lifecycle events without mutating earlier events. Related request, commit, failure and unresolved records MUST carry a stable operation correlation value so a reader can reconstruct the operation outcome.

#### Scenario: Lifecycle events preserve history

- **WHEN** a governed write or delete changes state
- **THEN** the system appends a new lifecycle event
- **AND THEN** earlier L0 events remain unchanged
- **AND THEN** events retain monotonically increasing session positions

#### Scenario: Lifecycle outcome is reconstructed

- **WHEN** a reader processes lifecycle events for one operation
- **THEN** it can distinguish requested, committed, failed and unresolved outcomes
- **AND THEN** an incomplete lifecycle MUST NOT be interpreted as a confirmed success

### Requirement: Lifecycle event payloads remain bounded and replayable

Governed lifecycle events MUST contain operation correlation, kind or operation type, scope, bank when known, and bounded failure information. Events MUST remain sufficient for deterministic projection without requiring a live backend query.

#### Scenario: Failed operation is replayed offline

- **WHEN** a lifecycle log containing a failed write or delete is exported without a running agent
- **THEN** the exporter can preserve the failure state and its source position
- **AND THEN** no failed operation is projected as a current confirmed memory
