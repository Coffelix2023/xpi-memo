# xpi-memo

Super memory tool combining [mnemosyne](https://github.com/topics/vector-database) vector search with pi-memory architecture: L0 session-trace, T1 governed memory, Markdown export, pluggable search.

A [Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent) extension.

## Features

- **T1 Governed Memory**: Routing (global/project/session), write governance with candidate confirmation, recall policies
- **Mnemosyne Banks**: SQLite vector databases per bank with hybrid FTS5 retrieval
- **TUI Console**: Full interactive memory console
- **Migration Tool**: One-command upgrade from memoharness
- **Roadmap**: L0 session-trace (v0.2), Markdown export (v0.3), pluggable search backends (v0.4)

## Installation

From the GitHub repository (pinned to a tag):

```bash
pi install git:github.com/Coffelix2023/xpi-memo@v0.4.0
```

Or a local clone / working copy:

```bash
pi install /absolute/path/to/xpi-memo
```

`pi install` runs `npm install` inside the package; the extension itself has no build step (Pi loads `src/index.ts` directly).

**Optional search backends** (any subset; the search chain falls back automatically — mnemosyne → ripgrep → qmd — and status reports what is available):

```bash
uv tool install mnemosyne-memory   # vector + FTS5 search
brew install ripgrep               # full-text search (macOS); dnf install ripgrep on Fedora
# qmd (optional semantic search): https://github.com/tobi/qmd#installation
```

## Usage

### Commands

- `/xpi-memo` — Open TUI console
- `/xpi-memo-status` — Show JSON status (includes search backend availability)
- `/xpi-memo-l0` — L0 session-trace status; `--reconcile` checks divergence
- `/xpi-memo-migrate --help` — Migrate data from memoharness
- `/xpi-memo-export [--session <id>] [--force] [--validate]` — Export L0 events to Markdown

### Tools

- `xpi_memo_remember` — Store memory
- `xpi_memo_recall` — Recall memory
- `xpi_memo_forget` — Delete memory
- `xpi_memo_sleep` — Consolidate memory (explicit authorization required)

## Configuration

Default data directory: `~/.pi/agent/xpi-memo/`

User config: `~/.config/xpi-memo/config.json`

Environment variables:

- `XPI_MEMO_DATA_DIR`
- `XPI_MEMO_PAUSED`
- `XPI_MEMO_L0_ENABLED`
- `XPI_MEMO_LIMIT`
- `XPI_MEMO_GLOBAL_LIMIT`
- `XPI_MEMO_PROJECT_LIMIT`
- `XPI_MEMO_AUTO_EXPORT`
- `XPI_MEMO_EXCLUDE_TOOL_RESULTS`
- `XPI_MEMO_PRIVACY`
- `XPI_MEMO_SEARCH_BACKEND` = `auto|mnemosyne|ripgrep|qmd`
- `XPI_MEMO_RECALL_POLICY`
- `XPI_MEMO_RETRIEVAL_MODE`

## Migration from memoharness

```bash
xpi-memo migrate --from ~/.pi/agent/memoharness --dry-run
xpi-memo migrate --from ~/.pi/agent/memoharness --apply
```

Copies banks, audit log, and candidates; translates `MEMOHARNESS_*` config keys to `XPI_MEMO_*`. See [docs/MIGRATION.md](./docs/MIGRATION.md).

## Development

```bash
pnpm install
pnpm typecheck
pnpm -w run lint
pnpm test
```

## License

MIT
