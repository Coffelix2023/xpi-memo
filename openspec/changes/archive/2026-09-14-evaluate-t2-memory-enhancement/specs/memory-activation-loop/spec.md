## MODIFIED Requirements

### Requirement: Capture evidence MUST distinguish user statements from agent-derived content

The system MUST preserve the difference between explicit user statements, verified repository or tool evidence, model-derived suggestions, and T2-derived proposals. Content captured or derived for offline processing MUST pass the same external-boundary credential protection as other memory transmission, and unsafe or uncertain content MUST not enter durable memory, candidates, or diagnostic body output.

#### Scenario: T2 proposes a memory

- **WHEN** a memory originates from a T2 index, graph, embedding result, or model-derived proposal
- **THEN** the system MUST retain that derived evidence type and linked source events
- **AND THEN** it MUST NOT label the result as an explicit user statement without a supporting user event

#### Scenario: Agent proposes a memory

- **WHEN** a memory originates from an agent tool input, model inference, or offline extraction
- **THEN** the system MUST NOT label it as an explicit user statement without a linked user event that supports that claim
- **AND THEN** the evidence type and source reference MUST remain visible to governance and diagnostics

#### Scenario: Sensitive content is encountered

- **WHEN** explicit or derived content contains secrets, credentials, tokens, or prohibited personal data
- **THEN** the system MUST prevent the content from entering durable memory, candidates, or diagnostic body output
- **AND THEN** before any external processing the system MUST use a redacted safe copy or refuse the external call when safety cannot be confirmed
- **AND THEN** the system MUST retain only bounded non-sensitive rejection metadata where required for diagnosis

#### Scenario: Derived content is sent to an external runner

- **WHEN** offline extraction prepares content for a provider or external runner
- **THEN** known credentials MUST be redacted before transmission
- **AND THEN** uncertain content MUST prevent the external request from being sent
- **AND THEN** the original local event MAY remain available for L0 replay without being used as the external payload

### Requirement: Pending candidates MUST have a visible, low-noise digest

The system MUST expose pending candidates through the existing review flow, provide a concise reminder when the backlog requires attention, and expose bounded transient status for candidate creation and resolution.

#### Scenario: Candidate is created by T2

- **WHEN** a T2 proposal enters the candidate lifecycle
- **THEN** the system MUST show a bounded candidate-created status
- **AND THEN** the candidate MUST remain available through the existing review surface

#### Scenario: Pending candidates exist at session start

- **WHEN** a new session starts and pending candidates exist
- **THEN** the system MUST make the backlog count and review command or surface discoverable
- **AND THEN** the reminder MUST NOT block the user or open a mandatory confirmation dialog

#### Scenario: Candidate actions are applied

- **WHEN** a user stores, defers, or rejects a candidate
- **THEN** the system MUST preserve the existing lifecycle semantics
- **AND THEN** the resulting state MUST be reflected in counts, provenance-safe diagnostics, and transient status
