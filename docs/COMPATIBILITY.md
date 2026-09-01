# Version Compatibility Matrix

Tested configurations for xpi-memo releases. "Tested" = the project's own development environment plus its integration test suites (`real-cli.integration.test.ts`, `isolated-pi.integration.test.ts`).

## xpi-memo v1.0.0

| Component | Tested | Notes |
|---|---|---|
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
|---|---|---|
| memoharness (any version with `~/.pi/agent/memoharness/`) | xpi-memo v1.0.0 | `/xpi-memo-migrate --from ~/.pi/agent/memoharness --apply` (dry-run first) |
| xpi-memo v0.1 | v1.0.0 | none needed; banks/audit/candidates formats unchanged |
| xpi-memo v0.2 | v1.0.0 | none needed; L0 JSONL schema version 1 unchanged |
| xpi-memo v0.3 | v1.0.0 | none needed; Markdown layout unchanged (`markdown/MEMORY.md`, `daily/`) |
| xpi-memo v0.4 | v1.0.0 | none needed; `searchBackend` config unchanged |

## Feature availability by release

| Feature | v0.1 | v0.2 | v0.3 | v0.4 | v1.0.0 |
|---|---|---|---|---|---|
| T1 memory (remember/recall/forget/sleep) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Migration tool | ✓ | ✓ | ✓ | ✓ | ✓ |
| L0 session trace | — | ✓ | ✓ | ✓ | ✓ |
| `doctor` L0 reconcile | — | ✓ | ✓ | ✓ | ✓ |
| Markdown export (incremental) | — | — | ✓ | ✓ | ✓ |
| Pluggable search backends | — | — | — | ✓ | ✓ |
| Performance: stat-free L0 append, export skip-read, identity cache | — | — | — | — | ✓ |

## Degradation behavior

- No mnemosyne → recall falls back to ripgrep over exported Markdown + raw JSONL.
- No backends at all → recall returns empty with a warning naming install commands.
- `XPI_MEMO_L0_ENABLED=false` → v0.1 behavior (no session logs).
- `XPI_MEMO_AUTO_EXPORT=false` → no auto-export; manual `/xpi-memo-export` only.
