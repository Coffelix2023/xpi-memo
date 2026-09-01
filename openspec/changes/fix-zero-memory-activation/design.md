## Context

See `proposal.md` for why. Current code already has governed writes (`src/index.ts` `executeRemember`), candidate persistence (`src/candidate-lifecycle.ts`), and CLI spawn with `MNEMOSYNE_DATA_DIR` (`src/cli.ts`). Empty production data is an activation and observability failure, not a missing storage engine. Constraints: no new dependencies, no symlink repair, do not relax `shouldAutoStore`, keep `candidate-lifecycle` confirm/reject semantics.

## Goals / Non-Goals

**Goals:**

- One doctor report that names a single empty-memory state and the evidence that selected it.
- Remember calls that cannot hide behind a default kind or a binary confirm dialog.
- Recall JSON that names queried banks even when results are empty.
- CLI cross-checks against the same data root the extension uses.

**Non-Goals:**

- Auto-promoting L0 events into T1.
- Rewriting search backends or embedding models.
- Archiving `xpi-memo-staged-evolution`.
- Deleting hermes or `~/xpi-memo` copies automatically.
- Providing an automated copy-once migration command; consolidation is a documented manual CLI cross-check.

## Decisions

### Decision 1: Extend existing doctor surface instead of a new product

**Chosen:** Add a health report to the existing L0/status command family (`/xpi-memo-l0` or `/xpi-memo-status`), defaulting to JSON plus a short TUI panel that matches `TUI-DESIGN.md`.

**Rationale:** Status already gathers banks, backend, and pending counts. Empty-memory diagnosis is a classification over that snapshot plus audit/L0 event counts. A second command would duplicate the surface.

**Alternatives considered:**

- New `/xpi-memo-doctor` only: clearer name, extra command to discover.
- Audit-timeline UI as the primary diagnosis: good narrative, weak executable state.

State precedence (first match wins): `PENDING` if candidates exist; `WRITE_FAILED` if remember attempts exist without stored rows; `NEVER_CALLED` if no remember/candidate evidence; otherwise `RECALL_EMPTY` when banks are queried and empty.

### Decision 2: Kind becomes a required enum at the tool schema

**Chosen:** Change `rememberParameters.kind` from optional string to a required union of the existing `MEMORY_KINDS`. Validation failure happens before `operationFor`.

**Rationale:** The silent default to `session_context` both hides caller mistakes and, in a git project, auto-stores short session notes. The deck contract is “make the tool contract unmistakable”, not “write more by default”.

**Alternatives considered:**

- Keep optional kind, warn in the skill only: callers will keep omitting it.
- Treat any remember invocation as consent to auto-store: rejected in the deck; increases accidental durable writes.

### Decision 3: Three-way confirm reuses candidate store, not a new queue

**Chosen:** Replace the blocking `ctx.ui.confirm` yes/no with a three-option selector (Store / Later / Reject) that still calls `candidates.confirm` / `candidates.reject`, or leaves the record in `candidates.json` on Later. Pending tab already lists `runtime.candidates.list()`.

**Rationale:** Lifecycle semantics stay in `candidate-lifecycle.ts`. Later is the missing third state of the current dialog (today Cancel == reject). Use Pi `ctx.ui.select` if available; otherwise a custom overlay with the same three actions. Do not add a second candidate file.

**Alternatives considered:**

- Keep yes/no confirm: no Later, agent-facing card has no evidence summary.
- Queue-only (always Later): repeats today’s empty-T1 failure mode if nobody opens `/xpi-memo`.

### Decision 4: `queriedBanks` is produced by the search outcome, not by result mapping

**Chosen:** Have the mnemosyne search path (and `toRecallResponse`) take queried bank names from the backend query plan, not from result rows. Empty results still list the banks that were asked.

**Rationale:** Today `queriedBanks` is `Set(result.source.bank)`, so zero hits become `[]` and look like “no bank consulted”. `src/recall.ts` already pushes banks before reading rows; pluggable search bypasses that helper.

**Alternatives considered:**

- Switch executeRecall back to `recall()` in `src/recall.ts`: restores bank listing but drops the backend chain.
- Leave `[]` and document it: keeps the misdiagnosis that started this change.

### Decision 5: Shared root is config plus doctor detection, not a symlink

**Chosen:** Document and doctor-detect three surfaces: configured `dataDir`, mnemosyne CLI default (`~/.hermes/mnemosyne/data` when unset), and stale `~/xpi-memo`. Spawned CLI already sets `MNEMOSYNE_DATA_DIR`. Doctor reports the surfaces read-only; consolidation is a documented manual CLI cross-check, not an automated migrate. Never symlink.

**Rationale:** Extension writes are already on `~/.pi/agent/xpi-memo`. The split only bites humans running bare `mnemosyne stats`. Both extra surfaces are empty in production, so an automated migrate would be a no-op; a documented manual CLI cross-check is sufficient.

**Alternatives considered:**

- Force CLI default onto the extension path in user shell config: out of extension control, easy to miss on new machines.
- Symlink hermes → extension: hides two writers behind one inode; rejected by the deck contract.
- Automated copy-once migrate command: rejected — both extra surfaces are empty in production, so a migrate would be a no-op; a documented manual `MNEMOSYNE_DATA_DIR` CLI cross-check covers the real (diagnostic) need.

## Risks / Trade-offs

- **[Risk] Required `kind` breaks existing agent prompts** → Mitigation: closed enum in the tool schema plus `memory-boundaries` skill update; invalid calls fail closed instead of writing the wrong kind.
- **[Risk] Later becomes a graveyard** → Mitigation: doctor `PENDING` state plus Pending inbox; do not auto-expire in this change.
- **[Risk] Three-way UI unavailable in non-TUI mode** → Mitigation: non-TUI remember of candidate kinds returns `candidate` and records the pending item; status tells the user to confirm in TUI.

## Migration Plan

1. Ship schema/UX/doctor behind the existing extension entry; no data rewrite on upgrade.
2. Existing `candidates.json` remains valid. In-flight yes/no dialogs become three-way on the next session.
3. Doctor reports forked surfaces read-only; consolidation is a documented manual CLI cross-check, not an automated migrate.
4. Rollback: revert the extension. Data files are append-only; doctor detection never modifies them.

## Open Questions

None that block specs or tasks. Selector widget vs custom overlay is an implementation detail bounded by Decision 3.
