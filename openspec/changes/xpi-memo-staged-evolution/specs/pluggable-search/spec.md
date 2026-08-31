## Purpose

Provides an abstraction layer that allows xpi-memo to use different search engines (mnemosyne vector search, ripgrep full-text, qmd semantic) interchangeably based on user configuration or runtime availability.

## ADDED Requirements

### Requirement: Search backend interface

The system SHALL define a common interface for search backends that all implementations must satisfy, enabling runtime substitution.

#### Scenario: Common query method
- **WHEN** any search backend is invoked
- **THEN** it accepts query string, limit, and scope parameters
- **AND** returns results in a standardized format

#### Scenario: Common result format
- **WHEN** search results are returned
- **THEN** each result includes content, score, source metadata
- **AND** format is backend-agnostic

#### Scenario: Backend capabilities query
- **WHEN** system queries backend capabilities
- **THEN** backend reports supported features (vector, full-text, semantic)
- **AND** reports availability status (installed, configured, ready)

### Requirement: Mnemosyne backend

The system SHALL provide a mnemosyne backend that wraps the existing mnemosyne CLI for vector-based semantic search.

#### Scenario: Mnemosyne availability check
- **WHEN** system checks mnemosyne backend
- **THEN** it verifies mnemosyne CLI is in PATH
- **AND** reports available or unavailable

#### Scenario: Mnemosyne search
- **WHEN** using mnemosyne backend for recall
- **THEN** it invokes mnemosyne CLI with appropriate bank and scope
- **AND** parses output into standardized result format

#### Scenario: Mnemosyne fallback to FTS5
- **WHEN** mnemosyne embedding fails
- **THEN** backend falls back to FTS5 full-text search
- **AND** flags results as fallback mode

### Requirement: Ripgrep backend

The system SHALL provide a ripgrep backend for fast full-text search across Markdown exports and JSONL logs.

#### Scenario: Ripgrep availability check
- **WHEN** system checks ripgrep backend
- **THEN** it verifies ripgrep (rg) is in PATH
- **AND** reports available or unavailable

#### Scenario: Ripgrep search
- **WHEN** using ripgrep backend for recall
- **THEN** it searches Markdown exports and/or JSONL logs
- **AND** returns matches with surrounding context

#### Scenario: Ripgrep regex support
- **WHEN** query contains regex patterns
- **THEN** ripgrep interprets them as regular expressions
- **AND** returns matching results

#### Scenario: Ripgrep case sensitivity
- **WHEN** query includes uppercase letters
- **THEN** search is case-sensitive
- **AND** lowercase-only queries are case-insensitive

### Requirement: Qmd backend

The system SHALL provide an optional qmd backend for semantic search when qmd CLI is installed.

#### Scenario: Qmd availability check
- **WHEN** system checks qmd backend
- **THEN** it verifies qmd CLI is in PATH and functional
- **AND** reports available or unavailable

#### Scenario: Qmd semantic search
- **WHEN** using qmd backend for recall
- **THEN** it invokes qmd with query and target directories
- **AND** returns semantically relevant results

#### Scenario: Qmd hybrid mode
- **WHEN** qmd backend is used
- **THEN** it combines vector search, BM25, and reranking
- **AND** returns highest-quality semantic matches

### Requirement: Backend selection

The system SHALL select a search backend based on configuration, falling back through available backends if the preferred one is unavailable.

#### Scenario: Configured backend used
- **WHEN** user configures "mnemosyne" as search backend
- **THEN** system uses mnemosyne if available
- **AND** falls back to next available if not

#### Scenario: Fallback order
- **WHEN** preferred backend is unavailable
- **THEN** system tries backends in order: configured → mnemosyne → ripgrep → qmd
- **AND** uses first available backend

#### Scenario: No backend available
- **WHEN** no search backend is available
- **THEN** recall operations return empty results with warning
- **AND** system continues operating without search

#### Scenario: Runtime backend switching
- **WHEN** user changes backend configuration
- **THEN** next recall uses new backend
- **AND** no restart required

### Requirement: Backend isolation

The system SHALL isolate backend-specific logic so that adding or removing a backend does not affect T1 memory operations or other backends.

#### Scenario: Backend failure isolation
- **WHEN** one backend crashes or errors
- **THEN** other backends remain functional
- **AND** system can fall back to alternative backend

#### Scenario: Backend-specific configuration
- **WHEN** configuring a backend
- **THEN** settings are isolated to that backend
- **AND** do not affect other backends

### Requirement: Search scope mapping

The system SHALL map T1 memory scopes (global, project, session) to backend-specific search targets.

#### Scenario: Global scope search
- **WHEN** recalling from global scope
- **THEN** mnemosyne searches default bank
- **AND** ripgrep searches global Markdown directory
- **AND** qmd searches global content directory

#### Scenario: Project scope search
- **WHEN** recalling from project scope
- **THEN** mnemosyne searches project bank
- **AND** ripgrep searches project Markdown directory
- **AND** qmd searches project content directory

#### Scenario: Combined scope search
- **WHEN** recalling from both global and project
- **THEN** backend searches both targets
- **AND** merges results with scope attribution

### Requirement: Backend performance reporting

The system SHALL report backend-specific performance metrics (latency, result count, availability) for observability.

#### Scenario: Query latency tracking
- **WHEN** a search completes
- **THEN** system records query duration
- **AND** includes backend name and result count

#### Scenario: Fallback tracking
- **WHEN** a backend falls back to alternative mode
- **THEN** fallback reason is logged
- **AND** included in status reporting

#### Scenario: Backend health status
- **WHEN** user checks memoharness status
- **THEN** status includes available backends
- **AND** reports which is currently active

### Requirement: Incremental backend adoption

The system SHALL allow users to gradually adopt new backends without breaking existing functionality or requiring migration.

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

### Requirement: Backend installation guidance

The system SHALL provide clear error messages and installation guidance when a configured backend is unavailable.

#### Scenario: Missing mnemosyne CLI
- **WHEN** mnemosyne backend is selected but CLI is not in PATH
- **THEN** error message explains mnemosyne is not installed
- **AND** provides installation command (pip install mnemosyne-cli)

#### Scenario: Missing ripgrep
- **WHEN** ripgrep backend is selected but rg is not in PATH
- **THEN** error message explains ripgrep is not installed
- **AND** provides installation guidance for user's OS

#### Scenario: Missing qmd
- **WHEN** qmd backend is selected but qmd is not in PATH
- **THEN** error message explains qmd is not installed
- **AND** notes qmd is optional and provides installation link

### Requirement: Backend-agnostic recall interface

The system SHALL ensure that T1 recall operations work identically regardless of which backend is active, maintaining API compatibility.

#### Scenario: Backend transparent to caller
- **WHEN** memoharness_recall tool is invoked
- **THEN** it returns results in same format regardless of backend
- **AND** caller does not need to know which backend was used

#### Scenario: Result quality variation
- **WHEN** different backends return different result quality
- **THEN** system includes confidence/score in results
- **AND** caller can interpret quality per result

### Requirement: Backend result limits

The system SHALL respect configured result limits across all backends, normalizing backend-specific pagination or result caps.

#### Scenario: Consistent limit enforcement
- **WHEN** recall limit is set to 5
- **THEN** all backends return at most 5 results
- **AND** highest-scored results are selected

#### Scenario: Backend exceeds limit
- **WHEN** backend returns more results than requested
- **THEN** system truncates to requested limit
- **AND** selects highest-scored results
