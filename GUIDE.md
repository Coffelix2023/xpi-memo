# xpi-memo User Guide

xpi-memo is a memory extension for the [Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent): governed long-term memory (T1), a lossless session trace (L0), human-readable Markdown export, and pluggable search backends.

## Concepts

**L0 — session trace.** Every session appends events (user messages, tool calls, memory writes, compactions) to an append-only JSONL log at `<dataDir>/sessions/<sessionId>/events.jsonl`. L0 is the source of truth; everything else is derived from it. Rotation splits the log into `events.001.jsonl`, `events.002.jsonl`, … when the active file exceeds 10 MB.

**T1 — governed memory.** Long-term memories live in mnemosyne vector banks (one global, one per project, optional per-session). Writes pass through governance: prohibited-content checks, routing (global/project/session), and a candidate confirmation lifecycle. Recall is policy-driven (`active`, `assist`, `high-value-auto`).

**Markdown export.** Derived from L0: `MEMORY.md` (long-term memory view, latest-wins) plus `daily/YYYY-MM-DD.md` activity logs. You can edit them freely — the next export regenerates from L0. See [MARKDOWN-FORMAT.md](./MARKDOWN-FORMAT.md).

**Search backends.** Recall runs through a fallback chain: configured → mnemosyne → ripgrep → qmd. Any subset can be installed; unavailable backends are skipped automatically and `/xpi-memo-status` reports what is active.

**Memory activation loop.** When you state an explicit memory intent in a prompt, xpi-memo captures it deterministically through the same governance path as the `xpi_memo_remember` tool — no extra tool call needed. Global preferences and workflows store directly; project decisions, constraints, and gotchas become candidates pending your review. Capture is idempotent per L0 event, session, and content fingerprint, so replayed or repeated input never creates a duplicate row.

**Human-readable taxonomy.** Every T1 memory kind has one canonical label, role, scope, and trust state, shared by the console, status, and Markdown export:

| Internal kind | Label | Role | Scope | Trust state |
| --- | --- | --- | --- | --- |
| `global_preference` | Preference | standing | global | User-confirmed |
| `global_workflow` | Workflow | standing | global | User-confirmed |
| `project_gene` | Repository fact | standing | project | Verified evidence |
| `project_constraint` | Constraint | standing | project | Review required |
| `project_decision` | Decision | contextual | project | Review required |
| `project_gotcha` | Gotcha | contextual | project | Review required |
| `session_context` | Session context | contextual | session | Session-only |
## Installation

```bash
pi install git:github.com/Coffelix2023/xpi-memo@v1.0.0
```

Optional search backends (any subset):

```bash
uv tool install mnemosyne-memory   # vector + FTS5 search
brew install ripgrep               # full-text search (macOS); dnf install ripgrep on Fedora
# qmd (optional semantic search): https://github.com/tobi/qmd#installation
```

Updating: `pi update --extension git:github.com/Coffelix2023/xpi-memo`

## Tools (used by the agent inside a session)

- `xpi_memo_remember` — store a memory; routing decides global/project/session
- `xpi_memo_recall` — search memories through the backend chain
- `xpi_memo_forget` — delete a memory
- `xpi_memo_sleep` — consolidation; requires explicit authorization
- `xpi_memo_recall` (previously named `memoharness_recall` — see migration docs if upgrading)

## Commands

| Command | Purpose |
| --- | --- |
| `/xpi-memo` | Open the interactive TUI console |
| `/xpi-memo-status` | JSON status: banks, backend availability, active backend, config, observability snapshot (capture/candidate/storage/recall/rejection counts), and the doctor report (`doctor.state` + evidence) |
| `/xpi-memo-l0` | L0 session-trace stats (sessions, events, disk usage); `--reconcile` checks L0 vs audit divergence |
| `/xpi-memo-export` | Export L0 → Markdown; `--session <id>` limits scope, `--force` re-exports all, `--validate` reports coverage |


## Activation loop

Explicit memory intent in a prompt is routed deterministically. The system recognizes durable statements about preferences, workflow rules, project decisions, constraints, gotchas, and bounded session context (Chinese and English patterns, plus correction signals such as "actually" / "更正"). Ordinary conversation and ambiguous statements are skipped — the system never guesses a category or silently places project content in the global scope.

**What happens per statement:**

1. **Global preference / workflow** — stored directly (low-risk, user-confirmed).
2. **Project decision / constraint / gotcha** — becomes a review candidate pending your Store / Later / Reject decision; `project_gene` (repository facts) is never auto-extracted, it requires verified evidence.
3. **Prohibited content** (secrets, credentials, tokens) — rejected; only bounded rejection metadata is recorded.
4. **Missing project context** (non-Git directory or no project bank) — skipped; content never falls back to the global bank.

Capture is idempotent by L0 event position, session, content fingerprint, and kind. Replaying an input, or a simultaneous explicit `xpi_memo_remember`, produces no duplicate row or candidate.

