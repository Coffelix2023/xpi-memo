# xpi-memo

[English](./README.md) · [简体中文](./README.zh-CN.md)

Super memory tool combining [mnemosyne](https://github.com/topics/vector-database) vector search with pi-memory architecture: L0 session-trace, T1 governed memory, derived mental-model projections, Markdown export, pluggable search.

A [Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent) extension.

## Features

- **T1 Governed Memory** — routing (global/project/session), write governance with candidate confirmation, policy-driven recall
- **Memory Activation Loop** — explicit user intent (preferences, workflow, project decisions, gotchas, session context) is captured deterministically from the prompt, idempotent per L0 event + content fingerprint, with a gated offline extraction path (disabled by default) at session shutdown that shows a progress line above the editor in the TUI
- **Human-Readable Observability** — canonical 7-kind taxonomy (Preference, Workflow, Repository fact, Constraint, Decision, Gotcha, Session context) with roles, scopes, and trust states shared by console, status, and export
- **L0 Session Trace** — lossless append-only JSONL log per session (10 MB rotation); the event truth for how state changed (daily logs and memory provenance derive from it, while the bank holds the current state)
- **Derived Mental-Model Projections** — two code-owned, versioned questions (a global working style, the current project's operating model) answered only from already-confirmed T1 rows, refreshed at session boundaries with synthesis **off by default**; the injected text is labelled as untrusted derived data, never becomes a memory kind, and is dropped once its sources move on
- **Markdown Export** — human-readable `MEMORY.md` (projected from the bank's current state, L0-annotated) + daily logs folded from L0; incremental, privacy redaction, Git-friendly
- **Pluggable Search** — recall through a fallback chain: mnemosyne (vector+FTS5) → ripgrep (full-text) → qmd (semantic); any subset installed works
- **Dual-Track Console** — `/xpi-memo` opens a native Glimpse window (launched at 800×600) when Glimpse is available, and falls back to the TUI panel otherwise; both render the same four views (Pending / Recent / Settings / Status) from the same view model, so neither surface can omit a field the other shows. Settings are editable in the window too — click a field or focus it and press `Space` — and the window's layout fills whatever size you resize it to

Details: [GUIDE.md](./GUIDE.md) (usage) · [ARCHITECTURE.md](./ARCHITECTURE.md) (L0/T1/projection layers) · [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) · [docs/COMPATIBILITY.md](./docs/COMPATIBILITY.md) (versions) · [MARKDOWN-FORMAT.md](./MARKDOWN-FORMAT.md) (export format)

## Installation

```bash
pi install git:github.com/Coffelix2023/xpi-memo
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

**Optional display layer:** `/xpi-memo` opens the Glimpse window only when the `glimpseui` module resolves; without it you get the TUI panel.

```bash
pi install npm:glimpseui
```

## Usage

### Commands

- `/xpi-memo` — Open the console: a native Glimpse window (launched at 800×600, resizable — the layout fills it) when available, otherwise the TUI panel (Pending / Recent / Settings / Status in both)
- `/xpi-memo-status` — Print the full status as JSON, in every mode: the only programmatic status read (banks, backend availability, config, observability, `doctor`). For the status *view*, use `/xpi-memo`.
- `/xpi-memo-init` — Initialize a non-Git project identity (writes `.pi/xpi-memo/project.json`; no SQLite in the repo)
- `/xpi-memo-export [--session <id>] [--force] [--validate]` — Export L0 events to Markdown
- `/xpi-memo-export --repo [--reimport]` — Export governed project memory to `.pi/memory/<kind>.md` / re-import discovered entries as governed candidates

### Console keys

| Key | Action |
| --- | --- |
| `←` / `→` | Previous / next tab; stops at the first and last tab (no wrap-around) |
| `↑` / `↓` | Move the cursor inside the active list |
| `Space` | Settings: fold or unfold a group header, or cycle the field under the cursor to its next value |
| `Enter` | Settings: save the panel's configuration (the panel stays open); Pending: review the selected candidate |
| `Tab` / `Shift+Tab` | Settings: jump to the next / previous field, skipping group headers |
| `Esc` / `Ctrl-C` | Close the panel |

Field rows are laid out as `label / note / value`. Putting the cursor on a field fills the two rows above the info bar: what the field does and who it is for, then the recommended value and the meaning of every option. The title sits in the top border and the key hints sit on the last row above the bottom border.

**In the Glimpse window** the layout is a sidebar instead of a tab bar, so the keys differ: click a sidebar entry to switch views, `↑` / `↓` to move through the pending list, `Tab` / `Shift+Tab` to step through settings fields, and `Esc` to close.

Settings fields carry their own control: an enumerated field is a dropdown (click it, or focus it and press `Space`, to get the system menu), a free-text field is an input you type into, and a field pinned by an `XPI_MEMO_*` variable is disabled. A change is written as soon as the control reports it, so there is no separate save step; the language field re-renders the window in place. `Run sleep now` asks for confirmation and writes no configuration. The Pending and Recent details follow the panel's language, and the Recent page reads its own event fields per action rather than showing a row of dashes.

### Tools

- `xpi_memo_remember` — Store memory
- `xpi_memo_recall` — Recall memory
- `xpi_memo_forget` — Delete memory
- `xpi_memo_sleep` — Consolidate memory (explicit authorization required)

**Automatic capture.** When you explicitly state a durable preference, workflow, project decision, gotcha, or bounded session context in a prompt, the activation loop routes it through the same governance path as `xpi_memo_remember` — no extra tool call needed. Global preferences/workflows store directly; project decisions, constraints, and gotchas become review candidates (see [GUIDE.md § Activation loop](./GUIDE.md#activation-loop)).

**Auto-admission.** Memory is admitted by default: a candidate is written to T1 unless it hits a hard rail — prohibited content, an unresolved conflict, or memory being paused — or a preference you tightened. Preferences are a per-kind switch each, plus a minimum confidence, an evidence floor, a source scope and a candidate age window; edit them in `/xpi-memo` → Settings, or through the config file and the `XPI_MEMO_ADMISSION_*` variables. Repository-fact verification no longer gates admission: a pass upgrades the evidence to `verified-repository-fact`, and the outcome is recorded either way. Turn admission off entirely with `autoAdmit: false` or `XPI_MEMO_AUTO_ADMIT=false`, and candidates wait in the review queue instead. Use `/xpi-memo-rescan` to re-judge the back catalogue under the current preferences: whatever they still hold back is archived for 30 days rather than accumulating.

## Configuration

Default data directory: `~/.pi/agent/xpi-memo/`

User config: `~/.config/xpi-memo/config.json`

Environment variables:

- `XPI_MEMO_DATA_DIR`
- `XPI_MEMO_PAUSED`
- `XPI_MEMO_CONFIRM_STORE` = `true|false` (default `false`; TUI remember stores immediately unless true)
- `XPI_MEMO_LANGUAGE` = `en|zh` (default `en`; confirmation panel copy)
- `XPI_MEMO_L0_ENABLED`
- `XPI_MEMO_LIMIT` / `XPI_MEMO_GLOBAL_LIMIT` / `XPI_MEMO_PROJECT_LIMIT`
- `XPI_MEMO_AUTO_EXPORT`
- `XPI_MEMO_AUTO_VERIFY` = kill switch (`false`/`0` disables repository-fact verification — every candidate queues for manual review)
- `XPI_MEMO_AUTO_ADMIT` = `true|false` (overrides the config file's `autoAdmit`, default `true`; `false` keeps every candidate pending with a bounded audit trail)
- `XPI_MEMO_ADMISSION_ALLOW_*` (one per memory kind), `XPI_MEMO_ADMISSION_MIN_CONFIDENCE`, `XPI_MEMO_ADMISSION_EVIDENCE_FLOOR`, `XPI_MEMO_ADMISSION_SOURCE_SCOPE`, `XPI_MEMO_ADMISSION_MAX_AGE_DAYS`, `XPI_MEMO_ARCHIVE_RETENTION_DAYS` = the admission preferences (see [GUIDE.md](./GUIDE.md#configuration-table))
- `XPI_MEMO_EXCLUDE_TOOL_RESULTS`
- `XPI_MEMO_PRIVACY`
- `XPI_MEMO_SEARCH_BACKEND` = `auto|mnemosyne|ripgrep|qmd`
- `XPI_MEMO_RECALL_POLICY` = `active|assist|high-value-auto`
- `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED` = `true|false` (default `false`)
- `XPI_MEMO_OFFLINE_EXTRACTION_MODEL` = `session-model` (default) or `provider/model-id` (bare `model-id` also works; an unknown id falls back to the session model; editable in the console)
- `embeddingMode` / `XPI_MEMO_EMBEDDING_MODE` = `off|local|api` (default `off`; embedding work for the mnemosyne processes xpi-memo spawns — `off` drops ~three quarters of the store cost)
- `XPI_MEMO_EMBEDDING_MODEL` / `XPI_MEMO_EMBEDDING_API_URL` (empty keeps mnemosyne's own default; the API key stays in `MNEMOSYNE_EMBEDDING_API_KEY` / `OPENAI_API_KEY`, never in xpi-memo's config)
- `XPI_MEMO_RETRIEVAL_MODE`
- `XPI_MEMO_SLEEP_MODE` = `dedicated|session-model|mechanical|disabled` (default `disabled`; fail-closed)
- `XPI_MEMO_MENTAL_MODEL_DEFINITIONS` = comma-separated built-in mental-model ids (default: both; empty disables the layer)
- `XPI_MEMO_MENTAL_MODEL_SYNTHESIS_ENABLED` = `true|false` (default `false`; opt in to generating projections — see [GUIDE.md § Mental models](./GUIDE.md#mental-models-derived-standing-answers))
- `XPI_MEMO_PROFILE_INJECTION` = `true|false` (default `true`; `false` omits the derived preference-profile block)
- `XPI_MEMO_EVENT_PRESENTATION` = `true|false` (default `true`; `false` silences footer/status lifecycle events)
- `XPI_MEMO_PASSIVE_FEEDBACK` = `true|false` (default `true`; `false` stops passive usage-feedback writes)


### No extraction progress line?

Offline extraction is gated and ships **off**. Nothing extracts unless `offlineExtractionEnabled` and `l0Enabled` are both `true`, and the progress line only exists while extraction runs, so a default install never shows one. Turn both on in `/xpi-memo` → Settings, or set them in the config file:

```json
{ "offlineExtractionEnabled": true, "l0Enabled": true }
```

Session end now names the closed gate instead of staying silent. [GUIDE.md § No extraction progress line](./GUIDE.md#no-extraction-progress-line-above-the-editor) has the full walk-through.
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
| [glimpseui](https://github.com/earendil-works/glimpseui) | Optional display layer | Native 800×600 console window when the module resolves; the TUI panel stays the fallback |

All user-facing commands (`/xpi-memo`, `/xpi-memo-status`, …), tools (`xpi_memo_*`), data labels (Preference, Workflow, Repository fact, Constraint, Decision, Gotcha, Session context), and status surfaces are branded `xpi-memo`. Upstream names are used only in this attribution and in internal code comments — they are not runtime API names.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for license details of any copied permissively-licensed code.

## License

MIT
