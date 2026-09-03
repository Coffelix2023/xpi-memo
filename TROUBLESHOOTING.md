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

## Explicit intent not captured

1. **Statement type** — only explicit durable statements are captured: preferences, workflow rules, project decisions, constraints, gotchas, bounded session context. Ordinary conversation and ambiguous statements are deliberately skipped (never guessed).
2. **Repository facts** (`project_gene`) are never auto-extracted — they require verified evidence. Use `xpi_memo_remember` instead.
3. **Project statements in a non-Git directory** — rejected with `routing_rejected` (`project-identity-required`) and actionable guidance: run `/xpi-memo-init` in that directory or switch to a Git repository. Content never silently falls back to the global bank.
4. **Candidate backlog** — project decisions/constraints/gotchas become candidates; confirm them in the Pending tab or they stay pending.
5. **Idempotency** — replaying the same input or a simultaneous remember call is deduplicated by design; no duplicate row is created. This is not data loss.

## Offline extraction (gated enrichment)

- **Disabled by default.** `offlineExtractionEnabled` (or `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=true`) must be set explicitly.
- Extraction runs only at **session shutdown**, reads the last 200 L0 events, and has a 15 s timeout. Slow or failing runners never block the session; check `/xpi-memo-status` `observability.activation.extraction` for outcome counts.
- Per-session budgets (1 execution / 20 proposals / 5 000 chars) stop further work on exhaustion; `extraction-budget.json` records only counts, never content.
- Proposals always carry `l0-conclusion` evidence. High-confidence (≥0.9) short session context stores directly; everything else becomes a candidate for review.
- Explicit deterministic capture never depends on extraction being present, enabled, or healthy.

## Candidate backlog keeps growing

- Review the Pending tab (`/xpi-memo`): Store / Later / Reject per candidate.
- The startup reminder fires only when the backlog reaches 3+ pending candidates and is throttled to once per 6 hours; if you do not see it, the backlog is below the threshold or the cooldown is active.

## Recall behaves differently than expected

- **Nothing injected** — check `recallPolicy`: `assist` never injects automatically; `high-value-auto` (default) injects only on continuity/history triggers (e.g. "继续上次", "resume where we left off"). Switch to `active` for recall on every prompt.
- **Stale or duplicate results** — ranking filters superseded memories and deduplicates content; results you expect may be filtered. Diagnostics in `/xpi-memo-status` (`observability.activation.recall` vs `recalledHits`) distinguish "backend queried with no hits" from "no backend executed".
- **Memory block missing entirely** — when no result survives the budgets, the block is omitted by design rather than injecting an empty trace.
## L0 looks wrong

- L0 session-trace summary (sessions, events, disk usage) is part of `/xpi-memo-status` under `l0.*`.
- Corrupt lines are skipped and surfaced in export warnings — they are never rewritten in place.
- Large sessions rotate at 10 MB into `events.001.jsonl`…; rotation is normal, not data loss.


## Project memory rejected outside Git

- Check identity: `/xpi-memo-status` shows `currentProject` (bank/id/label) and `recall.scope` (`current-project-plus-global` vs `global-only`).
- No identity? Run `/xpi-memo-init` in the directory you want as the project root — it writes `.pi/xpi-memo/project.json` (metadata only, no SQLite in the repo) and descendants inherit the identity.
- Inside Git but still rejected? Make sure the current directory is inside a worktree, not a bare or unrelated directory; project identity comes from the Git common directory.
## Export issues

- Nothing exported? Events are only picked up when their L0 position is above the last export mark. Use `--force` for a full re-export.
- Validation: `/xpi-memo-export --validate` reports how many events are not yet covered.
- `MEMORY.md` write failure → warning is reported, export continues; check disk space.
- Exported content shows `[REDACTED]` → privacy mode is on (`XPI_MEMO_PRIVACY=true`).
- Tool outputs missing → `XPI_MEMO_EXCLUDE_TOOL_RESULTS=true` is set.
- Project Markdown (`.pi/memory/`): use `/xpi-memo-export --repo`; without a project identity it tells you to run `/xpi-memo-init` or switch to a Git repository. `--repo --reimport` re-imports discovered files as governed candidates.

## Migration problems (memoharness → xpi-memo)

The dedicated migration command was removed. Tool names changed once: `memoharness_*` → `xpi_memo_*`; historical `pi:memoharness_*` provenance in L0/audit data is never rewritten. Existing memoharness banks are not auto-migrated — copy them by hand into `~/.pi/agent/xpi-memo/banks/` (or `XPI_MEMO_DATA_DIR`) if you want to keep them, or start fresh and let L0 re-derive memory.

## Everything is broken — start fresh

Data directories are separate from the code. Point `XPI_MEMO_DATA_DIR` at an empty directory for a clean trial run; your original data stays untouched.

Still stuck? Open an issue at the [repository](https://github.com/Coffelix2023/xpi-memo/issues) with the JSON output of `/xpi-memo-status`.
