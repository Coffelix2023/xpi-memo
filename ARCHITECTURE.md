# xpi-memo Architecture

xpi-memo is a Pi Coding Agent extension (TypeScript, loaded directly from `src/index.ts`, no build step). It layers a lossless session trace (L0) under governed long-term memory (T1), derives human-readable Markdown from L0, and searches through pluggable backends.

**Default-value philosophy:** local deterministic operations default on; operations that consume external resources or are irreversible default off.

## Layer model

```
┌─────────────────────────────────────────────┐
│  Pi host (hooks, tools, commands, TUI)      │  src/index.ts
├─────────────────────────────────────────────┤
│  T1 governed memory                         │  routing / candidate-lifecycle /
│  (activation loop; governance; recall)      │  memory-activation / recall-policy /
│                                             │  recall-ranking / audit / registry / kinds
├─────────────────────────────────────────────┤
│  Search backends (pluggable, fallback)      │  src/search/*
├─────────────────────────────────────────────┤
│  Derived views: Markdown export,            │  src/markdown-export/*
│  mental-model projections                   │  src/mental-model/*
├─────────────────────────────────────────────┤
│  L0 session trace (append-only JSONL)       │  src/l0/*
├─────────────────────────────────────────────┤
│  Storage: mnemosyne banks (SQLite) + files  │  banks/, audit.json, candidates.json,
│                                             │  idempotency.json, extraction-budget.json,
│                                             │  mental-models/
└─────────────────────────────────────────────┘
```

Ownership is fixed: L0 owns the raw event history; T1 owns governed long-term memory; Markdown **and mental-model projections** are derived views that can be regenerated at any time. L0 never promotes content into T1 by itself — a concise conclusion must pass T1's evidence, provenance, and confirmation rules (see `docs/archive/2026-09/contracts/l0-contract.md`).

## L0 layer (`src/l0/`)

- **`event-log-writer.ts`** — append-only JSONL writer. One writer per session; positions are monotonic per session and recovered by scanning the active log on restart. The active file's byte size is tracked in memory, so appends are stat-free; when the size crosses `L0_ROTATE_BYTES` (10 MB) the log rotates to `events.001.jsonl`, `events.002.jsonl`, … (same-dir rename, oldest = highest index).
- **`event-log-reader.ts`** — streaming reader over active + rotated files in position order. `readAfter(fromPosition)` is the incremental fast path: rotated files are pre-checked with a bounded 64 KB tail scan and skipped entirely when their max position is below the mark (positions are monotonic, so they cannot contain new events). Corrupt lines are skipped and surfaced, never mutated.
- **`l0-runtime.ts`** — one `L0Coordinator` per extension process = one session. `record()` throws on failure (governed T1 writes MUST abort when L0 is unavailable — dual-write, L0 first); `recordSafe()` is best-effort for hooks.
- **`context-derivation.ts`** — deterministic, LLM-free derivation of a model-visible context view (type filtering, budget, folding markers). Same log + policy + budget ⇒ same view.

Dual-write: a T1 write appends to L0 first, then writes to mnemosyne + `audit.json`. If L0 fails, the whole operation aborts. If a later write fails, L0 still holds the record — `/xpi-memo-trace` gives a bounded path back to the originating L0 session/event for diagnosis; there is no automated replay.

## Markdown export (`src/markdown-export/`)

`exportMarkdown()` reads every session through `readAfter(lastExportedPosition)` (state in `markdown/export-state.json`), folds events into `daily/YYYY-MM-DD.md` (append-only day files) and projects `MEMORY.md`. Writes are temp-file + rename. `AUTO_EXPORT` defaults to on (local deterministic); disable with `XPI_MEMO_AUTO_EXPORT=false`.

**MEMORY.md is a projection of the bank's current state** (`bank-state.ts`, `memory-generator.ts`): the entry set comes from the memory rows the bank holds right now (the default bank plus every project bank under `<dataDir>/banks/`), read through a bounded `mnemosyne export` — fixed 5 s timeout per bank, fixed 5 MB payload cap, private temporary file removed on every outcome, and a failure of any bank fails the whole read. L0 is used only to annotate a row: `t1_memory_write` supplies kind, scope, confirming time, session and position, keyed by the bank memory id. A row the bank holds without a matching L0 write is still projected, in an explicit `Unclassified` section marked `source missing` — never dropped, never guessed. Deletion therefore needs no projection logic: a row that left the bank left the view. Duplicates in the same bank and kind stay in the projection and are marked `supersededBy`; SQLite is never rewritten. Order is fixed at (section, L0 position, memory id) with unannotated rows last, so identical state and annotations produce byte-identical output.

