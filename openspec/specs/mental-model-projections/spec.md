# mental-model-projections Specification

## Purpose

Provide traceable, refreshable standing answers derived from governed T1 memories so repeated project and user-context questions can reuse a consistent synthesis without turning generated summaries into another source of truth.

## Requirements

### Requirement: Mental models MUST remain derived from governed memory

The system MUST treat a mental-model projection as replaceable derived state. L0 MUST remain authoritative for event history and provenance, and confirmed T1 state MUST remain authoritative for current governed long-term memory. A projection MUST NOT create, modify, confirm, supersede, or delete a T1 memory or pending candidate.

#### Scenario: Projection is generated
- **WHEN** the system successfully generates a mental-model projection
- **THEN** it MUST store the projection separately from T1 banks and pending candidates
- **AND THEN** it MUST retain bounded references to the governed source memories and their L0 provenance boundary
- **AND THEN** generated prose MUST remain classified as derived content rather than an explicit user statement or verified repository fact

#### Scenario: Projection storage is removed
- **WHEN** mental-model projection files are absent or deleted
- **THEN** confirmed T1 memories and L0 event history MUST remain unchanged
- **AND THEN** the system MUST be able to rebuild projections from eligible governed sources

### Requirement: Mental-model questions MUST be explicit and bounded

The system MUST provide explicit definitions for a global user working-style model and a current-project operating model. Each definition MUST declare a stable identifier, question, semantic scope, permitted source kinds, and an enabled state. The system MUST NOT automatically invent new durable mental-model definitions from conversation content.

#### Scenario: User working-style model selects sources
- **WHEN** the global user working-style model is evaluated
- **THEN** only confirmed global preference and global workflow memories MUST be eligible sources
- **AND THEN** project and session memories MUST be excluded

#### Scenario: Project operating model selects sources
- **WHEN** the current-project operating model is evaluated for a recognized project
- **THEN** only confirmed project gene, project constraint, project decision, and project gotcha memories from that project's bank MUST be eligible sources
- **AND THEN** global, session, and other-project memories MUST be excluded

#### Scenario: Project identity is unavailable
- **WHEN** the current-project operating model is evaluated without a recognized project identity
- **THEN** the system MUST skip project projection generation and delivery
- **AND THEN** it MUST NOT fall back to the global bank or another project's projection

### Requirement: Freshness detection MUST be deterministic and model-free

The system MUST determine whether each enabled projection is fresh, stale, pending, failed, or absent from eligible governed source state and the last successful source boundary. Freshness detection MUST NOT call a language model or external provider and MUST detect additions, confirmations, supersessions, deletions, and source-scope changes that alter the eligible source set.

#### Scenario: Eligible source state is unchanged
- **WHEN** the eligible governed source set and source state match the last successful projection boundary
- **THEN** the projection MUST remain fresh
- **AND THEN** the system MUST NOT schedule or execute a synthesis call for that model

#### Scenario: Eligible source state changes
- **WHEN** an eligible source is added, confirmed, superseded, deleted, or otherwise changes the effective source set
- **THEN** the affected projection MUST become stale
- **AND THEN** unrelated models and other project identities MUST retain their existing state

#### Scenario: Candidate remains unconfirmed
- **WHEN** content exists only as a pending, deferred, rejected, or verification-failed candidate
- **THEN** it MUST NOT enter the stable source set
- **AND THEN** it MUST NOT by itself make a fresh projection authoritative for that candidate's claim

### Requirement: Projection synthesis MUST be gated, bounded, and non-blocking

The system MUST synthesize stale or absent projections only when mental-model synthesis is explicitly enabled. Synthesis MUST run at bounded offline lifecycle points, use a configured injected or session-model runner, enforce time/input/output/execution budgets, and apply the existing external-content safety boundary. It MUST NOT block active coding interaction or session shutdown completion.

#### Scenario: Synthesis is disabled
- **WHEN** mental-model synthesis has not been explicitly enabled
- **THEN** deterministic freshness detection MAY run locally
- **AND THEN** the system MUST NOT issue a model or provider request
- **AND THEN** existing capture, candidate, recall, and profile behavior MUST continue unchanged

#### Scenario: Stale projection is refreshed
- **WHEN** synthesis is enabled, an enabled projection is stale or absent, eligible governed sources exist, and the runner and budgets are available
- **THEN** the system MUST submit only the bounded safety-processed source material for that definition
- **AND THEN** it MUST validate a bounded projection result and source references before persistence
- **AND THEN** successful synthesis MUST NOT invoke the T1 write or candidate-admission path

#### Scenario: Runner is unavailable or exceeds a bound
- **WHEN** the runner is unavailable, times out, is aborted, exhausts a budget, or returns invalid output
- **THEN** the lifecycle operation MUST complete without blocking the active session
- **AND THEN** the projection MUST expose a bounded failure outcome without model output or memory bodies in diagnostics

