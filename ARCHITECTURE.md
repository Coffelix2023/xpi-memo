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
│  Derived views: Markdown export             │  src/markdown-export/*
├─────────────────────────────────────────────┤
│  L0 session trace (append-only JSONL)       │  src/l0/*
├─────────────────────────────────────────────┤
│  Storage: mnemosyne banks (SQLite) + files  │  banks/, audit.json, candidates.json,
│                                             │  idempotency.json, extraction-budget.json
└─────────────────────────────────────────────┘
```

Ownership is fixed: L0 owns the raw event history; T1 owns governed long-term memory; Markdown is a derived view that can be regenerated at any time. L0 never promotes content into T1 by itself — a concise conclusion must pass T1's evidence, provenance, and confirmation rules (see `docs/l0-contract.md`).

## L0 layer (`src/l0/`)

- **`event-log-writer.ts`** — append-only JSONL writer. One writer per session; positions are monotonic per session and recovered by scanning the active log on restart. The active file's byte size is tracked in memory, so appends are stat-free; when the size crosses `L0_ROTATE_BYTES` (10 MB) the log rotates to `events.001.jsonl`, `events.002.jsonl`, … (same-dir rename, oldest = highest index).
- **`event-log-reader.ts`** — streaming reader over active + rotated files in position order. `readAfter(fromPosition)` is the incremental fast path: rotated files are pre-checked with a bounded 64 KB tail scan and skipped entirely when their max position is below the mark (positions are monotonic, so they cannot contain new events). Corrupt lines are skipped and surfaced, never mutated.
- **`l0-runtime.ts`** — one `L0Coordinator` per extension process = one session. `record()` throws on failure (governed T1 writes MUST abort when L0 is unavailable — dual-write, L0 first); `recordSafe()` is best-effort for hooks.
- **`context-derivation.ts`** — deterministic, LLM-free derivation of a model-visible context view (type filtering, budget, folding markers). Same log + policy + budget ⇒ same view.

Dual-write: a T1 write appends to L0 first, then writes to mnemosyne + `audit.json`. If L0 fails, the whole operation aborts. If a later write fails, L0 still holds the record — `/xpi-memo-trace` gives a bounded path back to the originating L0 session/event for diagnosis; there is no automated replay.

## Markdown export (`src/markdown-export/`)

`exportMarkdown()` reads every session through `readAfter(lastExportedPosition)` (state in `markdown/export-state.json`), folds events into `daily/YYYY-MM-DD.md` (append-only day files) and regenerates `MEMORY.md`. Exact duplicates in the same bank and kind stay in the export and are marked `supersededBy`; SQLite is never rewritten. Writes are temp-file + rename. Markdown is always derivable — users may edit it, the next export regenerates it. `AUTO_EXPORT` defaults to on (local deterministic); disable with `XPI_MEMO_AUTO_EXPORT=false`.
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

### Recall ranking (`recall-ranking.ts`)
Pure backend-agnostic post-processing for automatic injection: standing vs contextual roles from the canonical taxonomy, query-intent weighting (`detectQueryIntent`), recency decay (30-day half-life), scope priority, superseded filtering, content deduplication, and per-role item + character budgets. Returns `null` when nothing survives so the caller omits the memory block. Explicit `xpi_memo_recall` output is untouched.

### Observability (`observability.ts`, `candidate-digest.ts`, `status.ts`, `doctor.ts`)

`src/kinds.ts` owns the single canonical taxonomy (7 kinds: label, role, scope, trust state, section title); status, console, and export consume it and never redefine labels. `src/observability.ts` derives the body-free `ObservabilitySnapshot` (capture/candidate/storage/recall/injection/rejection counts, per-kind taxonomy counts, bounded recent metadata — never memory bodies or rejection reasons) from the audit trail; routing rejections and post-routing failures (`routing_rejected`/`memory_failed` L0 events) are counted separately. `src/candidate-digest.ts` builds the body-free backlog digest (pending count, per-kind counts, oldest age, review surface) for TUI and startup notifications; session-start reminder is non-blocking and throttled to once per 6 hours when the backlog reaches 3+. `src/doctor.ts` classifies an empty T1 into `NEVER_CALLED` / `PENDING` / `WRITE_FAILED` / `RECALL_EMPTY`. Status surfaces the effective recall scope (`current-project-plus-global` / `global-only`), backend execution state (`backend-not-run` vs `backend-queried-no-hits` vs `backend-queried-with-hits`), sleep capability/state (`SLEEP_DISABLED` when no mode is usable), and read-only orphan project banks. `src/source-trace.ts` gives a bounded path back to the originating L0 session/event without dumping a transcript.

## Data layout

```
~/.pi/agent/xpi-memo/
├── mnemosyne.db                # global bank
├── banks/project-*/mnemosyne.db
├── audit.json                  # append-only audit trail
├── candidates.json
├── idempotency.json            # activation idempotency ledger (fingerprints)
├── extraction-budget.json      # per-session offline-extraction budget ledger
├── sessions/<sessionId>/events.jsonl (+ events.NNN.jsonl)
└── markdown/
    ├── MEMORY.md
    ├── daily/YYYY-MM-DD.md
    └── export-state.json
```

The global data root above is the only machine-state write/recall engine. In addition, an **explicit project layer** may exist under a project root:

```
<projectRoot>/.pi/memory/<kind>.md     # repo-export: deterministic, privacy-filtered Markdown per project kind
<projectRoot>/.pi/xpi-memo/project.json  # local (non-Git) project identity metadata only
```

The project layer never contains SQLite, WAL, SHM, or search indexes — those stay in the global root. Worktrees share one bank via the Git common directory; the export target resolves to each worktree's own project root.

## Testing

350+ Vitest tests across unit and integration layers (`*.test.ts` colocated, `real-cli.integration.test.ts` exercises a real mnemosyne CLI, `isolated-pi.integration.test.ts` runs against an isolated Pi install). `scripts/bench.ts` micro-benchmarks the hot paths (append, incremental export, identity cache).
