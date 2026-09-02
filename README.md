# xpi-memo

Super memory tool combining [mnemosyne](https://github.com/topics/vector-database) vector search with pi-memory architecture: L0 session-trace, T1 governed memory, Markdown export, pluggable search.

A [Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent) extension.

## Features

- **T1 Governed Memory** — routing (global/project/session), write governance with candidate confirmation, policy-driven recall
- **Memory Activation Loop** — explicit user intent (preferences, workflow, project decisions, gotchas, session context) is captured deterministically from the prompt, idempotent per L0 event + content fingerprint, with a gated offline extraction path (disabled by default) at session shutdown
- **Human-Readable Observability** — canonical 7-kind taxonomy (Preference, Workflow, Repository fact, Constraint, Decision, Gotcha, Session context) with roles, scopes, and trust states shared by console, status, and export
- **L0 Session Trace** — lossless append-only JSONL log per session (10 MB rotation); source of truth for everything derived
- **Markdown Export** — human-readable `MEMORY.md` + daily logs derived from L0; incremental, privacy redaction, Git-friendly
- **Pluggable Search** — recall through a fallback chain: mnemosyne (vector+FTS5) → ripgrep (full-text) → qmd (semantic); any subset installed works
Details: [GUIDE.md](./GUIDE.md) (usage) · [ARCHITECTURE.md](./ARCHITECTURE.md) (L0/T1 layers) · [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) · [docs/COMPATIBILITY.md](./docs/COMPATIBILITY.md) (versions) · [MARKDOWN-FORMAT.md](./MARKDOWN-FORMAT.md) (export format)

## Installation

```bash
pi install git:github.com/Coffelix2023/xpi-memo@v1.0.0
```

Updating an existing install:

```bash
pi update --extension git:github.com/Coffelix2023/xpi-memo
```

`pi install` runs `npm install` inside the package; the extension itself has no build step (Pi loads `src/index.ts` directly).

**Optional search backends** (any subset; the search chain falls back automatically and `/xpi-memo-status` reports what is available):

```bash
uv tool install mnemosyne-memory   # vector + FTS5 search
brew install ripgrep               # full-text search (macOS); dnf install ripgrep on Fedora
# qmd (optional semantic search): https://github.com/tobi/qmd#installation
```

## Usage

### Commands

- `/xpi-memo` — Open TUI console
- `/xpi-memo` — Open TUI console (Pending / Recent / Settings / Status tabs; Status shows indented JSON incl. L0 summary)
- `/xpi-memo-status` — Scrollable status panel in the TUI; single-line JSON elsewhere
- `/xpi-memo-export [--session <id>] [--force] [--validate]` — Export L0 events to Markdown

### Tools

- `xpi_memo_remember` — Store memory
- `xpi_memo_recall` — Recall memory
- `xpi_memo_forget` — Delete memory
- `xpi_memo_sleep` — Consolidate memory (explicit authorization required)

**Automatic capture.** When you explicitly state a durable preference, workflow, project decision, gotcha, or bounded session context in a prompt, the activation loop routes it through the same governance path as `xpi_memo_remember` — no extra tool call needed. Global preferences/workflows store directly; project decisions, constraints, and gotchas become review candidates (see [GUIDE.md § Activation loop](./GUIDE.md#activation-loop)).
## Configuration

Default data directory: `~/.pi/agent/xpi-memo/`

User config: `~/.config/xpi-memo/config.json`

Environment variables:

- `XPI_MEMO_DATA_DIR`
- `XPI_MEMO_PAUSED`
- `XPI_MEMO_L0_ENABLED`
- `XPI_MEMO_LIMIT` / `XPI_MEMO_GLOBAL_LIMIT` / `XPI_MEMO_PROJECT_LIMIT`
- `XPI_MEMO_AUTO_EXPORT`
- `XPI_MEMO_EXCLUDE_TOOL_RESULTS`
- `XPI_MEMO_PRIVACY`
- `XPI_MEMO_SEARCH_BACKEND` = `auto|mnemosyne|ripgrep|qmd`
- `XPI_MEMO_RECALL_POLICY` = `active|assist|high-value-auto`
- `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED` = `true|false` (default `false`)
- `XPI_MEMO_RETRIEVAL_MODE`

See [GUIDE.md](./GUIDE.md) for the full config table with defaults and effects.

## Development

```bash
pnpm install
pnpm typecheck
pnpm -w run lint
pnpm test
npx tsx scripts/bench.ts   # hot-path micro-benchmarks
```

## Attributions

xpi-memo is an original implementation. The following projects inspired its architecture and interaction patterns; none of them is a runtime dependency, and their names never appear as xpi-memo user-facing commands, data labels, or status surfaces:

| Project | Role | What xpi-memo borrows |
| --- | --- | --- |
| [mnemopi](https://github.com/can1357/oh-my-pi/tree/main/packages/mnemopi) (part of Oh My Pi, MIT) | Inspiration | Automatic recall/retain lifecycle, query-intent weighting, recency/diversity ranking |
| [pi-memory](https://github.com/jayzeng/pi-memory) (MIT) | Inspiration | Low-friction capture, Markdown-readable views, compaction handoff, stable snapshots |
| [pi-interview-tool](https://github.com/earendil-works/pi-interview-tool) | Design vocabulary only | Card/recommendation/clarification patterns for the rich UI layer; never a runtime dependency |
| [glimpseui](https://github.com/earendil-works/glimpseui) | Optional rich display layer | Floating status panel rendering when available; the TUI remains the primary surface |

All user-facing commands (`/xpi-memo`, `/xpi-memo-status`, …), tools (`xpi_memo_*`), data labels (Preference, Workflow, Repository fact, Constraint, Decision, Gotcha, Session context), and status surfaces are branded `xpi-memo`. Upstream names are used only in this attribution and in internal code comments — they are not runtime API names.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for license details of any copied permissively-licensed code.

## License

MIT
