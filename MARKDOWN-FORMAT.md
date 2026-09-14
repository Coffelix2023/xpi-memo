# Markdown Export Format

xpi-memo derives human-readable Markdown files from machine state. Two sources feed two different views: `daily/YYYY-MM-DD.md` is folded from the L0 JSONL event log (the event truth for *how* state changed), and `MEMORY.md` is projected from the bank's *current* state (the state truth for *what is remembered now*) with L0 used only as provenance annotation. Both are derived views and can be regenerated with `/xpi-memo-export`.

## Directory layout

```text
<dataDir>/markdown/
├── MEMORY.md                  # long-term memory projection (bank current state)
├── export-state.json          # incremental export positions (internal)
├── memory-projection-state.json  # projection status + content hash (internal)
└── daily/
    ├── 2024-03-15.md          # one file per calendar day (ISO 8601)
    └── 2024-03-16.md
```

Default output directory is `<dataDir>/markdown/` where `<dataDir>` is `~/.pi/agent/xpi-memo` (override with `XPI_MEMO_DATA_DIR`).

## MEMORY.md

The entry set is the **bank's current state**, not the event history: the default bank plus every project bank under `<dataDir>/banks/`, read through a bounded `mnemosyne export` (fixed 5 s timeout and 5 MB cap per bank, temporary file always cleaned up). The L0 log only annotates a row: `t1_memory_write` supplies kind, scope, confirming time, session and position, keyed by the bank memory id. Sections are the canonical taxonomy — **Preferences**, **Workflows**, **Repository Facts**, **Constraints**, **Decisions**, **Gotchas**, **Session Context** — plus **Unclassified** for rows the bank holds without a matching L0 write.

```markdown
# MEMORY

## Decisions

- Use pnpm workspaces for all new packages
  <sub>confirmed 2024-03-15 · `project_decision` · scope `project` · session `2024-03-15T10-00-00-...` @ position 7</sub>

## Unclassified

- Row written directly into the bank by another tool
  <sub>source `missing` · bank `default`</sub>
```

- **Removal is state-driven**: a memory that is no longer in the bank disappears on the next projection, with no deletion event required, and unrelated entries are untouched.
- **Duplicate handling**: content is normalized (trimmed, whitespace-collapsed); when the same content appears twice in one bank and kind, both entries stay visible and the older one is marked `supersededBy` — the bank is never rewritten or deduplicated as a side effect of export.
- **Missing provenance**: a bank row with no usable L0 write is projected anyway and marked `source missing` in `Unclassified`; its kind and source are never guessed and no session reference is invented.
- **Ordering**: sections follow the canonical taxonomy order (Unclassified last); within a section, annotated entries are ordered by confirming L0 position and unannotated entries follow, ordered by memory id. Identical state plus identical annotations therefore yields a byte-identical file and Git diffs stay minimal.
- **Failure semantics**: a bank read, timeout, parse or write failure keeps the previous `MEMORY.md` and leaves the projection retryable (`memory-projection-state.json`) — an empty or partial projection is never written. A no-op incremental export leaves the file alone unless it diverged from the projection's recorded content hash (hand-edited or deleted), which triggers a rebuild.
- **Boundary**: the projection layer deliberately reads whole-bank state (a bounded, read-only derived-view action). That is a *different* boundary from `xpi_memo_forget`, which must never scan the full library: see `GUIDE.md` and `TROUBLESHOOTING.md`.

## daily/YYYY-MM-DD.md

Activity log for one calendar day (UTC, from event timestamps). Multiple sessions on the same day merge into one file; each session gets a `## Session` boundary marker.

```markdown
# 2024-03-15

## Session `2024-03-15T10-00-00-00000000-abcd`

- `10:00:12` User: fix the login bug <sub>session `...` @ position 1</sub>
- `10:00:15` Called read: path: /src/login.ts <sub>session `...` @ position 2</sub>

## Handoff

- `10:30:00` Handoff: session context compacted — (session `...` @ position 9, 2024-03-15T10:30:00.000Z)
```

- **Append-only**: new exports append to the end of an existing day file; existing entries are never reordered.
- **Handoff entries**: emitted for `compaction` events, always prefixed with `Handoff:` and carrying the session id for traceability.

## Entry format

Each entry is a single list line:

```
- `HH:MM:SS` <prose> [`kind`] <sub>session `<id>` @ position <n></sub>
```

Prose rendering per event type:

| Event type | Rendered as |
| --- | --- |
| `user_message` | `User: <text>` |
| `assistant_message` | `Assistant: <text>` |
| `tool_call` | `Called <toolName>: <args summary>` |
| `tool_result` | `Tool <id> completed/failed: <summary>` |
| `file_change` | `File changed: <path> (<action>)` |
| `compaction` | Handoff entry (see above) |
| `t1_memory_write` | `Memory stored [<kind>]: <content>` |
| `candidate_created` | `Memory candidate created [<kind>]: <content>` |
| `candidate_confirmed` | `Memory candidate confirmed [<kind>]` |
| `candidate_rejected` | `Memory candidate rejected [<kind>]: <reason>` |
| `routing_decision` | `Routing decision [<kind>] -> <bank>` |

Object payloads render as compact `key: value` summaries — never raw JSON dumps. Long content is truncated to one 200-character line.

## Source traceability

Annotated MEMORY.md entries carry `<sub>… session <id> @ position N</sub>`. The pair (session id, position) locates the exact raw line in `<dataDir>/sessions/<sessionId>/events.jsonl`, enabling bidirectional navigation between Markdown and the L0 log. Rows without L0 provenance carry `source \`missing\`` instead of a session reference — the absence of provenance is shown, never fabricated.

Daily entries carry the same `<sub>session … @ position N</sub>` pair.

## Configuration

| Config key | Env var | Default | Effect |
| --- | --- | --- | --- |
| `autoExport` | `XPI_MEMO_AUTO_EXPORT` | `false` | Export automatically when a session ends |
| `excludeToolResults` | `XPI_MEMO_EXCLUDE_TOOL_RESULTS` | `false` | Omit tool_result entries (L0 log keeps full payloads) |
| `privacy` | `XPI_MEMO_PRIVACY` | `false` | Redact file paths and key-like strings with `[REDACTED]` |

## Commands

- `/xpi-memo-export` — export all sessions (incremental by default)
- `/xpi-memo-export --session <id>` — export one session
- `/xpi-memo-export --force` — full regeneration, ignoring incremental state
- `/xpi-memo-export --validate` — verify every L0 event position is covered by the export state; reports missing counts

### Project repository export (`.pi/memory/`)

A separate, explicit export layer writes governed project memory as deterministic Markdown under the project root:

- `/xpi-memo-export --repo` — regenerate `.pi/memory/<kind>.md` (one file per project kind) from the live global project bank; stable memory-ID anchors, canonical kind/scope metadata, stable ordering — repeated export produces no unrelated diff.
- `/xpi-memo-export --repo --reimport` — read the files back as `repo-export` evidence and route entries through the normal candidate lifecycle (content policy, scope routing, user confirmation) with stable-ID deduplication.

The repo-export layer is a portable human view only: the global SQLite bank remains the sole machine-state write and recall engine, and no SQLite/WAL/SHM ever lands in the project repository.

## Error handling

- Writes are atomic (temp file + rename): a crash never leaves a partial Markdown file behind.
- Unparseable L0 lines are skipped, counted in warnings, and rendered as visible `` `corrupt` `` entries in the day file.
- Session-level read failures are reported per session and do not abort the whole export.
- Auto-export failures never block session shutdown.
