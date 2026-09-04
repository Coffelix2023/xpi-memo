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
## Commands

| Command | Purpose |
| --- | --- |
| `/xpi-memo` | Open the interactive TUI console |
| `/xpi-memo-status` | JSON status: banks, backend availability, active backend, config, observability snapshot (capture/candidate/storage/recall/rejection counts), and the doctor report (`doctor.state` + evidence) |
| `/xpi-memo-init` | Initialize a non-Git project identity (writes `.pi/xpi-memo/project.json`; no SQLite in the repo) |
| `/xpi-memo-export` | Export L0 → Markdown; `--session <id>` limits scope, `--force` re-exports all, `--validate` reports coverage |
| `/xpi-memo-export --repo` | Export governed project memory → `.pi/memory/<kind>.md` in the project root; `--repo --reimport` re-imports discovered entries as governed candidates |

## Activation loop

Explicit memory intent in a prompt is routed deterministically. The system recognizes durable statements about preferences, workflow rules, project decisions, constraints, gotchas, and bounded session context (Chinese and English patterns, plus correction signals such as "actually" / "更正"). Ordinary conversation and ambiguous statements are skipped — the system never guesses a category or silently places project content in the global scope.

**What happens per statement:**

1. **Global preference / workflow** — stored directly (low-risk, user-confirmed).
2. **Project decision / constraint / gotcha** — becomes a review candidate pending your Store / Later / Reject decision; `project_gene` (repository facts) is never auto-extracted, it requires verified evidence.
3. **Prohibited content** (secrets, credentials, tokens) — rejected; only bounded rejection metadata is recorded.
4. **Missing project identity** (non-Git directory without `xpi-memo-init`) — `routing_rejected` with guidance (`/xpi-memo-init` or switch to a Git repository); content never falls back to the global bank.

Capture is idempotent by L0 event position, session, content fingerprint, and kind. Replaying an input, or a simultaneous explicit `xpi_memo_remember`, produces no duplicate row or candidate.

**Candidate digest.** Pending candidates surface as a one-line body-free digest (counts, per-kind counts, oldest age, review surface) in the TUI. At session start, when the backlog reaches 3+ pending candidates, a non-blocking notification reminds you — throttled to once per 6 hours, never a blocking dialog. Review them in the console: `/xpi-memo` → Pending tab.

**Offline extraction (optional).** When `offlineExtractionEnabled` is `true`, a provider-neutral runner processes the last 200 L0 events at session shutdown (15 s timeout, per-session budgets: 1 execution / 20 proposals / 5 000 chars). Proposals carry `l0-conclusion` evidence — never `explicit-user-statement`. High-confidence (`≥0.9`) short session context stores directly; everything else becomes a candidate. Budget exhaustion stops further work. Disabled, unavailable, or failing extraction never blocks the session and never affects explicit capture.

**Recall budgets.** Automatic recall ranks standing and contextual memories separately with query-intent weighting, recency decay, scope priority, superseded filtering, and content deduplication. Each role gets its own item and character budget before injection; when nothing survives, the memory block is omitted entirely. Recall policy controls when automatic injection runs:

| Policy | Behavior |
| --- | --- |
| `active` | Automatic recall on ordinary prompts (1 recall per prompt) |
| `assist` | Explicit-only; no automatic injection |
| `high-value-auto` (default) | Automatic recall only on continuity/history triggers (e.g. "继续上次", "resume where we left off") |

## Project identity and non-Git directories

**Git projects are the default project identity.** Inside a Git worktree, project memory routes to a per-project bank derived from the repository's common directory (shared across worktrees) — no setup needed.

**Non-Git directories need explicit initialization.** Without a Git identity, project memory is rejected — never silently routed to the global bank. To opt in, run:

```
/xpi-memo-init
```

This writes `.pi/xpi-memo/project.json` in the current directory (metadata only — no SQLite/WAL/SHM in the repo) and gives the directory a stable identity (`p-` + sha256(root)[:12]) shared by all descendants. Unrelated directories stay isolated. Roll back by deleting that one file.

**Session context works everywhere.** `session_context` is session-scoped and independent of project identity: it can be captured and recalled in an uninitialized non-Git directory, is excluded from unrelated sessions, and never becomes global standing memory.

**Effective recall ranges.** `/xpi-memo-status` reports `recall.scope`: `current-project-plus-global` when a project identity exists, `global-only` outside one (with the reason project memory was not queried). Recall results never mix scopes.

## Outcomes and failure reasons

Every memory operation ends in exactly one outcome, and failure outcomes carry a bounded machine-readable reason (bodies, tokens, and credentials never appear in diagnostics):