**Candidate digest.** Pending candidates surface as a one-line body-free digest (counts, per-kind counts, oldest age, review surface) in the TUI. At session start, when the backlog reaches 3+ pending candidates, a non-blocking notification reminds you — throttled to once per 6 hours, never a blocking dialog. Review them in the console: `/xpi-memo` → Pending tab.

**Offline extraction (optional).** When `offlineExtractionEnabled` is `true`, a provider-neutral runner processes the last 200 L0 events at session shutdown (15 s timeout, per-session budgets: 1 execution / 20 proposals / 5 000 chars). Proposals carry `l0-conclusion` evidence — never `explicit-user-statement`. High-confidence (`≥0.9`) short session context stores directly; everything else becomes a candidate. Budget exhaustion stops further work. Disabled, unavailable, or failing extraction never blocks the session and never affects explicit capture.

**Recall budgets.** Automatic recall ranks standing and contextual memories separately with query-intent weighting, recency decay, scope priority, superseded filtering, and content deduplication. Each role gets its own item and character budget before injection; when nothing survives, the memory block is omitted entirely. Recall policy controls when automatic injection runs:

| Policy | Behavior |
| --- | --- |
| `active` | Automatic recall on ordinary prompts (1 recall per prompt) |
| `assist` | Explicit-only; no automatic injection |
| `high-value-auto` (default) | Automatic recall only on continuity/history triggers (e.g. "继续上次", "resume where we left off") |

## Configuration

User config lives at `~/.config/xpi-memo/config.json` (or set keys via the console). Every key has an environment-variable override:

| Config key | Env var | Default | Effect |
| --- | --- | --- | --- |
| `dataDir` | `XPI_MEMO_DATA_DIR` | `~/.pi/agent/xpi-memo` | Data root (banks, sessions, markdown) |
| `paused` | `XPI_MEMO_PAUSED` | `false` | Pause all T1 writes/recalls |
| `l0Enabled` | `XPI_MEMO_L0_ENABLED` | `true` | Disable L0 logging (system behaves like v0.1) |
| `limit` | `XPI_MEMO_LIMIT` | `5` | Recall result cap |
| `globalLimit` | `XPI_MEMO_GLOBAL_LIMIT` | `5` | Cap for global-scope results |
| `projectLimit` | `XPI_MEMO_PROJECT_LIMIT` | `5` | Cap for project-scope results |
| `autoExport` | `XPI_MEMO_AUTO_EXPORT` | `false` | Export Markdown when a session ends |
| `excludeToolResults` | `XPI_MEMO_EXCLUDE_TOOL_RESULTS` | `false` | Omit tool_result entries from export |
| `privacy` | `XPI_MEMO_PRIVACY` | `false` | Redact paths/key-like strings in export |
| `searchBackend` | `XPI_MEMO_SEARCH_BACKEND` | `auto` | Pin `mnemosyne`/`ripgrep`/`qmd` or walk the chain |
| `recallPolicy` | `XPI_MEMO_RECALL_POLICY` | `high-value-auto` | `active` (auto-recall every prompt) / `assist` (explicit-only) / `high-value-auto` (continuity triggers only) |
| `offlineExtractionEnabled` | `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED` | `false` | Gated offline extraction at session shutdown; disabled by default |
| `retrievalMode` | `XPI_MEMO_RETRIEVAL_MODE` | `hybrid` | `fts5` / `hybrid` |

## Data roots and CLI cross-checks

All three mnemosyne data roots live on disk side by side; the extension never merges or symlinks them:

| Root | Path | Who writes there |
| --- | --- | --- |
| Configured root | `~/.pi/agent/xpi-memo` (or `XPI_MEMO_DATA_DIR`) | The extension — every spawn sets `MNEMOSYNE_DATA_DIR` to this path |
| CLI default root | `~/.hermes/mnemosyne/data` | A bare `mnemosyne` command run without the env var |
| Stale root | `~/xpi-memo` | Legacy installs; typically empty |

`/xpi-memo-status` reports all three under `doctor.evidence.roots` (with distinct inodes, so a symlink merge is visible). Consolidating a split root is a **manual** check — there is no automated migration:

```bash
# See what the extension sees (same data root the extension writes to):
MNEMOSYNE_DATA_DIR="$XPI_MEMO_DATA_DIR" mnemosyne stats
# or, when XPI_MEMO_DATA_DIR is not set in your shell:
MNEMOSYNE_DATA_DIR="$HOME/.pi/agent/xpi-memo" mnemosyne stats
```

## Daily workflow examples

Check the system is healthy:

```
/xpi-memo-status
/xpi-memo-l0
```

Export everything to Markdown (one-time, safe to repeat — incremental):

```
/xpi-memo-export
```

Pause writes during a sensitive session:

```bash
XPI_MEMO_PAUSED=true pi
```

## Upgrading from memoharness

See [docs/MIGRATION.md](./docs/MIGRATION.md) — one command copies banks, audit log, candidates, and translates config keys.

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
