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
| — (env-only) | `XPI_MEMO_AUTO_VERIFY` | kill switch | `false`/`0` disables repository-fact verification; all candidates queue for manual review |
| `autoAdmit` | `XPI_MEMO_AUTO_ADMIT` | `true` | Config-file switch for auto-admission: a verified `project_gene` candidate auto-stores unless this is `false`. When the env var is set it overrides the config file, and `XPI_MEMO_AUTO_VERIFY=false`/`0` still wins over both; `project_constraint` and every other kind always queue for review |
| `sleepMode` | `XPI_MEMO_SLEEP_MODE` | `disabled` | Sleep execution mode (`dedicated` / `session-model` / `mechanical` / `disabled`); fail-closed — no explicit mode means `SLEEP_DISABLED`, never a silent substitution |
Unknown config keys are ignored (fail-closed parsing); sensitive keys (`token`, `secret`, `credential`, `apiKey`, `password`) are never written or logged.

**Removed config keys (change `remove-typesafe-decision-boundary`).** Seven keys of the optional TypeSafe System One decision boundary were removed together with the boundary itself: `decisionRunnerEnabled`, `decisionRerankEnabled`, `decisionRerankGapThreshold`, `decisionRepeatJudgmentEnabled`, `decisionRepeatThreshold`, `decisionCalibrationEnabled` and `decisionStabilityThreshold` (env: `XPI_MEMO_DECISION_*`). A leftover key in `config.json` is an **inert unknown key**: parsing still ignores unknown keys, so nothing has to be migrated and the file needs no edit — the stale key is not reported as an invalid value either. `TYPESAFE_API_KEY` and `TYPESAFE_API_URL` are no longer read by the extension at all, so a leftover value in a shell profile is harmless. The boundary was off by default and unreachable without an explicit endpoint, so an existing install sees no behavior change. **Rollback:** `git revert` of the removal commit; it carries no data, schema, or L0/T1 change. The rationale and the deltas live in `openspec/changes/remove-typesafe-decision-boundary/`.

**Rollback.** Downgrading to a pre-observability version is safe: the new files are additive and ignored by older code; explicit activation and recall behavior already existed, and no old file format changes. To disable new capture behavior without uninstalling, set `XPI_MEMO_PAUSED=true` (pauses all T1 writes/recalls) — banks, candidates, audit, and L0 logs stay readable. The project layer is opt-in and reversible: delete `.pi/xpi-memo/project.json` to undo a non-Git init (project memory reverts to rejected-outside-Git), and delete `.pi/memory/` to remove exported Markdown — machine state in the global bank is untouched by either.

## Lifecycle event migration and rollback boundary

- New lifecycle writes add `operationId` correlation to existing `routing_decision` and `t1_memory_write` records, and may emit `memory_failed` and `memory_delete_requested`; `memory_deleted` remains the confirmed deletion event.
- The upgraded reader is backward-compatible with historical events that have no `operationId`: legacy committed writes remain readable, while deletion correlation without a verifiable ID stays visible as a bounded diagnostic and is never matched by body text.
- Before rolling back to a reader that predates these lifecycle events: (1) finish a full Markdown export and save its output, (2) stop emitting new lifecycle events, including `memory_failed` and `memory_delete_requested`, and stop adding new correlation fields, (3) restore the older code, and (4) retain the L0 logs and export backup for manual reconciliation.
- Do not continue writes after step 2: an older reader may treat the new event types as unknown, so rollback is not a live downgrade while governed operations are still active.

**Disabled-by-default extraction.** With `offlineExtractionEnabled` left at its default `false`, no extraction runner is invoked, no budget ledger is consumed, and no proposal is generated. Set `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=true` to opt in. Extraction runs once at `session_shutdown` for the current session only; `session_before_compact` records L0 context but does not trigger another model call. In TUI mode the attempt shows a shimmer progress line above the editor (`正在提取记忆候选...`) and clears it when the attempt finishes or fails; non-TUI modes stay silent. The runner is host-injected and provider-neutral; missing, failed, or timed-out runners degrade silently, consume the per-session execution budget, and expose only bounded status/counters through status and audit. Proposals always use `l0-conclusion` evidence and pass the existing content, routing, and candidate governance; audit never stores proposal bodies. Disable with `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED=false` or pause T1 writes with `XPI_MEMO_PAUSED=true`. Explicit deterministic capture, candidates, recall, and export remain available according to their existing paused contract.

**Repository-fact verification and auto-admission (stabilize + optimize-offline-extraction-and-auto-admit changes).** Every candidate-producing entry (offline extraction, `xpi_memo_remember`, repository reimport) obtains exactly one admission decision from the candidate store. `project_gene` candidates may carry a structured `repositoryFact` declaration (repo-relative path + verbatim excerpt + optional revision); the verifier checks the declared file inside the project root, requires the excerpt to appear verbatim in a non-comment line, and rejects path escapes, missing files, comment evidence, and revision mismatches with bounded reason codes. **Auto-admission is the default**: a passing verification stores the candidate in T1 unless `XPI_MEMO_AUTO_ADMIT=false` (or `autoAdmit: false` in the config file) is set with the kill switch off. With admission disabled, the pass is recorded as a bounded `tool-verified` audit entry (`decision: shadow-verified`) plus a `tool_verification_shadow` L0 event, and the candidate stays pending — no T1 write. Auto-admission applies to `project_gene` only; `project_constraint` stays shadow even with a registered verifier. Failures (no declaration, excerpt not found, comment evidence, revision mismatch, timeout, missing git) keep the candidate pending with its original evidence type; `verified-tool-result` evidence is never upgraded. **Existing queued candidates are never auto-migrated** — a dry-run over the live backlog (117 candidates, 36 verifiable, 0 declarations) confirmed zero coverage and zero writes. Rollback without uninstalling: set `XPI_MEMO_AUTO_ADMIT=false` (candidates keep queuing) or `XPI_MEMO_AUTO_VERIFY=false` (which also disables verification); already-stored memories remain and can be removed with the existing forget flow.

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
- `xpi_memo_forget` 按 adapter 的精确 ID 读取能力分流：能力不可用（当前 Mnemosyne CLI）时直接调用 backend `delete`，由 backend 的 not-found 结果判定目标是否存在，工具返回 `recoverySnapshot: none`；能力可用时先写 recovery 快照再删除（`recoverySnapshot: written`）。两种路径都不使用语义 `recall`、全库 `export` 或 SQLite 直接访问。
