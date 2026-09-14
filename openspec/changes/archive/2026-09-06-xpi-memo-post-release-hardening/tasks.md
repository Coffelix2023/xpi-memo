## 1. Boundary contracts and taxonomy

- [x] 1.1 Define the runtime outcome and reason-code contract for stored, candidate, rejected, skipped, degraded, unavailable, `routing_rejected`, and `SLEEP_DISABLED` states; verify typecheck passes and each state has a bounded machine-readable reason.
- [x] 1.2 Correct the canonical kind taxonomy so global kinds use `global`, project kinds use `project`, and `session_context` uses `session`; verify taxonomy tests cover all seven kinds and no existing consumer receives the old contradictory scope.
- [x] 1.3 Define explicit non-Git project initialization metadata and stable identity resolution for a directory plus descendants; verify repeated resolution returns the same identity and unrelated directories remain isolated.

## 2. Non-Git routing and session context

- [x] 2.1 Add the explicit non-Git project initialization command or tool and its safe state file; verify initialization creates only the intended metadata and does not create a project SQLite file in the repository.
- [x] 2.2 Update project routing to reject uninitialized non-Git project memory without global fallback; verify `project_decision`, `project_constraint`, `project_gene`, and `project_gotcha` return actionable guidance and create no global row or candidate.
- [x] 2.3 Decouple `session_context` from project identity while preserving session scope and lifecycle boundaries; verify it can be captured and recalled in an uninitialized non-Git directory but is excluded from unrelated sessions and global standing recall.
- [x] 2.4 Align operation envelopes, candidate records, audit metadata, recall results, and Markdown export metadata with canonical scope values; verify project and session records report `project` and `session` consistently end to end.

## 3. Failure observability and user feedback

- [x] 3.1 Emit bounded L0 and audit records for pre-candidate routing rejection, controlled degradation, policy rejection, and post-routing storage failure; verify records contain reason, kind, scope when known, identity state, and outcome without memory bodies or secrets.
- [x] 3.2 Replace generic remember/recall/sleep failure text with actionable, compatibility-safe responses that distinguish routing, policy, candidate, backend, and capability failures; verify non-Git writes no longer return only `Memory write failed.`.
- [x] 3.3 Extend doctor/status snapshots with routing rejection counts, degraded-mode state, effective recall scope, backend execution state, and sleep capability state; verify outputs are bounded, body-free, and distinguish backend-no-hit from backend-not-run.
- [x] 3.4 Add the explicit `SLEEP_DISABLED` diagnostic state and actual execution-mode reporting; verify unauthorized sleep remains rejected and authorized sleep cannot claim dedicated execution when only a fallback or no mode exists.

## 4. Activation-loop acceptance

- [x] 4.1 Add non-TUI integration coverage for explicit global preference/workflow capture without a manual `xpi_memo_remember` call; verify provenance, candidate/direct-write outcome, idempotency, and next-session recall.
- [x] 4.2 Add non-TUI Git-project coverage for project decision, constraint, and gotcha governance; verify candidate creation, review/confirmation path, project bank isolation, and later project-scoped recall.
- [x] 4.3 Add non-TUI non-Git coverage for global memory, session context, and uninitialized project memory; verify usable global/session outcomes, actionable project rejection, and corresponding L0/audit evidence.
- [x] 4.4 Exercise activation with offline extraction disabled, unavailable, failing, and enabled within existing budgets; verify explicit deterministic capture continues and extraction never blocks the active session.

## 5. Explicit sleep fallback

- [x] 5.1 Define configuration parsing and capability inspection for dedicated, explicit session-model, mechanical, and disabled sleep modes; verify invalid or missing configuration fails closed with a visible reason.
- [x] 5.2 Implement authorized session-model and/or mechanical fallback execution without weakening privacy, idempotency, or audit rules; verify the response names the actual mode and no fallback is labeled dedicated.
- [x] 5.3 Add status, doctor, tool, and integration tests for authorized/unauthorized sleep with each capability state; verify no-memory-change behavior when sleep is disabled and one-shot authorization remains required.

## 6. Repository Markdown export and governed re-import

- [x] 6.1 Add project-root `.pi/memory/` export targets by kind while retaining global SQLite as the only machine-state write and recall engine; verify export never creates SQLite, WAL, or SHM files in the repository.
- [x] 6.2 Implement deterministic, privacy-filtered Markdown rendering with stable memory ID anchors, canonical kind/scope metadata, source summaries, and stable ordering; verify repeated export produces no unrelated diff and prohibited content is omitted or rejected without body leakage.
- [x] 6.3 Add governed `repo-export` discovery and re-import through existing content policy, scope routing, candidate lifecycle, and idempotency; verify cloned project exports become reviewable evidence and repeated discovery creates no duplicates.
- [x] 6.4 Add read-only orphan project bank detection and worktree-safe project-root resolution; verify orphan banks are reported without deletion and multiple worktrees continue sharing the same global project bank.

## 7. Documentation and production verification

- [x] 7.1 Document non-Git initialization, session scope, effective recall ranges, failure reasons, sleep modes, and project Markdown export; verify commands, defaults, and rollback behavior match the implemented contracts.
- [x] 7.2 Add regression tests for existing Git routing, global/project physical separation, historical audit/L0 readability, privacy redaction, and backward-compatible tool names; verify existing test expectations are updated only where the new contract intentionally changes behavior.
- [x] 7.3 Run the acceptance matrix across Git/non-Git initialized/non-Git uninitialized, TUI/non-TUI, and sleep capability states; verify all required user-visible outcomes are actionable and no scenario silently falls back across scopes.
- [x] 7.4 Run `pnpm typecheck`, `pnpm -w run lint`, and `pnpm test`; verify all pass and the final diff contains only planned implementation, test, and documentation changes.
