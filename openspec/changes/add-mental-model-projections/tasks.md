## 1. Domain contracts and definitions

- [x] 1.1 Add mental-model definition, owner, projection, freshness, refresh-result, and bounded diagnostic types in focused modules; verify TypeScript rejects unknown states and no `mental_model` value is added to `MEMORY_KINDS`.
- [x] 1.2 Add the versioned `user-working-style` and `active-project-operating-model` built-in definitions with exact scope/kind allowlists; verify unit tests cover both definitions and reject automatic/ad-hoc definition creation.
- [x] 1.3 Add configuration parsing for per-definition enablement and `mentalModelSynthesisEnabled`, default synthesis to `false`, and verify existing config fixtures load unchanged while invalid values fail closed.
- [x] 1.4 Record this task group's purpose, behavior, boundaries, verification evidence, and rollback notes in the next `docs/task-report/dev-<编号>/repo-task<编号>.md` report required by `AGENTS.md`.

## 2. Projection persistence and source selection

- [x] 2.1 Implement private, versioned projection paths keyed by definition and `global` or canonical project owner; verify path tests prove two projects cannot resolve to the same projection and missing project identity fails closed.
- [x] 2.2 Implement atomic projection read/write with temp-file rename, strict shape validation, bounded source IDs/failure metadata, and preservation of the last successful payload on failed refresh; verify corruption, interrupted write, first failure, and refresh failure tests.
- [x] 2.3 Reuse the bounded bank projection/export reader to select confirmed rows by owner, scope, and kind without direct SQLite access; verify tests exclude candidates, superseded rows, session rows, other projects, unknown kinds, and over-budget sources.
- [x] 2.4 Compute a deterministic source digest from canonical state-relevant row data plus definition version and derive absent/fresh/stale/failed/disabled states; verify additions, confirmations, supersessions, deletions, definition changes, stable ordering, and bank-read failures.
- [x] 2.5 Add per-session memoization for unchanged source evaluations and verify repeated checks avoid duplicate bank reads without reusing results across owner keys or changed source state.
- [x] 2.6 Record this task group's purpose, behavior, boundaries, verification evidence, and rollback notes in the next `docs/task-report/dev-<编号>/repo-task<编号>.md` report required by `AGENTS.md`.

## 3. Gated synthesis

- [x] 3.1 Add a count-only, atomic per-session refresh ledger keyed by definition and source digest with one-attempt-per-definition defaults and a bounded shared output budget; verify compact/shutdown duplicate attempts are skipped and stale state in another session resets safely.
- [x] 3.2 Add a provider-neutral mental-model runner boundary that reuses injected-runner precedence, session-model resolution, credential protection, timeout, and abort behavior without invoking proposal normalization or T1 governance; verify disabled, unavailable, timeout, abort, safety-refusal, and thrown-error outcomes.
- [x] 3.3 Define and validate the closed synthesis output shape, cap generated content and source IDs, and require returned source IDs to be a subset of submitted IDs; verify malformed, oversized, empty, unknown-source, and unsafe generated outputs are rejected.
- [x] 3.4 Implement the refresh coordinator so only stale/absent enabled definitions with safe non-empty sources and available budgets run; verify success atomically advances the digest while every failure preserves old content and leaves the same changes eligible for retry.
- [x] 3.5 Wire refresh to `session_before_compact` and `session_shutdown` as best-effort non-blocking work, without changing existing offline extraction quotas or session completion; verify lifecycle integration tests cover both triggers and duplicate suppression.
- [x] 3.6 Record this task group's purpose, behavior, boundaries, verification evidence, and rollback notes in the next `docs/task-report/dev-<编号>/repo-task<编号>.md` report required by `AGENTS.md`.

## 4. Bounded automatic delivery

