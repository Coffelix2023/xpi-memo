## Context

See proposal.md - Why. Current implementation already has a terminal console, a rich status panel with a Glimpse path, and a text fallback for constrained environments. The design boundary for this change is the user-facing visual layer, not memory storage semantics or memory governance.

## Goals / Non-Goals

**Goals:**
- Provide a primary Pi terminal experience that is clear, scannable, and low friction.
- Provide a richer visual status surface when the runtime supports it.
- Establish a human-readable taxonomy for memory presentation so users can tell what was remembered without knowing internal kinds.
- Preserve xpi-memo branding while acknowledging external inspiration and reused permissive ideas where applicable.

**Non-Goals:**
- Reworking the memory engine, recall policy, or storage topology.
- Replacing the Pi terminal runtime with a browser app.
- Making `pi-interview-tool` a runtime dependency.
- Introducing a second independent UI stack for the same surface.

## Decisions

### 1) Keep `pi-tui` as the primary runtime for the console
The existing console already depends on `@earendil-works/pi-tui` and models the core interaction flow through tabs, select lists, and settings items. Keeping that runtime as the default minimizes risk and matches the extension's operating environment, including SSH / headless / TUI-only sessions.

Alternatives considered:
- Use Glimpse for everything: too heavy for the default path and weaker in constrained terminals.
- Switch to a custom terminal renderer: more flexibility, but unnecessary duplication of what `pi-tui` already provides.

### 2) Treat `glimpseui` as an optional rich presentation layer
The status panel already has a Glimpse-first path with a TUI fallback, which is the right shape for richer cards, diagnostics, and memory atlas views. Rich presentation should enhance readability, not gate core functionality.

Alternatives considered:
- Make Glimpse mandatory: better visuals, worse portability.
- Drop the Glimpse path: simpler, but forfeits the best native visual surface available to Pi users.

### 3) Borrow interaction vocabulary from `pi-interview-tool`, not its runtime model
That project demonstrates strong patterns for recommended options, clarification affordances, and review flows. Those patterns fit candidate review and memory explanation, but the project itself is optimized for form-driven interviews rather than persistent memory management.

Alternatives considered:
- Reuse the project as a dependency: too much product shape leakage and unnecessary coupling.
- Ignore it entirely: loses a useful vocabulary for user-facing review flows.

### 4) Make human-readable taxonomy first-class in the visual layer
The user should see labels like preference, workflow, decision, gotcha, and repository fact before internal routing details. Scope and trust should be visible alongside the memory item so the user can reason about what Agent preserved.

Alternatives considered:
- Show only internal kinds: accurate but opaque.
- Hide scope until drill-down: too much friction for routine review.

### 5) Preserve xpi-memo branding and document attribution separately
Any borrowed UI ideas should not rename the product. The visual layer should stay unmistakably xpi-memo, while README / docs capture inspiration, attribution, and any copied permissive code notices.

Alternatives considered:
- Co-brand the surfaces with upstream tool names: confusing and dilutes product identity.
- Omit attribution: not acceptable for reused ideas or code.

### 6) Consume the observability contract; do not redefine memory state
The UI layer consumes the read-only contract defined by `xpi-memo-memory-observability`: `MemoryStatus` from `src/status.ts`, `ObservabilitySnapshot` from `src/observability.ts`, and the canonical taxonomy from `src/kinds.ts`. The terminal console and rich status surface may present or request existing operations, but they do not own storage, governance, provenance, audit, candidate, or L0 state. They must not introduce a second memory source of truth or a second candidate queue.

## Risks / Trade-offs

- [Risk] Glimpse may not be available in all environments → Mitigation: keep the TUI fallback authoritative.
- [Risk] Human-readable taxonomy can drift from internal kinds → Mitigation: define one canonical mapping and surface it in docs and status views.
- [Risk] Borrowing too much UI vocabulary from interview-style tools can make the console feel like a form, not a memory inspector → Mitigation: keep the console centered on memory review and diagnostics, not on freeform questionnaire flows.
- [Risk] Two visual surfaces can diverge stylistically → Mitigation: define a shared visual language and reuse the same taxonomy, labels, and action affordances across both.
