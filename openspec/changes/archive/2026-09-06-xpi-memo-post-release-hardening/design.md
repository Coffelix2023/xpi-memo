## Context

See `proposal.md` for motivation. The existing implementation already has L0 session tracing, governed T1 candidates, Git-based project identity, global/project bank separation, Markdown export primitives, activation hooks, and capability-checked sleep. The post-release work must correct boundary behavior without reopening the completed staged-evolution or observability changes.

The design keeps the current global machine-state layout and treats the new behavior as a compatibility-preserving hardening layer. The primary acceptance environments are: Git repository, initialized non-Git directory, uninitialized non-Git directory, TUI, non-TUI, and sleep capability absent/present.

## Goals / Non-Goals

**Goals:**

- Make every memory outcome explicit: stored, candidate, rejected, skipped, degraded, or unavailable.
- Preserve project isolation and cross-worktree sharing while adding a portable human-readable project view.
- Make non-Git and non-TUI behavior testable without requiring interactive confirmation or online services.
- Keep sensitive bodies out of diagnostics and project export by default.
- Make sleep fallback an explicit capability choice rather than an implicit substitution.

**Non-Goals:**

- Do not move SQLite, WAL, SHM, or search indexes into project repositories.
- Do not rewrite the T1 storage engine, replace mnemosyne, or add a Web application.
- Do not auto-delete orphan banks or automatically merge unrelated data roots.
- Do not make offline extraction or a dedicated sleep model mandatory for explicit capture.
- Do not redesign the TUI/rich visual layer; it consumes the shared status contract.

## Decisions

### 1. Use explicit project initialization as the non-Git project boundary

A recognized Git identity remains the default project identity. For non-Git directories, project memory remains unavailable until the user explicitly initializes a local project identity. The system will not silently route project content to the global bank.

This is preferred over silent global fallback because project decisions and constraints have different privacy and recall semantics from global preferences. It also avoids making a failed project write look successful. A future opt-in degraded mode can be added without changing the default contract.

Alternatives considered:

- **Global fallback by default:** rejected because it pollutes global recall and hides a scope boundary.
- **Put a database in every project directory:** rejected because it breaks shared worktree identity, creates binary Git conflicts, and increases privacy risk.

### 2. Give `session_context` an independent session-scoped persistence path

`session_context` will be represented as session scope and resolved without requiring project identity. Its persistence may reuse the existing storage adapter with an explicit session discriminator, or use a small session-specific store, but consumers must observe only the session-scoped contract.

The important boundary is semantic, not the physical filename: session context must work outside Git, must not become global standing memory, and must remain traceable to the current session.

Alternatives considered:

- **Keep routing to project bank:** rejected because current-session context fails in common non-Git use.
- **Write it as ordinary global memory:** rejected because unrelated future sessions could receive transient context.
- **L0-only with no governed session view:** deferred because compaction and recall need a bounded session-scoped contract.

### 3. Centralize rejection and capability outcomes before user-facing rendering

Routing, activation, sleep, recall, and export will produce structured outcomes with bounded reason codes and optional safe details. L0/audit records will be emitted at the earliest meaningful boundary, including pre-candidate routing rejection. Tools, status, doctor, and UI surfaces will render these outcomes instead of reconstructing reasons from generic errors.

Alternatives considered:

- **Only improve user-facing strings:** rejected because failures would remain invisible to doctor and impossible to aggregate.
- **Record full input for diagnosis:** rejected because it violates privacy and output bounds.
- **Let each surface define its own error taxonomy:** rejected because labels and counts would drift.

### 4. Treat activation validation as an environment matrix, not only unit coverage

The deterministic activation path remains the hot path. Acceptance tests will exercise real registered hooks across Git, initialized non-Git, and uninitialized non-Git directories, in TUI-independent execution. Offline extraction is injected only as bounded enrichment and its failures cannot block explicit capture.

The test matrix will assert the complete chain: source event, provenance, idempotency, candidate or direct write, confirmation outcome, L0/audit evidence, and later recall.

Alternatives considered:

- **Rely on existing activation unit tests:** rejected because they do not prove hook registration and non-TUI lifecycle behavior.
- **Make LLM extraction responsible for coverage:** rejected because it adds cost and failure coupling to the core path.

### 5. Keep scope canonical and separate visibility from physical placement

The canonical taxonomy will use `global`, `project`, and `session` according to semantic ownership. Physical bank names remain implementation details. If cross-project visibility becomes necessary, it will be represented by a separate field and policy rather than falsifying scope.

This prevents recall ranking, export, audit, and future migration from interpreting a project record as global merely because an older route table used that label.

### 6. Layer project Markdown over global SQLite

The global SQLite bank remains the only machine-state write and recall engine. Explicit export derives stable Markdown files under the current project root, with per-kind organization and stable memory anchors. A new machine can read those files as `repo-export` evidence and route them through normal governance.

The project layer is therefore a portable human view, not a second source of truth. Export is explicit, privacy-filtered, deterministic, and idempotent.

Alternatives considered:

- **Move SQLite into `.pi/`:** rejected due to binary merge conflicts, worktree fragmentation, WAL churn, and accidental disclosure.
- **Bidirectional Markdown/database sync:** rejected because conflict resolution would create a second source of truth.
- **Export complete L0 transcripts:** rejected because session traces are sensitive and unbounded by default.

### 7. Expose sleep modes without weakening authorization

Sleep remains off unless explicitly authorized. Capability inspection will distinguish dedicated model support, explicitly configured session-model fallback, mechanical consolidation, and disabled state. The result and diagnostics will report the actual mode; no fallback may be labeled dedicated.

Alternatives considered:

- **Silently use the current model:** rejected because it changes cost and privacy expectations without consent.
- **Keep only unsupported:** rejected because users cannot tell whether configuration or upstream capability is missing.

## Risks / Trade-offs

- **[Risk] Explicit non-Git initialization adds one setup step.** → Mitigation: provide a clear command and actionable error; preserve global and session functionality without initialization.
- **[Risk] Session-scoped storage may require a new discriminator in existing adapters.** → Mitigation: keep the contract at the routing/recall boundary and reuse existing adapter abstractions where safe.
- **[Risk] More failure events increase audit volume.** → Mitigation: use bounded reason codes, avoid bodies, and count by category rather than duplicating input.
- **[Risk] Repo Markdown can contain sensitive project knowledge.** → Mitigation: explicit export, existing content policy/redaction, no full traces, and clear export status.
- **[Risk] Export and bank state can diverge.** → Mitigation: stable anchors, deterministic regeneration, source traceability, and no bidirectional edits in this change.
- **[Risk] Sleep fallback may be misinterpreted as equivalent quality.** → Mitigation: expose the actual execution mode and preserve separate capability labels.

## Migration Plan

1. Ship the boundary contracts and regression tests without changing existing data files.
2. Add explicit non-Git project initialization as an opt-in path; existing Git identities and global memory remain unchanged.
3. Enable improved failure events and status fields for new operations; historical L0/audit entries are not rewritten.
4. Enable project Markdown export only through an explicit command or configured explicit trigger; no automatic database relocation occurs.
5. On new machines, treat existing `.pi/memory/` entries as `repo-export` candidates and require normal governance before local persistence.
6. Roll back by disabling new initialization, export, fallback, or diagnostic emission flags; retain existing banks, candidates, audit records, and L0 logs.

## Open Questions

None. The default non-Git policy, session scope, storage layering, export control, and sleep authorization boundary are resolved in this design.
