# Version Compatibility Matrix

Tested configurations for xpi-memo releases. "Tested" = the project's own development environment plus its integration test suites (`real-cli.integration.test.ts`, `isolated-pi.integration.test.ts`).

## xpi-memo v1.0.0

| Component | Tested | Notes |
| --- | --- | --- |
| Pi Coding Agent | 0.84.x | Loads `src/index.ts` directly; no build step |
| Node.js | 24.12+ | LTS required by Pi |
| pnpm | 11.x | Development only (tests, lint); runtime needs none |
| TypeScript | 5.9 strict | Typecheck via `pnpm typecheck` |
| mnemosyne (optional) | 3.15.x (`uv tool install mnemosyne-memory`) | Vector + FTS5 search backend; absence degrades to ripgrep |
| ripgrep (optional) | 15.x (`brew install ripgrep` / `dnf install ripgrep`) | Full-text backend over Markdown + JSONL |
| qmd (optional) | not tested (not installed locally) | Semantic backend; skipped by the fallback chain when absent |
| OS | macOS 26 (arm64), Fedora Linux 42 | File permissions (0600/0700) follow POSIX |

## Data compatibility

| From | To | Path |
| --- | --- | --- |
| xpi-memo v0.2 | v1.0.0 | none needed; L0 JSONL schema version 1 unchanged |
| xpi-memo v0.3 | v1.0.0 | none needed; Markdown layout unchanged (`markdown/MEMORY.md`, `daily/`) |
| xpi-memo v0.4 | v1.0.0 | none needed; `searchBackend` config unchanged |

**No automatic data migration.** The memory-observability change adds new state files (`idempotency.json`, `extraction-budget.json`) but never migrates, rewrites, merges, or symlinks existing data. Existing banks, `candidates.json`, `audit.json`, and L0 session logs remain byte-for-byte readable. New files appear only when activation or extraction actually runs; their absence is not an error and nothing depends on their existence.

**Config compatibility.** All pre-existing config keys keep their names, env-var overrides, and semantics. New keys are added:

| Config key | Env var | Default | Notes |
| --- | --- | --- | --- |
| `offlineExtractionEnabled` | `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED` | `false` | Gated offline extraction; **disabled by default** so existing installs see zero behavior change until they opt in |
| `sleepMode` | `XPI_MEMO_SLEEP_MODE` | `disabled` | Sleep execution mode (`dedicated` / `session-model` / `mechanical` / `disabled`); fail-closed — no explicit mode means `SLEEP_DISABLED`, never a silent substitution |
Unknown config keys are ignored (fail-closed parsing); sensitive keys (`token`, `secret`, `credential`, `apiKey`, `password`) are never written or logged.

**Rollback.** Downgrading to a pre-observability version is safe: the new files are additive and ignored by older code; explicit activation and recall behavior already existed, and no old file format changes. To disable new capture behavior without uninstalling, set `XPI_MEMO_PAUSED=true` (pauses all T1 writes/recalls) — banks, candidates, audit, and L0 logs stay readable. The project layer is opt-in and reversible: delete `.pi/xpi-memo/project.json` to undo a non-Git init (project memory reverts to rejected-outside-Git), and delete `.pi/memory/` to remove exported Markdown — machine state in the global bank is untouched by either.

**Disabled-by-default extraction.** With `offlineExtractionEnabled` left at its default `false`, no extraction runner is invoked, no budget ledger is consumed, and no proposal is generated. Explicit deterministic capture, candidates, recall, and export are completely unaffected.

## Feature availability by release

| Feature | v0.1 | v0.2 | v0.3 | v0.4 | v1.0.0 |
| --- | --- | --- | --- | --- | --- |
| T1 memory (remember/recall/forget/sleep) | ✓ | ✓ | ✓ | ✓ | ✓ |
| L0 session trace | — | ✓ | ✓ | ✓ | ✓ |
| Markdown export (incremental) | — | — | ✓ | ✓ | ✓ |
| Pluggable search backends | — | — | — | ✓ | ✓ |
| Performance: stat-free L0 append, export skip-read, identity cache | — | — | — | — | ✓ |
| Memory activation loop (explicit intent capture, idempotent) | — | — | — | — | ✓ |
| Human-readable observability (taxonomy, snapshot, candidate digest) | — | — | — | — | ✓ |
| Gated offline extraction (disabled by default) | — | — | — | — | ✓ |
| Explicit non-Git project init (`/xpi-memo-init`, `.pi/xpi-memo/project.json`) | — | — | — | — | ✓ |
| Session-scoped `session_context` outside Git | — | — | — | — | ✓ |
| Bounded outcomes + reason codes (routing/recall/sleep/doctor) | — | — | — | — | ✓ |
| Explicit sleep modes + `SLEEP_DISABLED` state | — | — | — | — | ✓ |
| Project Markdown export `.pi/memory/` + governed re-import | — | — | — | — | ✓ |
| Read-only orphan bank detection | — | — | — | — | ✓ |

## Degradation behavior

- No mnemosyne → recall falls back to ripgrep over exported Markdown + raw JSONL.
- No backends at all → recall returns empty with a warning naming install commands.
- `XPI_MEMO_L0_ENABLED=false` → v0.1 behavior (no session logs).
- `XPI_MEMO_AUTO_EXPORT=false` → no auto-export; manual `/xpi-memo-export` only.
- No project identity (non-Git, uninitialized) → project kinds are rejected with `routing_rejected`/`project-identity-required`; global and session memory keep working; `/xpi-memo-init` opts in.
- No sleep mode configured → `xpi_memo_sleep` returns `SLEEP_DISABLED`; no memory change, no silent fallback.
- No search backend → recall reports `backend-queried-no-hits` vs `backend-not-run` distinctly.