| Outcome | Meaning |
| --- | --- |
| `stored` | Written to the T1 bank |
| `candidate` | Queued for review (Store / Later / Reject) |
| `rejected` | Rejected by policy, candidate review, or content policy |
| `skipped` | No explicit intent, ambiguous, or missing provenance |
| `degraded` | Captured with a degraded backend/bank |
| `unavailable` | Capability missing (no search backend, no sleep command) |
| `routing_rejected` | Could not be routed (e.g. project memory without a project identity) |
| `SLEEP_DISABLED` | Sleep requested but disabled or unconfigured |

Routing rejections (`routing_rejected`) and post-routing failures (`memory_failed`) are recorded as bounded L0/audit events with kind, scope, reason, and identity state — countable in status/doctor, never body-bearing.

## Sleep modes

`xpi_memo_sleep` requires explicit authorization and an explicit mode; it never substitutes the primary model silently:

| Mode | Meaning |
| --- | --- |
| `dedicated` | A dedicated sleep model runs consolidation |
| `session-model` | Explicitly configured fallback using the session model |
| `mechanical` | Explicitly configured non-model consolidation |
| `disabled` (default) | Sleep rejected: `SLEEP_DISABLED` state, no memory change |

Configure with `sleepMode` (or `XPI_MEMO_SLEEP_MODE`). The tool result and status/doctor always name the actual executed mode; no fallback is labeled `dedicated`.

## Project Markdown export (`.pi/memory/`)

Governed project memory can be exported as human-readable, deterministic, diffable Markdown under the project root — the global SQLite bank stays the only machine-state write/recall engine:

```
/xpi-memo-export --repo
```

- Writes `.pi/memory/<kind>.md` (one file per project kind) at the project root — never SQLite/WAL/SHM in the repo.
- Deterministic ordering by stable memory anchor: repeated export produces no unrelated diff; superseded/removed memories drop out.
- Privacy: content policy blocks prohibited content; `privacy: true` redacts paths/key-like strings; session traces are never auto-exported.

A new machine (e.g. a fresh clone) can re-import the exported files as governed candidates:

```
/xpi-memo-export --repo --reimport
```

Discovered entries become candidates with `repo-export` provenance — they pass content policy, scope routing, and your review before any T1 write; repeated discovery is deduplicated by stable ID/fingerprint. Orphan project banks (identity no longer resolvable) are reported read-only by status/doctor — never deleted automatically.

## Configuration

User config lives at `~/.config/xpi-memo/config.json` (or set keys via the console). Every key has an environment-variable override:

| Config key | Env var | Default | Effect |
| --- | --- | --- | --- |
| `dataDir` | `XPI_MEMO_DATA_DIR` | `~/.pi/agent/xpi-memo` | Data root (banks, sessions, markdown) |
| `paused` | `XPI_MEMO_PAUSED` | `false` | Pause all T1 writes/recalls |
| `confirmStore` | `XPI_MEMO_CONFIRM_STORE` | `false` | TUI remember stores immediately when false; set `true` to show Store/Later/Reject. Pending-tab review always shows the panel. Non-TUI still queues. |
| `language` | `XPI_MEMO_LANGUAGE` | `en` | Confirmation panel copy: `en` or `zh` |
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
| `sleepMode` | `XPI_MEMO_SLEEP_MODE` | `disabled` | Sleep execution mode: `dedicated` / `session-model` / `mechanical` / `disabled`. Fail-closed: no explicit mode means `SLEEP_DISABLED`; a fallback is never labeled `dedicated` |

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
```

`/xpi-memo-status` includes the L0 session-trace summary (`l0.enabled`, `l0.sessionCount`, `l0.totalEvents`, `l0.totalBytes`) and the doctor report — one command covers health.

Export everything to Markdown (one-time, safe to repeat — incremental):

```
/xpi-memo-export
```

Pause writes during a sensitive session:

```bash
XPI_MEMO_PAUSED=true pi
```
## Upgrading from memoharness

The dedicated migration command and `docs/MIGRATION.md` were removed. Tool names changed once: `memoharness_remember` → `xpi_memo_remember` (and similarly for `recall`/`forget`/`sleep`). Historical `pi:memoharness_*` provenance values in existing L0/audit data are never rewritten — only new writes use the `xpi_memo_*` names.

Existing banks under `~/.pi/agent/memoharness/` are not auto-migrated; copy what you want to keep by hand into `~/.pi/agent/xpi-memo/banks/` (or `XPI_MEMO_DATA_DIR`), or start fresh and let L0 re-derive memory.

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
