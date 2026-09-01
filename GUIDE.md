# xpi-memo User Guide

xpi-memo is a memory extension for the [Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent): governed long-term memory (T1), a lossless session trace (L0), human-readable Markdown export, and pluggable search backends.

## Concepts

**L0 — session trace.** Every session appends events (user messages, tool calls, memory writes, compactions) to an append-only JSONL log at `<dataDir>/sessions/<sessionId>/events.jsonl`. L0 is the source of truth; everything else is derived from it. Rotation splits the log into `events.001.jsonl`, `events.002.jsonl`, … when the active file exceeds 10 MB.

**T1 — governed memory.** Long-term memories live in mnemosyne vector banks (one global, one per project, optional per-session). Writes pass through governance: prohibited-content checks, routing (global/project/session), and a candidate confirmation lifecycle. Recall is policy-driven (`active`, `assist`, `high-value-auto`).

**Markdown export.** Derived from L0: `MEMORY.md` (long-term memory view, latest-wins) plus `daily/YYYY-MM-DD.md` activity logs. You can edit them freely — the next export regenerates from L0. See [MARKDOWN-FORMAT.md](./MARKDOWN-FORMAT.md).

**Search backends.** Recall runs through a fallback chain: configured → mnemosyne → ripgrep → qmd. Any subset can be installed; unavailable backends are skipped automatically and `/xpi-memo-status` reports what is active.

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
| `/xpi-memo-status` | JSON status: banks, backend availability, active backend, config, and the doctor report (`doctor.state` + evidence) |
| `/xpi-memo-l0` | L0 session-trace stats (sessions, events, disk usage); `--reconcile` checks L0 vs audit divergence |
| `/xpi-memo-export` | Export L0 → Markdown; `--session <id>` limits scope, `--force` re-exports all, `--validate` reports coverage |

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
| `recallPolicy` | `XPI_MEMO_RECALL_POLICY` | `high-value-auto` | `active` / `assist` / `high-value-auto` |
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
