## Context

See proposal.md - Why. This change is the memory-state companion to `xpi-memo-ui-visual-layer`: that change decides how the UI looks, while this one decides what memory state must exist and be observable so the UI is meaningful. Current code already has governed memory, candidate lifecycle, recall policy, L0 tracing, and a rich status panel; the gap is not storage existence, but activation, observability, and explainability.

## Goals / Non-Goals

**Goals:**
- Make memory state understandable to humans through labels, scopes, lifecycle state, provenance, and counts.
- Improve activation so explicit user memory intent is captured without relying on the agent to remember to remember.
- Provide a gated offline extraction path for richer capture coverage without making it mandatory in the hot path.
- Make recall results more relevant through explicit ranking and budget constraints.
- Preserve xpi-memo identity and attribution discipline across memory-facing surfaces.

**Non-Goals:**
- Replacing `pi-tui` or `glimpseui`; those belong to `xpi-memo-ui-visual-layer`.
- Replacing mnemosyne or the current storage model.
- Introducing code graph / review graph integration.
- Changing the external user contract of xpi-memo into a browser app or a different product family.
### 6) Share one read-only status contract with both visual surfaces

`src/status.ts` owns the shared `MemoryStatus` view model consumed by both the terminal console and the optional rich status panel. `src/observability.ts` owns the derived `ObservabilitySnapshot` used for bounded diagnostic counts and metadata. `src/kinds.ts` owns the canonical T1 taxonomy; labels, roles, scopes, trust-state text, and section titles are never redefined by a surface.

The terminal and rich surfaces MUST:
- consume the same `MemoryStatus`, `ObservabilitySnapshot`, and canonical taxonomy values;
- render state without writing memory, candidates, audit entries, or L0 events;
- keep body-free status and diagnostic output as the default;
- use the existing candidate lifecycle for Store / Later / Reject rather than creating another queue.

The memory layer MUST remain the source of truth for storage, governance, provenance, and observability. The UI layer owns presentation and interaction only; it may request an existing operation but may not persist UI-specific memory state.


## Decisions

### 1) Split the change into two capabilities: observability and activation
The memory problem has two separate contracts. Observability answers "what happened?" and "what is this memory?" Activation answers "how does memory enter the system reliably?" Keeping them separate prevents the planning artifacts from mixing UI presentation with memory behavior.

Alternatives considered:
- One combined capability: simpler artifact count, but harder to review and easier to conflate UI with behavior.
- Fold everything into `xpi-memo-ui-visual-layer`: wrong boundary; UI rendering does not define memory semantics.

### 2) Make explicit capture the first activation path, with offline extraction as gated enrichment
The reliable hot path must be deterministic and low-friction for explicit user memory intent. A gated offline extraction track can improve coverage, but it should not become a hard dependency for core capture.

Alternatives considered:
- Rules-only hot path: safe, but likely too weak for real-world memory density.
- Always-on LLM extraction: higher coverage, but too much cost and policy complexity in the hot path.

### 3) Separate standing memory from contextual memory in recall behavior
Recall needs to distinguish stable long-lived memory from session-adjacent context, or the user will see stale or noisy results. Budgets, intent weighting, and dedupe are necessary to keep injected memory useful.

Alternatives considered:
- Flat recall pool: easier to build, but hard to trust and hard to explain.
- Large unbounded injection: simpler semantics, unacceptable for token discipline.

### 4) Surface candidate digests instead of hiding pending work
Pending memories should be visible to users before they rot in an invisible queue. A lightweight digest or reminder is better than waiting for users to manually discover review backlog.

Alternatives considered:
- Silent queue only: repeats the current problem of invisible accumulation.
- Aggressive prompts every turn: too noisy and disruptive.

### 5) Keep branding and attribution explicit
The change must preserve xpi-memo as the product name while documenting inspiration and any copied permissive code separately. That keeps the product identity stable even if its UI vocabulary borrows from other tools.

Alternatives considered:
- Rebrand around upstream tool names: confuses the product and weakens identity.
- Omit attribution: not acceptable for reused ideas or code.

## Risks / Trade-offs

- [Risk] A second change can drift from the first UI-focused change → Mitigation: keep a clean boundary: this change defines memory behavior; the UI change defines presentation.
- [Risk] Gated offline extraction can feel optional and thus underused → Mitigation: make it a recommended enrichment path with explicit visibility in the design.
- [Risk] More visible memory state can expose noisy or low-value items → Mitigation: enforce budgets, dedupe, and clear lifecycle states.
- [Risk] Human-readable taxonomy may diverge from internal kinds over time → Mitigation: keep one canonical mapping and reference it from docs and status surfaces.
