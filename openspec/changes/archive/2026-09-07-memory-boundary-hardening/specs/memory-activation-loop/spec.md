## MODIFIED Requirements

### Requirement: Capture evidence MUST distinguish user statements from agent-derived content

The system MUST preserve the difference between explicit user statements, verified repository or tool evidence, and model-derived suggestions. Content captured or derived for offline processing MUST pass the same external-boundary credential protection as other memory transmission, and unsafe or uncertain content MUST not enter durable memory, candidates, or diagnostic body output.

#### Scenario: Agent proposes a memory
- **WHEN** a memory originates from an agent tool input, model inference, or offline extraction
- **THEN** the system MUST NOT label it as an explicit user statement without a linked user event that supports that claim
- **AND THEN** the evidence type and source reference MUST remain visible to governance and diagnostics

#### Scenario: Sensitive content is encountered
- **WHEN** explicit or derived content contains secrets, credentials, tokens, or prohibited personal data
- **THEN** the system MUST prevent the unsafe content from entering durable memory, candidates, or diagnostic body output
- **AND THEN** before any external processing the system MUST use a redacted safe copy or refuse the external call when safety cannot be confirmed
- **AND THEN** the system MUST retain only bounded non-sensitive rejection metadata where required for diagnosis

#### Scenario: Derived content is sent to an external runner
- **WHEN** offline extraction prepares content for a provider or external runner
- **THEN** known credentials MUST be redacted before transmission
- **AND THEN** uncertain content MUST prevent the external request from being sent
- **AND THEN** the original local event MAY remain available for L0 replay without being used as the external payload