Projection failure semantics (`memory-projection-state.json`): a bank read failure, a timeout, an unparseable payload, or a write failure leaves the last successful `MEMORY.md` in place and marks the projection `pending`/`failed`, so the next export retries — an empty or partial projection is never written. An export with no memory-affecting event is a no-op for `MEMORY.md` unless the file diverged from the projection's recorded content hash (hand-edited or deleted), which triggers a rebuild on the next export.

**Two different boundaries, deliberately** (change `markdown-state-projection`): *the projection layer reads whole-bank state* — that is what a state view is, it is read-only, bounded per bank, and runs as a background/derived-view action; *`xpi_memo_forget` must never use a full-library scan* — it resolves exactly one memory by id and either reads that one row (when the backend exposes exact-ID read) or deletes by id, never enumerating the library, never using semantic `recall`, and never touching SQLite directly (see `GUIDE.md`, `TROUBLESHOOTING.md`). The two decisions do not conflict because they answer different questions with different cost profiles: "what is remembered now" vs "remove this one id".

## Search backends (`src/search/`)

`SearchBackend` interface with three implementations: **mnemosyne** (wraps the existing CLI recall; global→global bank, project→project bank), **ripgrep** (full-text over `markdown/` + `sessions/`), **qmd** (external semantic CLI). Selection walks configured → mnemosyne → ripgrep → qmd; unavailability (checked via a per-process `which` cache) and mid-search failures are recorded as `BackendAttempt`s and the chain degrades. Per-query metrics (latency, result count) are kept for status reporting.

## T1 governance (top level `src/`)

- **routing** (`routing.ts`, `banks.ts`, `local-identity.ts`) — global / project / session scope; project identity from git (`identity.ts`: canonical common dir hash + normalized remote aliases, cached per cwd) selects a per-project bank. Non-Git directories get a stable identity only via explicit initialization (`/xpi-memo-init` or the `xpi_memo_init` tool writes `.pi/xpi-memo/project.json` mode 0600); without it, project kinds are rejected with `routing_rejected`/`project-identity-required` plus a structured `recovery: { agent, tui, cli }` hint, and never fall back to the global bank.
- **candidate lifecycle** (`candidate-lifecycle.ts`, `pending-candidate.ts`) — writes that need review become candidates and are confirmed/rejected explicitly (Store / Later / Reject).
- **policies** (`recall-policy.ts`, `auto-store-policy.ts`, `content-policy.ts`, `promotion-policy.ts`, `sleep-*.ts`) — recall decisions, auto-store gating, prohibited content, promotion, and consolidation. Local deterministic operations default on (`AUTO_EXPORT`); operations that consume external resources or are irreversible default off (Track B extraction, dedicated/session-model sleep). Mechanical sleep is local Markdown maintenance and does not call an external sleep CLI.
- **audit + registry** (`audit.ts`, `registry.ts`) — append-only audit trail (historical provenance values are never rewritten) and project registry with remote-based move repair.

### Activation loop (`memory-intent.ts`, `memory-activation.ts`, `memory-idempotency.ts`)

`src/memory-intent.ts` extracts explicit user intent deterministically (pattern-based, Chinese + English, correction signals; no LLM in the hot path). `src/memory-activation.ts` routes the result through the existing T1 governance path: prohibited-content check, scope routing via `routeMemoryKind`, evidence classification, and the candidate lifecycle. Global preferences/workflows store directly; project decisions, constraints, and gotchas become candidates; `project_gene` requires verified evidence and is never auto-extracted.

Activation is wired to L0 provenance: the input hook records a `user_message` event, and activation runs against that event position so evidence classification can distinguish `explicit-user-statement` (provenance source `input:…`) from `verified-tool-result` (tool input, model inference, derived content — `src/evidence.ts` `evidenceTypeForProvenance`). `src/memory-idempotency.ts` persists a sha256 content fingerprint plus session/event/kind key, so replaying an event or a simultaneous explicit `xpi_memo_remember` never creates a duplicate row or candidate.

### Gated offline extraction (`offline-extraction.ts`, `extraction-budget.ts`)

Provider-neutral: the runner is injected by the host (`dependencies.offlineExtractionRunner`), so no model dependency lives in the module. Disabled by default (`offlineExtractionEnabled: false`). When enabled it runs at `session_shutdown` and `session_before_compact`, sharing one per-session ledger. The ledger records `consumedThrough` so the same L0 range is never consumed twice, and still enforces one execution, 20 proposals, and 5,000 proposal characters per session. Compact and shutdown failures are best-effort and never block the lifecycle. Disable with `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=false`.

