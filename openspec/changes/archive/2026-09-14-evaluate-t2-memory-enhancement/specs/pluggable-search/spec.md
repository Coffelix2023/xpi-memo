## MODIFIED Requirements

### Requirement: Backend isolation

The system SHALL isolate backend-specific logic so that adding or removing a backend does not affect T1 memory operations or other backends. Optional T2 adapters SHALL be read-only or derived-input consumers and SHALL not become a second write authority.

#### Scenario: T2 adapter fails

- **WHEN** an optional T2 adapter crashes, times out, or returns invalid results
- **THEN** T1 memory operations and existing search backends remain functional
- **AND THEN** the selector records a bounded failure and uses the existing fallback chain

#### Scenario: Backend failure isolation

- **WHEN** one backend crashes or errors
- **THEN** other backends remain functional
- **AND** system can fall back to alternative backend

#### Scenario: Backend-specific configuration

- **WHEN** configuring a backend
- **THEN** settings are isolated to that backend
- **AND** do not affect other backends

### Requirement: Backend-agnostic recall interface

The system SHALL ensure that T1 recall operations work identically regardless of which backend is active, maintaining API compatibility. T2-derived results SHALL use the standardized result format and SHALL retain source and evidence metadata.

#### Scenario: Derived results are merged

- **WHEN** a T2 adapter returns semantically or graph-related results
- **THEN** results are normalized into the existing backend-agnostic format
- **AND THEN** T2 scores MUST be applied only as a bounded optional ranking signal
- **AND THEN** the caller MUST still receive the original source reference

#### Scenario: Backend transparent to caller

- **WHEN** memoharness_recall tool is invoked
- **THEN** it returns results in same format regardless of backend
- **AND** caller does not need to know which backend was used

#### Scenario: Result quality variation

- **WHEN** different backends return different result quality
- **THEN** system includes confidence/score in results
- **AND** caller can interpret quality per result

### Requirement: Incremental backend adoption

The system SHALL allow users to gradually adopt new backends without breaking existing functionality or requiring migration. An optional T2 adapter SHALL be disabled by default and removable without changing T1 data.

#### Scenario: T2 adapter is disabled

- **WHEN** the user has not enabled an optional T2 adapter
- **THEN** the existing configured-to-fallback search chain operates exactly as before
- **AND THEN** no T2 index or remote model call is required

#### Scenario: T2 adapter is removed

- **WHEN** the user disables or uninstalls a T2 adapter
- **THEN** T1 banks, L0 logs, Markdown projections, and exact deletion remain readable and functional
- **AND THEN** the system MUST NOT require a data migration to recover baseline behavior

#### Scenario: Mnemosyne-only operation

- **WHEN** user has only mnemosyne installed
- **THEN** system operates exactly as before
- **AND** no Markdown or ripgrep required

#### Scenario: Adding ripgrep later

- **WHEN** user installs ripgrep after using mnemosyne
- **THEN** ripgrep becomes available for future searches
- **AND** existing mnemosyne data is preserved

#### Scenario: Parallel backend usage

- **WHEN** multiple backends are available
- **THEN** user can switch between them via configuration
- **AND** same underlying data is searchable by all