- [x] 4.1 Implement query/context eligibility for the exact current-project operating model and the global working-style model; verify wrong-project, missing-identity, irrelevant-query, disabled, stale, pending, failed, and absent projections are excluded.
- [x] 4.2 Render eligible projections as explicitly untrusted derived memory data through the existing prompt-injection/safety boundary and an independent maximum-two-item character budget; verify unsafe and over-budget projections are omitted without blocking safe recall.
- [x] 4.3 Extend automatic recall ranking input with selected projection source-ID exclusions while leaving explicit `xpi_memo_recall` unchanged; verify covered rows are suppressed, independently necessary unmatched rows may survive, and diagnostics count duplicate suppression.
- [x] 4.4 Wire projection delivery before ordinary automatic recall/profile assembly with fallback to existing behavior when no safe fresh projection survives; verify integration snapshots contain no empty block, no cross-project body, and no duplicated covered rows.
- [x] 4.5 Record this task group's purpose, behavior, boundaries, verification evidence, and rollback notes in the next `docs/task-report/dev-<编号>/repo-task<编号>.md` report required by `AGENTS.md`.

## 5. Observability and traceability

- [x] 5.1 Add bounded L0/audit lifecycle records for freshness, refresh, refusal, failure, skip, and injection outcomes; verify records include definition/owner/source-count/digest-prefix/boundary/status metadata and exclude source bodies, generated bodies, prompts, credentials, and raw model output.
- [x] 5.2 Extend status/doctor contracts and renderers with absent, fresh, stale, pending, failed, and disabled projection counts plus distinct refresh outcomes; verify old audit/L0/config data remains readable and default output is body-free.
- [x] 5.3 Add a bounded projection source-trace path that resolves source memory IDs through existing T1/L0 tracing and labels the projection as derived; verify missing exact-ID capability or missing source rows degrades without dumping bank contents.
- [x] 5.4 Record this task group's purpose, behavior, boundaries, verification evidence, and rollback notes in the next `docs/task-report/dev-<编号>/repo-task<编号>.md` report required by `AGENTS.md`.

## 6. Compatibility and failure-boundary verification

- [x] 6.1 Add integration coverage proving projection generation never calls `runT1Write`, candidate admission, remember, forget, profile mutation, or Markdown export mutation; verify T1 banks, candidates, L0 history, and existing projections remain unchanged except for bounded lifecycle events.
- [x] 6.2 Add isolation tests for global plus multiple Git/local project identities, including missing identity and project movement aliases; verify owner keys use existing routing identity and never fall back across banks.
- [x] 6.3 Add failure-injection tests for bank export timeout/payload failure, corrupt projection, atomic-write failure, unsafe source, unsafe output, invalid runner output, budget exhaustion, and unavailable runner; verify none expose a stale projection as fresh or block session completion.
- [x] 6.4 Add compatibility tests proving synthesis-disabled startup requires no Hindsight service/package/API and preserves remember, candidate, recall, profile, export, forget, and configuration behavior.
- [x] 6.5 Record this task group's purpose, behavior, boundaries, verification evidence, and rollback notes in the next `docs/task-report/dev-<编号>/repo-task<编号>.md` report required by `AGENTS.md`.

## 7. Documentation and release gates

- [x] 7.1 Update `ARCHITECTURE.md` and user/operator documentation with the L0-history/T1-current-state/projection-derived ownership model, storage layout, defaults, status meanings, privacy boundary, and rollback procedure; verify every new config/status term is documented once and no Hindsight dependency is claimed.
- [x] 7.2 Add a bounded evaluation fixture for repeated project/user-theme questions and measure synthesis consistency, duplicate-source suppression, injected characters, refresh skips, stale rejection, and hot-path latency against the pre-change baseline; record results as evidence without presenting architecture estimates as measured gains.
- [x] 7.3 Run `openspec validate add-mental-model-projections --strict`, `pnpm typecheck`, `pnpm -w run lint`, and `pnpm test`; fix all failures and preserve command outputs in the final task report.
- [x] 7.4 Review the final diff for accidental Hindsight dependencies, a new T1 kind, direct SQLite access, unbounded history, body-bearing diagnostics, or project-scope fallback; verify `git diff --check` and document rollback of `<dataDir>/mental-models/`.
- [x] 7.5 Record this task group's purpose, behavior, boundaries, verification evidence, measured evaluation results, and rollback notes in the next `docs/task-report/dev-<编号>/repo-task<编号>.md` report required by `AGENTS.md`.