The extraction model is configurable: `offlineExtractionModel` (or `XPI_MEMO_OFFLINE_EXTRACTION_MODEL`) takes `"session-model"` — the default, meaning the session's chat model — or a `provider/model-id` (a bare model id also works) resolved against the model registry. An id that resolves to nothing falls back to the session model, so a typo never silently disables extraction.

### Mental-model projections (`src/mental-model/`, `src/mental-model-runner.ts`)

A **projection** is a bounded, replaceable standing answer derived from confirmed T1 rows: "how does this user prefer to work" (global) and "how does this project operate today" (current project). It is derived state, never a second truth store — L0 stays authoritative for event history and provenance, confirmed T1 rows stay authoritative for current governed memory, and a projection can be deleted and rebuilt at any time. `mental_model` is deliberately **not** a T1 memory kind, so generated prose can never enter routing, admission, recall, or export as if it were a governed fact.

**Definitions** (`definitions.ts`) are code-owned and versioned: `user-working-style` (scope `global`, kinds `global_preference` + `global_workflow`) and `active-project-operating-model` (scope `project`, kinds `project_constraint` + `project_decision` + `project_gene` + `project_gotcha`). There is no registration API — lookup only succeeds for an id already in the registry, which is what makes "no automatic definition discovery" a structural property. Changing a definition's question, kinds, or `version` invalidates its persisted projection, because the digest mixes the version in.

