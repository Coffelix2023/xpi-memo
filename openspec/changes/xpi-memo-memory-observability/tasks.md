## 1. Contracts and taxonomy

- [x] 1.1 Define one canonical mapping from all seven internal T1 kinds to human-readable labels, role (`standing` or `contextual`), scope, and trust-state display text; verify the mapping has unit coverage for every kind and is shared by status, console, and export consumers.
- [x] 1.2 Define the provenance-safe observability snapshot for capture, candidate, storage, recall, injection, and rejection outcomes; verify its serialized form contains counts and bounded metadata but no memory bodies, secrets, tokens, or credentials.
- [x] 1.3 Align this change with `xpi-memo-ui-visual-layer` by documenting the data contract consumed by the terminal and rich surfaces; verify neither change introduces a second memory source of truth.

## 2. Deterministic activation

- [x] 2.1 Implement explicit user-intent extraction for preference, workflow, project constraint, project decision, project gotcha, correction, and bounded session context signals; verify Chinese and English examples, ordinary conversation, ambiguity, conflicting categories, and missing project context.
- [x] 2.2 Route extracted content through the existing content policy, scope routing, evidence model, and candidate lifecycle; verify explicit low-risk global memory can store, review-required project memory becomes a candidate, prohibited content is rejected, and non-Git project content never falls back silently to the global bank.
- [x] 2.3 Integrate activation with L0 event provenance and make processing idempotent by session, event position, content fingerprint, and kind; verify repeated input or a simultaneous explicit `xpi_memo_remember` call creates no duplicate T1 row or candidate.
- [x] 2.4 Correct evidence classification so agent tool input, model inference, and derived content cannot be labeled `explicit-user-statement` without a supporting user event; verify the audit and diagnostic records preserve the actual evidence type.

## 3. Gated offline extraction

- [x] 3.1 Add a provider-neutral, injected offline extraction boundary that is disabled by default and runs only at a bounded lifecycle point such as compaction or session shutdown; verify the active coding path is not blocked when the runner is absent, slow, or failing.
- [x] 3.2 Validate and normalize extracted proposals into `{content, kind, confidence, evidence type, source reference}` before governance; verify extracted content never receives `explicit-user-statement` evidence automatically and is routed to direct storage or candidates according to confidence and risk.
- [x] 3.3 Enforce per-session proposal, character, and execution budgets with safe failure handling; verify budget exhaustion stops further work, does not read unbounded history, and records bounded diagnostics.
- [x] 3.4 Add configuration and lifecycle tests for disabled, enabled, unavailable, timeout, malformed-output, and successful extraction paths; verify deterministic explicit capture remains functional in every failure mode.

## 4. Candidate visibility and review pressure

- [x] 4.1 Add a bounded candidate digest containing pending count, category counts, oldest pending age, and the review surface or command; verify it contains no candidate body text by default and remains useful in TUI and non-TUI sessions.
- [x] 4.2 Add a low-noise session-start reminder with a throttle or cooldown; verify it appears only when the backlog requires attention, never opens a blocking dialog, and does not repeat on every prompt.
- [x] 4.3 Connect Store / Later / Reject outcomes to the observability snapshot and provenance-safe audit data; verify each action updates counts, leaves the existing candidate lifecycle semantics intact, and does not create a second queue.

## 5. Recall quality and bounded injection

- [x] 5.1 Classify standing and contextual memory from the canonical taxonomy and make recall query planning scope-aware; verify project prompts query the current project plus eligible global memory while excluding unrelated project banks.
- [x] 5.2 Add query-intent weighting for project decisions, repository facts, constraints, preferences, workflows, and gotchas; verify representative Chinese and English prompts prioritize the intended categories without changing explicit recall behavior.
- [x] 5.3 Add recency, confidence, scope priority, superseded filtering, and content deduplication to automatic recall ranking; verify stale or superseded memories cannot dominate newer relevant memories and duplicate content is emitted once.
- [x] 5.4 Enforce both item and character budgets for standing and contextual memory, omit the memory block when no eligible result exists, and preserve a stable injection shape; verify oversized results are truncated or omitted without injecting raw L0 or candidate data.
- [x] 5.5 Fix automatic recall policy reachability so configured `active`, `assist`, and `high-value-auto` behavior is honored; verify `active` can query ordinary prompts within budget, `assist` remains explicit-only, and `high-value-auto` requires its continuity signals.
- [x] 5.6 Record recall execution, queried banks or scopes, result counts, hit counts, injected counts, backend failures, and empty outcomes; verify status distinguishes “backend queried with no hits” from “no backend executed”.

## 6. Status, doctor, and source traceability

- [x] 6.1 Extend status and doctor output with global scope, current project scope, canonical data root, candidate backlog, taxonomy counts, activation metrics, and recall evidence; verify output is bounded, human-readable, and body-free by default.
- [x] 6.2 Add a bounded source-trace action for a visible memory or candidate; verify the user can locate the originating L0 session/event or review state without exposing an unbounded transcript.
- [x] 6.3 Ensure Markdown export renders human-readable sections for repository facts, preferences, workflows, decisions, gotchas, constraints, and bounded session context; verify no valid kind is silently grouped under `Other`.
- [x] 6.4 Add regression coverage for global/project physical separation, project identity changes, non-Git directories, split CLI roots, and read-only doctor inspection; verify no migration, symlink, or automatic root merge is introduced.

## 7. Documentation, attribution, and compatibility

- [x] 7.1 Update README, GUIDE.md, ARCHITECTURE.md, and TROUBLESHOOTING.md with the activation loop, human-readable taxonomy, candidate digest, recall budgets, and global/project boundary; verify commands, defaults, and failure states match the implementation contract.
- [x] 7.2 Document `mnemopi`, `pi-memory`, `pi-interview-tool`, and `glimpseui` as inspirations while keeping all user-facing commands, data labels, and status surfaces branded `xpi-memo`; verify upstream names do not become runtime API names.
- [x] 7.3 If implementation copies any permissively licensed code, add `THIRD_PARTY_NOTICES.md` with source URL, version or commit, copied files/functions, license text, copyright, and local modifications; verify no GPL source is copied into the extension.
- [x] 7.4 Document configuration compatibility, disabled-by-default extraction behavior, rollback behavior, and the absence of automatic data migration; verify existing banks, candidates, audit records, and L0 logs remain readable.
## 8. Verification and production acceptance

- [x] 8.1 Add unit tests for taxonomy mapping, activation extraction, evidence classification, redaction, idempotency, candidate digesting, ranking, deduplication, budgets, and status snapshots; verify each new requirement scenario has a direct automated check.
- [x] 8.2 Add integration tests using isolated `XPI_MEMO_DATA_DIR` values for at least three sessions; verify explicit capture creates useful T1 memory, project decisions remain governed candidates, global/project banks stay separate, and later sessions recall only eligible memory.
- [x] 8.3 Run the production acceptance checks for TUI, non-TUI, Glimpse-available, and Glimpse-unavailable environments; verify the core memory workflow remains usable without Glimpse and no blocking extraction or candidate reminder interrupts coding.
- [x] 8.4 Run `pnpm typecheck`, `pnpm -w run lint`, and `pnpm test`; verify all pass before marking this change complete and confirm no application code outside the planned implementation scope was modified accidentally.