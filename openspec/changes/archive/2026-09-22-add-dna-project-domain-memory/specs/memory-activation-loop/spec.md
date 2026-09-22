## MODIFIED Requirements

### Requirement: Explicit memory intent MUST enter a governed activation path

The system MUST detect explicit user intent to preserve a preference, workflow, project constraint, project decision, project gotcha, bounded session context, or an art/write-domain statement without requiring a separate manual memory-tool call. Art/write-domain statements MUST be governed through the DNA file outcome instead of a T1 candidate; all other categories MUST follow the existing T1 candidate or storage governance unchanged.

#### Scenario: User states an explicit preference

- **WHEN** the user explicitly states a durable preference or workflow rule
- **THEN** the system MUST create a governed memory outcome for the appropriate global category
- **AND THEN** the outcome MUST retain the originating session and event provenance

#### Scenario: User states an explicit project decision

- **WHEN** the user explicitly confirms a project decision, constraint, or gotcha
- **THEN** the system MUST route it to the current project scope when a recognized project exists
- **AND THEN** the system MUST apply the existing candidate or storage governance for that category

#### Scenario: User states an art/write-domain rule

- **WHEN** the user explicitly states a durable visual-design or writing-creation rule in a trusted project
- **THEN** the system MUST create a governed DNA file outcome with user-statement provenance in the matching domain
- **AND THEN** it MUST NOT create a T1 candidate or T1 record for that statement
- **AND THEN** in an untrusted project or when the statement falls outside the art/write domains, the system MUST fall back to the existing T1 governance path

#### Scenario: Ambiguous content is encountered

- **WHEN** content could map to more than one category or lacks enough scope context
- **THEN** the system MUST skip direct durable storage or create a governed candidate
- **AND THEN** it MUST NOT guess a category or silently place project content in the global scope
