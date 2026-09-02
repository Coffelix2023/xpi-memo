## Purpose

This capability defines the user-facing visual layer for xpi-memo so Agent memory is understandable to humans at a glance. It establishes how the console, rich status surface, and review flows present memory scope, trust, and state without exposing internal implementation details as the primary experience.

## ADDED Requirements

### Requirement: Terminal-first console remains the primary interaction surface
The system MUST present xpi-memo's primary interactive workflow through a terminal-first console suitable for Pi agent sessions, including constrained terminals and remote sessions.

#### Scenario: Terminal session opens the console
- **WHEN** a user opens `/xpi-memo` in a supported terminal session
- **THEN** the system MUST present the console as the primary interaction surface
- **AND THEN** the core views MUST remain usable without a graphical window

#### Scenario: Constrained environment fallback
- **WHEN** the runtime cannot provide a rich window surface
- **THEN** the system MUST still expose the same core memory workflows in the terminal console
- **AND THEN** the user MUST be able to review and act on memory state

### Requirement: Rich status surfaces enhance, but do not gate, usability
The system MUST provide an optional richer visual status surface for memory inspection and diagnosis when the runtime supports it.

#### Scenario: Rich surface is available
- **WHEN** the runtime supports a rich window surface
- **THEN** the system MUST render a richer status presentation for memory inspection
- **AND THEN** the same underlying memory state MUST remain available through the terminal fallback

#### Scenario: Rich surface is unavailable
- **WHEN** the rich window surface is unavailable
- **THEN** the system MUST fall back to a terminal-compatible status presentation
- **AND THEN** no user-facing capability required for diagnosis or review may disappear

### Requirement: Memory presentation MUST use human-readable labels
The system MUST present memory items using human-readable taxonomy labels that let a user understand what Agent remembered without knowing internal memory kinds.

#### Scenario: User views remembered items
- **WHEN** the user inspects stored or pending memories
- **THEN** each item MUST show a human-readable label for its memory meaning or category
- **AND THEN** the presentation MUST include the memory's scope and state when relevant

#### Scenario: Human-readable labels map to internal kinds
- **WHEN** the system maps internal memory kinds to visible labels
- **THEN** the mapping MUST be deterministic and consistent across console and rich status surfaces
- **AND THEN** the user-visible label MUST remain understandable without internal terminology

### Requirement: Candidate review MUST expose clear action choices
The system MUST present memory review flows with explicit action choices that let a user store, defer, or reject a candidate memory.

#### Scenario: Candidate review is shown
- **WHEN** a candidate memory is ready for user review
- **THEN** the system MUST show clear choices for storing, deferring, or rejecting the candidate
- **AND THEN** the candidate view MUST show enough context to understand the decision

#### Scenario: Review affordances are visible in the console
- **WHEN** the user opens the Pending review area
- **THEN** the available actions MUST be visible without needing to infer them from internal state
- **AND THEN** the review UI MUST make the outcome of each choice understandable

### Requirement: Visual surfaces MUST consume the shared observability contract
The terminal console and optional rich status surface MUST consume the read-only `MemoryStatus`, `ObservabilitySnapshot`, and canonical T1 taxonomy contract defined by `xpi-memo-memory-observability`. The visual layer MUST NOT define a second memory source of truth, candidate queue, storage format, governance path, or provenance model.

#### Scenario: Visual surfaces render shared state
- **WHEN** the same memory state is shown in the terminal console and rich status surface
- **THEN** both surfaces MUST use the same labels, scope, trust-state, lifecycle, provenance summary, and bounded diagnostic counts
- **AND THEN** rendering or review interaction MUST NOT persist UI-specific memory state

### Requirement: Branding and attribution MUST stay explicit
The system MUST keep xpi-memo branding in user-facing surfaces and MUST document borrowed UI ideas or copied permissive code in the project documentation.

#### Scenario: User-facing surfaces render the product name
- **WHEN** the user opens any xpi-memo visual surface
- **THEN** the surface MUST identify itself as xpi-memo
- **AND THEN** upstream tool names MUST NOT replace the product brand in the primary UI

#### Scenario: Third-party inspiration is documented
- **WHEN** the project adopts design ideas or copied permissive code from external tools
- **THEN** the documentation MUST acknowledge the source
- **AND THEN** the attribution MUST be separate from the product name and user-facing brand
