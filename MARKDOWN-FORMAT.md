# Markdown Export Format

xpi-memo derives human-readable Markdown files from the L0 event log. The L0 JSONL log is the source of truth; Markdown is a derived view and can be regenerated at any time with `/xpi-memo-export`.

## Directory layout

```
<dataDir>/markdown/
├── MEMORY.md                  # long-term memory view (latest-wins)
├── export-state.json          # incremental export positions (internal)
└── daily/
    ├── 2024-03-15.md          # one file per calendar day (ISO 8601)
    └── 2024-03-16.md
```

Default output directory is `<dataDir>/markdown/` where `<dataDir>` is `~/.pi/agent/xpi-memo` (override with `XPI_MEMO_DATA_DIR`).

## MEMORY.md

Long-term memory derived from confirmed `t1_memory_write` events. Sections: **Decisions**, **Preferences**, **Constraints**, **Gotchas**, and **Other** (any kind that does not map to the first four).

```markdown
# MEMORY

## Decisions

- Use pnpm workspaces for all new packages
  <sub>confirmed 2024-03-15 · `project_decision` · session `2024-03-15T10-00-00-...` @ position 7</sub>
```

- **Duplicate handling**: content is normalized (trimmed, whitespace-collapsed); when the same content appears again, only the latest version is kept.
- **Ordering**: entries are ordered by their confirming L0 position, so regenerated files are byte-stable and Git diffs stay minimal.

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

Every entry carries `<sub>session ... @ position N</sub>`. The pair (session id, position) locates the exact raw line in `<dataDir>/sessions/<sessionId>/events.jsonl`, enabling bidirectional navigation between Markdown and the L0 log.

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
