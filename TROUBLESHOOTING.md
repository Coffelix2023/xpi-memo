# xpi-memo Troubleshooting

## Recall returns nothing

1. Check what's active: `/xpi-memo-status` — look at `backends` and `activeBackend`.
2. The chain is mnemosyne → ripgrep → qmd. If all are missing, recall returns empty with a warning naming install commands:

   ```bash
   uv tool install mnemosyne-memory   # or: brew install ripgrep
   ```

3. Installed a backend mid-session? Availability is cached per process — restart the session (or `pi update --extension git:github.com/Coffelix2023/xpi-memo` and relaunch).
4. Pinned a backend (`searchBackend`) that isn't installed? Unset it (`auto` walks the chain) or install the CLI.

## Empty memory — the doctor says what is wrong

`/xpi-memo-status` ends with a `doctor.state` field that classifies an empty T1 into exactly one of:

- `NEVER_CALLED` — no remember attempt at all; the agent has not stored anything yet.
- `PENDING` — candidates are waiting in the console (`/xpi-memo` → Pending) and need Store/Reject.
- `WRITE_FAILED` — remember attempts happened but no row landed; the tool result names the reason.
- `RECALL_EMPTY` — rows exist but recall comes back empty; see "Recall returns nothing" above.

The same JSON block (`doctor.evidence`) carries audit counts, L0 `t1_memory_write` event counts, per-bank row counts, and the three data-root surfaces below — counts only, never memory text.

## Split data roots (CLI stats disagrees with the extension)

The extension always writes to its configured root; a **bare** `mnemosyne` command does not. Three roots can coexist (see the table in [GUIDE.md](./GUIDE.md#data-roots-and-cli-cross-checks)):

- Configured root: `~/.pi/agent/xpi-memo` — what the extension uses (every spawn sets `MNEMOSYNE_DATA_DIR`).
- CLI default root: `~/.hermes/mnemosyne/data` — what bare `mnemosyne` uses.
- Stale root: `~/xpi-memo` — legacy installs.

Cross-check manually with the same env the extension uses:

```bash
MNEMOSYNE_DATA_DIR="$HOME/.pi/agent/xpi-memo" mnemosyne stats
```

If that shows rows while a bare `mnemosyne stats` does not, you are looking at two different roots. Copy anything you want to keep **by hand** — there is no automated migrate, and the extension never creates symlinks.

## Memories not being written

1. `/xpi-memo-status` shows `paused` — set `XPI_MEMO_PAUSED=false` or unpause via the console.
2. Prohibited-content classification rejects the write; the error names the reason.
3. Writes needing review become **candidates** — confirm them via the console (`/xpi-memo`).
4. L0 write failure aborts governed writes by design (dual-write, L0 first). Check disk space and permissions on `<dataDir>/sessions/`.

## L0 looks wrong

- Stats: `/xpi-memo-l0` (sessions, events, disk usage).
- Divergence between L0 and audit log: `/xpi-memo-l0 --reconcile` reports missing writes and can replay them.
- Corrupt lines are skipped and surfaced in export warnings — they are never rewritten in place.
- Large sessions rotate at 10 MB into `events.001.jsonl`…; rotation is normal, not data loss.

## Export issues

- Nothing exported? Events are only picked up when their L0 position is above the last export mark. Use `--force` for a full re-export.
- Validation: `/xpi-memo-export --validate` reports how many events are not yet covered.
- `MEMORY.md` write failure → warning is reported, export continues; check disk space.
- Exported content shows `[REDACTED]` → privacy mode is on (`XPI_MEMO_PRIVACY=true`).
- Tool outputs missing → `XPI_MEMO_EXCLUDE_TOOL_RESULTS=true` is set.

## Migration problems (memoharness → xpi-memo)

See [docs/MIGRATION.md](./docs/MIGRATION.md). Quick checks (run inside Pi):

- Dry-run first: `/xpi-memo-migrate --from ~/.pi/agent/memoharness --dry-run`.
- Report location: `<dataDir>/migration-report-<timestamp>.md`.
- Banks missing after migration: `ls ~/.pi/agent/xpi-memo/banks/`.
- The original memoharness directory is never modified; restore from your backup if needed.

## Everything is broken — start fresh

Data directories are separate from the code. Point `XPI_MEMO_DATA_DIR` at an empty directory for a clean trial run; your original data stays untouched.

Still stuck? Open an issue at the [repository](https://github.com/Coffelix2023/xpi-memo/issues) with the JSON output of `/xpi-memo-status`.
