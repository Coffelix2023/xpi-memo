## ADDED Requirements

### Requirement: T1 outcomes require lifecycle-consistent reporting

T1 writes from direct capture, candidate confirmation and gated offline extraction MUST use the same failure-aware lifecycle semantics. A backend success without a recorded commit result MUST be reported as unresolved rather than as a confirmed stored outcome.

#### Scenario: Direct capture succeeds

- **WHEN** direct governed capture writes a T1 memory successfully
- **THEN** the tool result MUST identify the operation as stored only after its commit outcome is recorded
- **AND THEN** the corresponding L0 lifecycle records MUST be available for projection and audit

#### Scenario: Candidate confirmation backend fails

- **WHEN** a user confirms a candidate but the T1 backend rejects the write
- **THEN** the candidate MUST remain recoverable or be marked with a failure outcome
- **AND THEN** the tool MUST NOT report a successful confirmation
- **AND THEN** no confirmed T1 memory write may be projected

#### Scenario: Offline extraction write is unresolved

- **WHEN** offline extraction completes a backend call but the commit lifecycle record is unavailable
- **THEN** the result MUST expose an unresolved outcome
- **AND THEN** the system MUST NOT silently count it as a confirmed stored memory

### Requirement: T1 governance preserves existing candidate boundaries

Failure-aware lifecycle tracking MUST NOT bypass candidate creation, explicit confirmation, scope routing, provenance validation or content policy. Lifecycle metadata supplements governance and does not turn an unconfirmed candidate into a T1 row.

#### Scenario: Project decision remains gated

- **WHEN** a project decision requires candidate confirmation
- **THEN** the candidate MUST remain pending until Store is selected
- **AND THEN** lifecycle records MUST describe the confirmation operation separately from the candidate-created event
