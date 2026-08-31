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

```bash
pi install xpi-memo
```

## Usage

### Commands

- `/xpi-memo` — Open TUI console
- `/xpi-memo-status` — Show JSON status
- `/xpi-memo-migrate --help` — Migrate data from memoharness

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
- `XPI_MEMO_LIMIT`
- `XPI_MEMO_GLOBAL_LIMIT`
- `XPI_MEMO_PROJECT_LIMIT`
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
