## Purpose

Manages the routing of memory operations between global and project scopes, with L0 event log as the source of truth while maintaining backward compatibility with direct mnemosyne access during the transition.

## MODIFIED Requirements

### Requirement: Route memory by kind and context

The system SHALL route memory operations to global or project scope based on memory kind and project context, now also recording routing decisions in the L0 event log.

#### Scenario: Project-scoped memory routing
- **WHEN** storing a project_decision in a git repository
- **THEN** memory is routed to project bank
- **AND** routing decision is logged to L0

#### Scenario: Global-scoped memory routing
- **WHEN** storing a global_preference
- **THEN** memory is routed to global bank
- **AND** routing decision is logged to L0

#### Scenario: Session-scoped memory routing
- **WHEN** storing a session_context
- **THEN** memory is stored in session scope
- **AND** routing decision is logged to L0

#### Scenario: Non-git context handling
- **WHEN** operation occurs outside a git repository
- **THEN** all memories route to global scope
- **AND** project routing is unavailable

### Requirement: L0 event log as routing source

The system SHALL consult L0 event log for routing decisions in addition to current memory kind, enabling deterministic replay and audit.

#### Scenario: Routing from L0 history
- **WHEN** deriving context from L0 log
- **THEN** routing decisions are replayed from logged events
- **AND** results match original routing

#### Scenario: Dual-write during transition
- **WHEN** L0 is enabled alongside mnemosyne
- **THEN** routing decisions are written to both L0 log and mnemosyne
- **AND** L0 becomes authoritative for future reads

#### Scenario: Fallback to direct routing
- **WHEN** L0 event log is unavailable or disabled
- **THEN** routing falls back to direct kind-based rules
- **AND** system continues operating

### Requirement: Project identity resolution

The system SHALL resolve project identity from git repository information, now recording identity resolution events in L0.

#### Scenario: Git common-dir hashing
- **WHEN** resolving project identity in a git repo
- **THEN** common-dir is hashed to generate project ID
- **AND** resolution event is logged to L0

#### Scenario: Worktree handling
- **WHEN** operating in a git worktree
- **THEN** identity resolves to parent repository
- **AND** all worktrees share same project bank

#### Scenario: Identity cache consistency
- **WHEN** project identity changes (moved repo)
- **THEN** L0 log records identity transition event
- **AND** routing adapts to new identity