#### Scenario: Source content is unsafe for external processing
- **WHEN** the existing safety boundary cannot produce a safe bounded source payload
- **THEN** the external synthesis call MUST be refused
- **AND THEN** local L0 and T1 state MUST remain unchanged
- **AND THEN** diagnostics MUST contain only a bounded non-sensitive reason and policy version

### Requirement: Projection persistence MUST preserve the last successful result

The system MUST write projection content and metadata atomically. A successful projection MUST identify its definition, owning scope or project identity, source memory references, successful source boundary, generation time, and freshness state. Failed or interrupted refreshes MUST preserve the last successful content and source boundary while making the failure or stale state observable.

#### Scenario: Refresh succeeds
- **WHEN** a validated refresh is persisted successfully
- **THEN** content and metadata MUST become visible as one complete projection version
- **AND THEN** the successful source boundary MUST advance only after that atomic persistence
- **AND THEN** the projection MUST become fresh

#### Scenario: Refresh fails after an older projection exists
- **WHEN** synthesis, validation, or persistence fails for a model with a previous successful projection
- **THEN** the previous content and successful source boundary MUST remain intact
- **AND THEN** the projection MUST be reported as stale or failed rather than fresh
- **AND THEN** the next eligible refresh MUST reconsider the same uncommitted source changes

#### Scenario: Refresh fails without a previous projection
- **WHEN** refresh fails and no successful projection exists
- **THEN** the system MUST report an absent or failed projection
- **AND THEN** it MUST NOT create an empty projection that appears authoritative

### Requirement: Projection delivery MUST be scoped, safe, and bounded

The system MUST deliver only fresh, enabled mental-model projections whose declared scope matches the current request. Delivered content MUST be marked as untrusted derived memory data, pass the same injection safety policy as recalled memories, use an independent item and character budget, and avoid duplicating covered source memories in the same automatic context.

#### Scenario: Fresh project projection is relevant
- **WHEN** a request is in the matching recognized project and the project operating model is fresh and eligible for delivery
- **THEN** the system MAY inject its bounded content with its derived-state label
- **AND THEN** it MUST NOT inject source rows already represented by that projection unless they remain independently necessary and fit the recall budget
- **AND THEN** source traceability MUST remain available without injecting source bodies twice

#### Scenario: Projection is stale, failed, or pending
- **WHEN** a projection is stale, failed, pending, disabled, or belongs to another project identity
- **THEN** it MUST NOT be injected as a current standing answer
- **AND THEN** ordinary governed recall MUST remain available as the fallback

#### Scenario: Projection content triggers memory safety policy
- **WHEN** a projection matches the high-confidence prompt-injection or prohibited-output policy
- **THEN** its body MUST be blocked from model-visible context
- **AND THEN** other safe recall or projection content MAY continue through the bounded delivery path

#### Scenario: Delivery budget is exhausted
- **WHEN** eligible projection content exceeds its item or character budget
- **THEN** the system MUST omit content deterministically rather than emit an unbounded or partial authority block
- **AND THEN** omission counts and reasons MUST remain available through body-free diagnostics

### Requirement: Mental-model lifecycle MUST be observable and traceable

The system MUST expose body-free counts and bounded recent metadata for projection freshness checks, refresh attempts, skips, successes, failures, safety refusals, and injections. A visible projection MUST provide a bounded path to its definition, source memory identifiers, owning scope, and originating L0 evidence without requiring diagnostic surfaces to dump source or projection bodies.

#### Scenario: Status is requested
- **WHEN** an operator requests xpi-memo status or health information
- **THEN** the system MUST distinguish absent, fresh, stale, pending, failed, and disabled projection states
- **AND THEN** it MUST distinguish no refresh needed, synthesis disabled, runner unavailable, budget exhausted, safety refused, refresh failed, and refresh succeeded outcomes
- **AND THEN** default diagnostics MUST not include memory or projection bodies

#### Scenario: Projection source is traced
- **WHEN** a user or operator asks why a projection exists
- **THEN** the system MUST expose its bounded source memory identifiers and successful source boundary
- **AND THEN** those references MUST lead to the existing governed T1 and L0 trace path
- **AND THEN** the projection itself MUST not be presented as original evidence

### Requirement: Existing memory behavior MUST remain compatible

The capability MUST NOT add a Hindsight runtime, service, package, or API dependency, MUST NOT add a `mental_model` T1 memory kind, and MUST NOT change existing remember, candidate admission, bank routing, preference profile, explicit recall, or Markdown projection semantics when mental-model synthesis is disabled.

#### Scenario: Extension upgrades with synthesis disabled
- **WHEN** an existing installation upgrades and does not enable mental-model synthesis
- **THEN** existing configuration and T1 banks MUST remain readable
- **AND THEN** existing capture, candidate, recall, profile, export, and forget behavior MUST remain compatible
- **AND THEN** no Hindsight service or dependency MUST be required for startup