**Freshness** (`freshness.ts`, `evaluate.ts`) is a pure, model-free comparison of definition version, owner key, and a canonical source digest (SHA-256 over each selected row's id + kind + scope + content, ordered by memory id). The digest — not a timestamp — is the authority, so a deletion or supersession that leaves a *newer* surviving row is still detected. States are `absent` / `fresh` / `stale` / `pending` / `failed` / `disabled`; `pending` is transient in-process only. An unreadable bank read or projection file fails closed to `failed` — the system never calls a stale record fresh. When the persisted record already decides the state (missing file, empty digest, version bump), no bank export is performed at all, so a default installation pays nothing on the prompt path.

**Sources** (`sources.ts`, `owner.ts`) come from the existing bounded bank-export reader (never SQLite): owner bank and semantic scope, the definition's exact kind allowlist, source-metadata validity, superseded/deleted exclusion, deterministic sort by memory id, then fixed budgets (32 rows / 12 000 characters). Owner keys are derived only from existing routing identity — the literal `global`, or the canonical `project-<id>` bank — and a project definition with no recognized identity is skipped rather than rehomed into the global bank. The reader is memoized per session and owner (`memo.ts`) and invalidated on any observed T1 write.

**Storage** (`store.ts`) keeps exactly one record per `(definitionId, ownerKey)`, written through temp-file + rename with strict shape validation. The record holds the last successful payload plus the last attempt outcome: a failed refresh rewrites failure metadata and keeps `content`, `sourceIds`, `sourceDigest`, and `sourceBoundary` intact, so a failure can never make old content look current. A record that does not match the closed shape reads as a failure, not as "absent".

**Gated synthesis** (`refresh.ts`, `synthesis.ts`, `refresh-ledger.ts`, `mental-model-runner.ts`) runs only at `session_before_compact` and `session_shutdown`, best-effort and non-blocking, and only when `mentalModelSynthesisEnabled` is `true`. It walks definitions in order, refreshes only `stale`/`absent`/`failed` ones with non-empty safe sources, and accounts every attempt in a count-only per-session ledger keyed by `(definitionId, digest)` (one attempt per definition per digest, 8 attempts / 12 000 generated characters per session, reset across sessions). The runner is provider-neutral and reuses the offline-extraction runner precedence, session-model resolution, credential redaction, timeout/abort handling, and safety boundary; it does not run proposal normalization or T1 governance, because a projection is not a memory proposal. The model's output must be exactly `{content, sourceIds}` with returned ids a subset of the submitted ids, inside the content cap and the injection policy — anything else is rejected before persistence. The successful digest advances only after the atomic write succeeds.

**Delivery** (`delivery.ts`) happens during automatic context assembly, before ordinary recall: only `fresh`, enabled projections whose scope matches the request and whose kind intents the query mentions are eligible; project projections require an exact owner match. Content is wrapped in the existing `<untrusted-memory-data>` boundary as explicitly derived data, with an independent budget (2 items / 900 characters) and a whole-item discard — never a truncated authority block. The delivered projection's source ids are then excluded from automatic recall ranking (counted as `suppressedCovered`), while explicit `xpi_memo_recall` stays untouched. If nothing safe and fresh survives, ordinary recall and profile assembly proceed unchanged.

### Recall ranking (`recall-ranking.ts`)

Pure backend-agnostic post-processing for automatic injection: standing vs contextual roles from the canonical taxonomy, query-intent weighting (`detectQueryIntent`), recency decay (30-day half-life), scope priority, superseded filtering, content deduplication, and per-role item + character budgets. Returns `null` when nothing survives so the caller omits the memory block. Explicit `xpi_memo_recall` output is untouched.

### Observability (`observability.ts`, `candidate-digest.ts`, `status.ts`, `doctor.ts`)

`src/kinds.ts` owns the single canonical taxonomy (7 kinds: label, role, scope, trust state, section title); status, console, and export consume it and never redefine labels. `src/observability.ts` derives the body-free `ObservabilitySnapshot` (capture/candidate/storage/recall/injection/rejection counts, per-kind taxonomy counts, bounded recent metadata — never memory bodies or rejection reasons) from the audit trail; routing rejections and post-routing failures (`routing_rejected`/`memory_failed` L0 events) are counted separately. `src/candidate-digest.ts` builds the body-free backlog digest (pending count, per-kind counts, oldest age, review surface) for TUI and startup notifications; session-start reminder is non-blocking and throttled to once per 6 hours when the backlog reaches 3+. `src/doctor.ts` classifies an empty T1 into `NEVER_CALLED` / `PENDING` / `WRITE_FAILED` / `RECALL_EMPTY`. Status surfaces the effective recall scope (`current-project-plus-global` / `global-only`), backend execution state (`backend-not-run` vs `backend-queried-no-hits` vs `backend-queried-with-hits`), sleep capability/state (`SLEEP_DISABLED` when no mode is usable), and read-only orphan project banks. `src/source-trace.ts` gives a bounded path back to the originating L0 session/event without dumping a transcript.

Mental-model surfaces are body-free and bounded (`src/mental-model/observability.ts`, `status.ts`): each refresh attempt and each delivery decision writes one L0 event (`mental_model_refresh`, `mental_model_injected`) plus one `mental-model` audit record carrying definition id, owner key, source count, digest prefix, source boundary, duration, output size, closed outcome/status codes, and closed omission reasons — never a projection body, source body, prompt, or raw model output. `MemoryStatus.mentalModels` reports all six states plus a `skipped` count, the synthesis switch, injected/omitted counters, per-outcome refresh counts, and a bounded recent tail; `doctor.evidence.mentalModels` carries the same counts. `/xpi-memo-trace --projection <definitionId>` resolves a projection's source ids through the existing exact-ID read path and labels the projection `derived`, reporting id/kind/scope/resolution only (max 16 rows, `truncated` beyond that) — a missing exact-ID capability degrades to `unavailable`, never to "missing" and never to a bank dump. With synthesis off (the default) the projection layer writes no records and reads no bank, so an upgraded installation behaves exactly as before.

## Data layout

```
~/.pi/agent/xpi-memo/
├── mnemosyne.db                # global bank
├── banks/project-*/mnemosyne.db
├── audit.json                  # append-only audit trail
├── candidates.json
├── idempotency.json            # activation idempotency ledger (fingerprints)
├── extraction-budget.json      # per-session offline-extraction budget ledger
├── mental-models/              # derived mental-model projections (deletable)
│   ├── global/<definitionId>.json
│   ├── projects/<project-bank>/<definitionId>.json
│   └── refresh-ledger.json     # count-only per-session attempt ledger
├── sessions/<sessionId>/events.jsonl (+ events.NNN.jsonl)
└── markdown/
    ├── MEMORY.md
    ├── daily/YYYY-MM-DD.md
    ├── export-state.json
    └── memory-projection-state.json
```

The global data root above is the only machine-state write/recall engine. In addition, an **explicit project layer** may exist under a project root:

```
<projectRoot>/.pi/memory/<kind>.md     # repo-export: deterministic, privacy-filtered Markdown per project kind
<projectRoot>/.pi/xpi-memo/project.json  # local (non-Git) project identity metadata only
```

The project layer never contains SQLite, WAL, SHM, or search indexes — those stay in the global root. Worktrees share one bank via the Git common directory; the export target resolves to each worktree's own project root.

`mental-models/` holds derived projections only, one file per `(definitionId, ownerKey)`, mode 0600 inside a 0700 tree. Deleting the whole directory loses nothing that confirmed T1 rows and L0 cannot regenerate: the next eligible refresh rebuilds it from scratch. It is the supported rollback for this feature (see `GUIDE.md`).

## Testing

1,150+ Vitest tests across unit and integration layers (`*.test.ts` colocated, `real-cli.integration.test.ts` exercises a real mnemosyne CLI, `isolated-pi.integration.test.ts` runs against an isolated Pi install, `mental-model-*.integration.test.ts` drives the real registered hooks for compatibility, isolation, and failure boundaries). `scripts/bench.ts` micro-benchmarks the hot paths (append, incremental export, identity cache).
