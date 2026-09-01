# xpi-memo Architecture

xpi-memo is a Pi Coding Agent extension (TypeScript, loaded directly from `src/index.ts`, no build step). It layers a lossless session trace (L0) under governed long-term memory (T1), derives human-readable Markdown from L0, and searches through pluggable backends.

## Layer model

```
┌─────────────────────────────────────────────┐
│  Pi host (hooks, tools, commands, TUI)      │  src/index.ts
├─────────────────────────────────────────────┤
│  T1 governed memory                         │  routing / candidate-lifecycle /
│  (writes pass governance; policy recall)    │  recall-policy / audit / registry
├─────────────────────────────────────────────┤
│  Search backends (pluggable, fallback)      │  src/search/*
├─────────────────────────────────────────────┤
│  Derived views: Markdown export             │  src/markdown-export/*
├─────────────────────────────────────────────┤
│  L0 session trace (append-only JSONL)       │  src/l0/*
├─────────────────────────────────────────────┤
│  Storage: mnemosyne banks (SQLite) + files  │  banks/, audit.json, candidates.json
└─────────────────────────────────────────────┘
```

Ownership is fixed: L0 owns the raw event history; T1 owns governed long-term memory; Markdown is a derived view that can be regenerated at any time. L0 never promotes content into T1 by itself — a concise conclusion must pass T1's evidence, provenance, and confirmation rules (see `docs/l0-contract.md`).

## L0 layer (`src/l0/`)

- **`event-log-writer.ts`** — append-only JSONL writer. One writer per session; positions are monotonic per session and recovered by scanning the active log on restart. The active file's byte size is tracked in memory, so appends are stat-free; when the size crosses `L0_ROTATE_BYTES` (10 MB) the log rotates to `events.001.jsonl`, `events.002.jsonl`, … (same-dir rename, oldest = highest index).
- **`event-log-reader.ts`** — streaming reader over active + rotated files in position order. `readAfter(fromPosition)` is the incremental fast path: rotated files are pre-checked with a bounded 64 KB tail scan and skipped entirely when their max position is below the mark (positions are monotonic, so they cannot contain new events). Corrupt lines are skipped and surfaced, never mutated.
- **`l0-runtime.ts`** — one `L0Coordinator` per extension process = one session. `record()` throws on failure (governed T1 writes MUST abort when L0 is unavailable — dual-write, L0 first); `recordSafe()` is best-effort for hooks.
- **`context-derivation.ts`** — deterministic, LLM-free derivation of a model-visible context view (type filtering, budget, folding markers). Same log + policy + budget ⇒ same view.

Dual-write: a T1 write appends to L0 first, then writes to mnemosyne + `audit.json`. If L0 fails, the whole operation aborts. If a later write fails, L0 still holds the record and `xpi-memo doctor --reconcile` can replay it.

## Markdown export (`src/markdown-export/`)

`exportMarkdown()` reads every session through `readAfter(lastExportedPosition)` (state in `markdown/export-state.json`), folds events into `daily/YYYY-MM-DD.md` (append-only day files) and regenerates `MEMORY.md` (latest-wins dedupe across sessions). Writes are temp-file + rename. Markdown is always derivable — users may edit it, the next export regenerates it.

## Search backends (`src/search/`)

`SearchBackend` interface with three implementations: **mnemosyne** (wraps the existing CLI recall; global→global bank, project→project bank), **ripgrep** (full-text over `markdown/` + `sessions/`), **qmd** (external semantic CLI). Selection walks configured → mnemosyne → ripgrep → qmd; unavailability (checked via a per-process `which` cache) and mid-search failures are recorded as `BackendAttempt`s and the chain degrades. Per-query metrics (latency, result count) are kept for status reporting.

## T1 governance (top level `src/`)

- **routing** (`routing.ts`, `banks.ts`) — global / project / session scope; project identity from git (`identity.ts`: canonical common dir hash + normalized remote aliases, cached per cwd) selects a per-project bank.
- **candidate lifecycle** (`candidate-lifecycle.ts`, `pending-candidate.ts`) — writes that need review become candidates and are confirmed/rejected explicitly.
- **policies** (`recall-policy.ts`, `auto-store-policy.ts`, `content-policy.ts`, `promotion-policy.ts`, `sleep-*.ts`) — recall decisions, auto-store gating, prohibited content, promotion, and consolidation.
- **audit + registry** (`audit.ts`, `registry.ts`) — append-only audit trail (historical provenance values are never rewritten) and project registry with remote-based move repair.

## Data layout

```
~/.pi/agent/xpi-memo/
├── mnemosyne.db                # global bank
├── banks/project-*/mnemosyne.db
├── audit.json                  # append-only audit trail
├── candidates.json
├── sessions/<sessionId>/events.jsonl (+ events.NNN.jsonl)
└── markdown/
    ├── MEMORY.md
    ├── daily/YYYY-MM-DD.md
    └── export-state.json
```

## Testing

350+ Vitest tests across unit and integration layers (`*.test.ts` colocated, `real-cli.integration.test.ts` exercises a real mnemosyne CLI, `isolated-pi.integration.test.ts` runs against an isolated Pi install). `scripts/bench.ts` micro-benchmarks the hot paths (append, incremental export, identity cache).
