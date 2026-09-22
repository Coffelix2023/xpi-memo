# xpi-memo User Guide

xpi-memo is a memory extension for the [Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent): governed long-term memory (T1), a lossless session trace (L0), human-readable Markdown export, and pluggable search backends.

## Concepts

**L0 — session trace.** Every session appends events (user messages, tool calls, memory writes, compactions) to an append-only JSONL log at `<dataDir>/sessions/<sessionId>/events.jsonl`. L0 is the source of truth; everything else is derived from it. Rotation splits the log into `events.001.jsonl`, `events.002.jsonl`, … when the active file exceeds 10 MB.

**T1 — governed memory.** Long-term memories live in mnemosyne vector banks (one global, one per project, optional per-session). Writes pass through governance: prohibited-content checks, routing (global/project/session), and a candidate confirmation lifecycle. Recall is policy-driven (`active`, `assist`, `high-value-auto`).

**Markdown export.** Two derived views: `MEMORY.md` projects the bank's *current* state (L0 only annotates kind, scope, session and position; a forgotten memory disappears without needing a deletion event), and `daily/YYYY-MM-DD.md` folds the L0 activity log. You can edit them freely — an edited or deleted `MEMORY.md` is rebuilt by the next export. See [MARKDOWN-FORMAT.md](./MARKDOWN-FORMAT.md).

**Search backends.** Recall runs through a fallback chain: configured → mnemosyne → ripgrep → qmd. Any subset can be installed; unavailable backends are skipped automatically and `/xpi-memo-status` reports what is active.

**Memory activation loop.** When you state an explicit memory intent in a prompt, xpi-memo captures it deterministically through the same governance path as the `xpi_memo_remember` tool — no extra tool call needed. Global preferences and workflows store directly; project decisions, constraints, and gotchas become candidates pending your review. Capture is idempotent per L0 event, session, and content fingerprint, so replayed or repeated input never creates a duplicate row.

**Human-readable taxonomy.** Every T1 memory kind has one canonical label, role, scope, and trust state, shared by the console, status, and Markdown export:

| Internal kind | Label | Role | Scope | Trust state |
| --- | --- | --- | --- | --- |
| `global_preference` | Preference | standing | global | User-confirmed |
| `global_workflow` | Workflow | standing | global | User-confirmed |
| `project_gene` | Repository fact | standing | project | Verified evidence |
| `project_constraint` | Constraint | standing | project | Review required |
| `project_decision` | Decision | contextual | project | Review required |
| `project_gotcha` | Gotcha | contextual | project | Review required |
| `session_context` | Session context | contextual | session | Session-only |

## Installation

```bash
pi install git:github.com/Coffelix2023/xpi-memo@v1.0.0
```

Optional search backends (any subset):

```bash
uv tool install mnemosyne-memory   # vector + FTS5 search
brew install ripgrep               # full-text search (macOS); dnf install ripgrep on Fedora
# qmd (optional semantic search): https://github.com/tobi/qmd#installation
```

Updating: `pi update --extension git:github.com/Coffelix2023/xpi-memo`

## Tools (used by the agent inside a session)

- `xpi_memo_remember` — store a memory; routing decides global/project/session
- `xpi_memo_recall` — search memories through the backend chain
- `xpi_memo_forget` — delete a memory
- `xpi_memo_sleep` — consolidation; requires explicit authorization

## Commands

| Command | Purpose |
| --- | --- |
| `/xpi-memo` | Open the interactive TUI console |
| `/xpi-memo-status` | JSON status: banks, backend availability, active backend, config, observability snapshot (capture/candidate/storage/recall/rejection counts), and the doctor report (`doctor.state` + evidence) |
| `/xpi-memo-init` | Initialize a non-Git project identity (writes `.pi/xpi-memo/project.json`; no SQLite in the repo) |
| `/xpi-memo-export` | Export L0 → Markdown; `--session <id>` limits scope, `--force` re-exports all, `--validate` reports coverage |
| `/xpi-memo-export --repo` | Export governed project memory → `.pi/memory/<kind>.md` in the project root; `--repo --reimport` re-imports discovered entries as governed candidates |
| `/xpi-memo-trace --session <id> --position <n>` / `--candidate <id>` | Bounded path back to the L0 event (or creating event) behind a memory or candidate |
| `/xpi-memo-trace --projection <definitionId>` | Show one mental-model projection's state, source boundary, and derived source references (`--projection user-working-style` or `--projection active-project-operating-model`); bodies are never printed |

## Activation loop

Explicit memory intent in a prompt is routed deterministically. The system recognizes durable statements about preferences, workflow rules, project decisions, constraints, gotchas, and bounded session context (Chinese and English patterns, plus correction signals such as "actually" / "更正"). Ordinary conversation and ambiguous statements are skipped — the system never guesses a category or silently places project content in the global scope.

**What happens per statement:**

1. **Global preference / workflow** — stored directly (low-risk, user-confirmed).
2. **Project decision / constraint / gotcha** — admitted directly under the default preferences and visible on the audit trail; tighten the per-kind admission switch to route them into the Store / Later / Reject queue instead. `project_gene` (repository facts) is never auto-extracted, it requires verified evidence.
3. **Prohibited content** (secrets, credentials, tokens) — rejected; only bounded rejection metadata is recorded.
4. **Missing project identity** (non-Git directory without `xpi-memo-init`) — `routing_rejected` with guidance (`/xpi-memo-init` or switch to a Git repository); content never falls back to the global bank.

Capture is idempotent by L0 event position, session, content fingerprint, and kind. Replaying an input, or a simultaneous explicit `xpi_memo_remember`, produces no duplicate row or candidate.

**Candidate digest.** Pending candidates surface as a one-line body-free digest (counts, per-kind counts, oldest age, review surface) in the TUI. At session start, when the backlog reaches 3+ pending candidates, a non-blocking notification reminds you — throttled to once per 6 hours, never a blocking dialog. Review them in the console: `/xpi-memo` → Pending tab.

**Offline extraction (optional).** When `offlineExtractionEnabled` is `true`, a provider-neutral runner processes the last 200 L0 events (15 s timeout, per-session budgets: 1 execution / 20 proposals / 5 000 chars). In the TUI, **compaction** runs it inline and shows the four stages it walks with their share of the work above the editor — `读取 L0 会话轨迹 25% (1/4)`, `调用提取模型 50% (2/4)`, `解析候选提案 75% (3/4)`, `治理写入 T1 100% (4/4)` — then clears the line. **Session shutdown** starts the same run and returns immediately: switching sessions never waits on a model call, so a run cut off by process exit is picked up by the next session (the budget ledger only records completed ranges). Non-TUI modes stay silent. Proposals carry `l0-conclusion` evidence — never `explicit-user-statement`. High-confidence (`≥0.9`) short session context stores directly; everything else becomes a candidate. Budget exhaustion stops further work. Disabled, unavailable, or failing extraction never blocks the session and never affects explicit capture. The runner uses the chat model by default; set `offlineExtractionModel` — in the console or the config file — to a `provider/model-id` to run extraction on a different model.

**Embeddings (why storing can be slow).** mnemosyne computes a vector per memory unless embeddings are switched off; on a machine without the model cached that fallback path is roughly three quarters of the store cost. mnemosyne resolves this from environment variables on its store path (`MNEMOSYNE_EMBEDDINGS_OFF`, `MNEMOSYNE_EMBEDDING_MODEL`, `MNEMOSYNE_EMBEDDINGS_VIA_API`, `MNEMOSYNE_EMBEDDING_API_URL`) — the matching `config.yaml` keys have no reader there, so setting them in `config.yaml` changes nothing. `embeddingMode` therefore controls what xpi-memo passes to the mnemosyne processes it spawns: `off` (default) disables embedding work, `local` uses a local model, `api` routes to an OpenAI-compatible endpoint. `embeddingModel` empty keeps mnemosyne's own default (`BAAI/bge-small-en-v1.5`). The API key is never stored here: set `MNEMOSYNE_EMBEDDING_API_KEY` (or `OPENAI_API_KEY`) in the environment. Changing the model changes the vector dimension, which existing rows were written with — repair that with `mnemosyne reindex`.

**Repository-fact verification and auto-admission.** A `project_gene` candidate may carry a structured `repositoryFact` declaration (repo-relative path + verbatim excerpt + optional revision). The verifier checks the declared file inside the project root, requires the excerpt to appear verbatim in a non-comment line, and rejects path escapes, missing files, comment evidence, and revision mismatches with bounded reason codes. A pass upgrades the evidence from `l0-conclusion` to `verified-repository-fact`. **Verification is evidence enrichment, not a gate**: a missing declaration, a failed check, or an unavailable verifier no longer strands the candidate, and the outcome reaches `tool-verified` / `tool-verification-failed` on the audit trail and the L0 trace either way.

Admission is **on by default for every kind**. A candidate is written to T1 unless it hits a hard rail (prohibited content, an unresolved conflict, a paused runtime, empty content) or a preference you tightened: a per-kind switch, `admissionMinConfidence`, `admissionEvidenceFloor`, `admissionSourceScope`, or `admissionMaxAgeDays`. `autoAdmit: false` (or `XPI_MEMO_AUTO_ADMIT=false`) turns admission off wholesale, while `XPI_MEMO_AUTO_VERIFY=false|0` disables verification only. Every automatic write carries `candidate-auto-admitted` on the audit trail and `candidate_auto_admitted` in L0, so it can be told apart from a confirmed one; a held candidate carries a bounded `candidate_held` reason instead.

**Rescan and archive.** `/xpi-memo-rescan` re-judges every queued candidate under the current preferences, reusing the same admission decision. It first reports **what it is about to touch, per project bank** (`Rescan preview: 4 queued — project-a (3) · default (1)`), then reports the outcome; counts only, never a candidate body. `--current-project` scopes the walk to this session's project bank (with no project identity it reports that nothing is in scope rather than falling back to every bank). It is idempotent (an admitted candidate is no longer queued) and writes each candidate to its own target bank. Whatever the preferences still hold back moves to the archive instead of piling up: archived records leave the queue, stay recoverable for `archiveRetentionDays` (default 30), and are deleted once that window passes. Deleting a candidate never deletes a T1 memory. Expired records are also swept when the extension loads.

**Recall budgets.** Automatic recall ranks standing and contextual memories separately with query-intent weighting, recency decay, scope priority, superseded filtering, and content deduplication. Each role gets its own item and character budget before injection; when nothing survives, the memory block is omitted entirely. Recall policy controls when automatic injection runs:

| Policy | Behavior |
| --- | --- |
| `active` | Automatic recall on ordinary prompts (1 recall per prompt) |
| `assist` | Explicit-only; no automatic injection |
| `high-value-auto` (default) | Automatic recall only on continuity/history triggers (e.g. "继续上次", "resume where we left off") |

## Project domain memory (`.pi/DNA.yaml`)

Two "human-flavor" domains live in one project file instead of T1: `art` (frontend visual design detail) and `write` (writing / creative habits). Everything else — code habits, project decisions, gotchas — stays in T1. The boundary in one line: **human taste goes into the file, engineering goes into the bank.**

```yaml
# .pi/DNA.yaml — hand-editable; comments and formatting are preserved
art:
  - id: card-border
    semantic: Cards need a 1px border, no shadows
    params: { border: 1px, shadow: none }
    source: user-authored
    confidence: high
write: []
```

- **Entry fields** — `id` (kebab-case, unique per domain), `semantic`, optional `params`, `source` (`user-authored` / `agent-derived` / `agent-translated-user-confirmed`), `confidence` (`high` / `medium` / `low`). Every write is validated fail-closed: unknown fields, duplicate ids, prohibited content, or unconfirmed credentials are rejected and the file stays byte-identical.
- **Who writes** — mainly the agent, through the `xpi_memo_dna_write` tool; you can hand-edit any time. A `user-authored` entry is yours: a conflicting agent update is rejected with a bounded conflict diagnostic and your version is kept. Explicit trusted statements that land in exactly one domain are captured into the file with user-statement provenance instead of creating a T1 candidate; everything else (untrusted project, out-of-domain, both domains) falls back to the existing T1 governance path.
- **How it is delivered** — whole-domain injection, not recall: frontend-looking prompts inject the full `art` domain, writing prompts inject `write`, unrelated sessions inject nothing. The block is headed `项目文件上下文(.pi/DNA.yaml)`, is budgeted (40 entries / 4000 chars, truncation is labelled), and `xpi_memo_recall` never searches this file.
- **Trust gate** — active only in a project Pi trusts; otherwise the file is not read, not written, and never created.
- **Rollback** — it is an ordinary tracked file: `git diff .pi/DNA.yaml` to review, `git checkout -- .pi/DNA.yaml` or `git revert` to undo. Deleting the file turns the feature off; T1 is unaffected.

| Domain | What belongs here | Stays in T1 instead |
| --- | --- | --- |
| `art` | visual taste: spacing, borders, colour, layout | component architecture, UI bug gotchas |
| `write` | writing style, tone, story/script habits | docs standards, PR wording rules |
| (none) | — | code habits (`global_workflow`), project decisions / constraints / gotchas |

## Mental models (derived standing answers)

Confirmed memories answer single facts well; a **mental-model projection** answers a *standing question* built from several of them: "how does this user prefer to work" and "how does this project operate today". Two definitions ship in code and neither can be invented at runtime — `user-working-style` (global preferences and workflows) and `active-project-operating-model` (this project's constraints, decisions, repository facts, and gotchas).

A projection is **derived state**, not another memory: it is stored outside the banks, never becomes a candidate, never enters routing or admission, and deleting it costs nothing. When assembly injects it, the block is wrapped as `<untrusted-memory-data>` and labeled `[derived mental model: <definitionId>]`, and the source rows it covers are suppressed from automatic recall for that prompt (explicit `xpi_memo_recall` is untouched).

**Defaults.** Definition enablement and freshness checks are local and deterministic, so they are on by default; the model call is opt-in. `mentalModelSynthesisEnabled` (default `false`) gates synthesis — with it off, nothing is ever generated, no bank is read on the prompt path, and no lifecycle record is written. `mentalModelDefinitions` (default: both ids) selects which definitions are evaluated and refreshed; an empty value disables the layer entirely. Both are editable in the `/xpi-memo` console under **Mental models**.

**When it runs.** Synthesis only happens at `session_before_compact` and `session_shutdown`, best-effort and non-blocking: a bank read or a model call never delays compaction or switching sessions. Each definition is refreshed at most once per source digest per session (8 attempts / 12 000 generated characters per session). A model reply must be exactly `{content, sourceIds}` with ids drawn from the submitted sources, inside the content cap; anything else is rejected before anything is stored. A failed refresh keeps the previous projection content and its source boundary, reports `stale`/`failed`, and retries at the next trigger.

**Reading the state.** `/xpi-memo-status` reports `mentalModels`: `counts` for `absent` / `fresh` / `stale` / `pending` / `failed` / `disabled` (plus `skipped` for definitions with no resolvable owner), `enabled`, `definitions`, `injectedDecisions` / `injectedChars` / `omitted`, `outcomes` (per refresh outcome code) and a bounded `recent` tail; `doctor.evidence.mentalModels` carries the same counts. Every field is a code, a count, or an identifier — the status output never contains a memory or projection body.

**Tracing one projection.** `/xpi-memo-trace --projection user-working-style` prints the definition, owner, scope, state, source boundary, digest prefix, and — for up to 16 sources — the memory id, kind, scope, and a resolution verdict (`resolved` / `missing` / `unavailable`) through the same exact-ID read path forget uses. Bodies are never printed. When the installed mnemosyne exposes no exact-ID read, rows report `unavailable` rather than an unverifiable `missing`.

**Privacy boundary.** Projections are local derived files under `<dataDir>/mental-models/` (mode 0600 in a 0700 tree) and are never written into a project repository or into source control. Only the bounded, safety-filtered source material for one definition is sent to the model; credentials are redacted first and an unclosed private key refuses the whole call. Generated content is re-checked against the injection policy before it is stored or delivered.

**Rollback.** Set `mentalModelSynthesisEnabled: false` (stops generation immediately) and delete `<dataDir>/mental-models/`. Set `mentalModelDefinitions` to an empty value to turn the layer off entirely, including freshness evaluation and delivery. Confirmed memories, candidates, L0 history, the preference profile, and Markdown export are unaffected either way.

## Project identity and non-Git directories

**Git projects are the default project identity.** Inside a Git worktree, project memory routes to a per-project bank derived from the repository's common directory (shared across worktrees) — no setup needed.

**Non-Git directories need explicit initialization.** Without a Git identity, project memory is rejected — never silently routed to the global bank. To opt in, run:

```
/xpi-memo-init
```

This writes `.pi/xpi-memo/project.json` in the current directory (metadata only — no SQLite/WAL/SHM in the repo) and gives the directory a stable identity (`p-` + sha256[root](:12)) shared by all descendants. Unrelated directories stay isolated. Roll back by deleting that one file.

**Session context works everywhere.** `session_context` is session-scoped and independent of project identity: it can be captured and recalled in an uninitialized non-Git directory, is excluded from unrelated sessions, and never becomes global standing memory.

**Effective recall ranges.** `/xpi-memo-status` reports `recall.scope`: `current-project-plus-global` when a project identity exists, `global-only` outside one (with the reason project memory was not queried). Recall results never mix scopes.

## Outcomes and failure reasons

Every memory operation ends in exactly one outcome, and failure outcomes carry a bounded machine-readable reason (bodies, tokens, and credentials never appear in diagnostics):

| Outcome | Meaning |
| --- | --- |
| `stored` | Written to the T1 bank |
| `candidate` | Queued for review (Store / Later / Reject) |
| `rejected` | Rejected by policy, candidate review, or content policy |
| `skipped` | No explicit intent, ambiguous, or missing provenance |
| `degraded` | Captured with a degraded backend/bank |
| `unavailable` | Capability missing (no search backend, no sleep command) |
| `routing_rejected` | Could not be routed (e.g. project memory without a project identity) |
| `SLEEP_DISABLED` | Sleep requested but disabled or unconfigured |

Routing rejections (`routing_rejected`) and post-routing failures (`memory_failed`) are recorded as bounded L0/audit events with kind, scope, reason, and identity state — countable in status/doctor, never body-bearing.

## Sleep modes

`xpi_memo_sleep` requires explicit authorization and an explicit mode; it never substitutes the primary model silently:

| Mode | Meaning |
| --- | --- |
| `dedicated` | A dedicated sleep model runs consolidation |
| `session-model` | Explicitly configured fallback using the session model |
| `mechanical` | Explicitly configured non-model consolidation |
| `disabled` (default) | Sleep rejected: `SLEEP_DISABLED` state, no memory change |

Configure with `sleepMode` (or `XPI_MEMO_SLEEP_MODE`). The tool result and status/doctor always name the actual executed mode; no fallback is labeled `dedicated`.

## Project Markdown export (`.pi/memory/`)

Governed project memory can be exported as human-readable, deterministic, diffable Markdown under the project root — the global SQLite bank stays the only machine-state write/recall engine:

```
/xpi-memo-export --repo
```

- Writes `.pi/memory/<kind>.md` (one file per project kind) at the project root — never SQLite/WAL/SHM in the repo.
- Deterministic ordering by stable memory anchor: repeated export produces no unrelated diff; superseded/removed memories drop out.
- Privacy: content policy blocks prohibited content; `privacy: true` redacts paths/key-like strings; session traces are never auto-exported.

A new machine (e.g. a fresh clone) can re-import the exported files as governed candidates:

```
/xpi-memo-export --repo --reimport
```

Discovered entries become candidates with `repo-export` provenance — they pass content policy, scope routing, and your review before any T1 write; repeated discovery is deduplicated by stable ID/fingerprint. Orphan project banks (identity no longer resolvable) are reported read-only by status/doctor — never deleted automatically.

## Configuration

User config lives at `~/.config/xpi-memo/config.json` (or set keys via the console). Every key has an environment-variable override:

| Config key | Env var | Default | Effect |
| --- | --- | --- | --- |
| `dataDir` | `XPI_MEMO_DATA_DIR` | `~/.pi/agent/xpi-memo` | Data root (banks, sessions, markdown) |
| `paused` | `XPI_MEMO_PAUSED` | `false` | Pause all T1 writes/recalls |
| `confirmStore` | `XPI_MEMO_CONFIRM_STORE` | `false` | TUI remember stores immediately when false; set `true` to show Store/Later/Reject. Pending-tab review always shows the panel. Non-TUI still queues. |
| `language` | `XPI_MEMO_LANGUAGE` | `en` | Confirmation panel copy: `en` or `zh` |
| `l0Enabled` | `XPI_MEMO_L0_ENABLED` | `true` | Disable L0 logging (system behaves like v0.1) |
| `limit` | `XPI_MEMO_LIMIT` | `5` | Recall result cap |
| `globalLimit` | `XPI_MEMO_GLOBAL_LIMIT` | `5` | Cap for global-scope results |
| `projectLimit` | `XPI_MEMO_PROJECT_LIMIT` | `5` | Cap for project-scope results |
| `autoExport` | `XPI_MEMO_AUTO_EXPORT` | `false` | Export Markdown when a session ends |
| `excludeToolResults` | `XPI_MEMO_EXCLUDE_TOOL_RESULTS` | `false` | Omit tool_result entries from export |
| `privacy` | `XPI_MEMO_PRIVACY` | `false` | Redact paths/key-like strings in export |
| `searchBackend` | `XPI_MEMO_SEARCH_BACKEND` | `auto` | Pin `mnemosyne`/`ripgrep`/`qmd` or walk the chain |
| `recallPolicy` | `XPI_MEMO_RECALL_POLICY` | `high-value-auto` | `active` (auto-recall every prompt) / `assist` (explicit-only) / `high-value-auto` (continuity triggers only) |
| `offlineExtractionEnabled` | `XPI_MEMO_OFFLINE_EXTRACTION_ENABLED` | `false` | Gated offline extraction at session shutdown; disabled by default |
| `offlineExtractionModel` | `XPI_MEMO_OFFLINE_EXTRACTION_MODEL` | `session-model` | Model for the default extraction runner: `session-model` reuses the chat model, otherwise `provider/model-id` (bare `model-id` also works). An unknown id falls back to the session model. Editable in the console (Space opens the inline editor) or in the config file |
| `embeddingMode` | `XPI_MEMO_EMBEDDING_MODE` | `off` | Embedding work for the mnemosyne processes xpi-memo spawns: `off` (no vectors, ~three quarters of the store cost), `local` (model on this machine), `api` (OpenAI-compatible endpoint). Only `off` is fail-closed-safe: an unrecognised value keeps embeddings disabled |
| `embeddingModel` | `XPI_MEMO_EMBEDDING_MODEL` | `""` | Embedding model id for `local`/`api`. Empty keeps mnemosyne's own default (`BAAI/bge-small-en-v1.5`). A model of a different dimension needs `embedding_dim` and `mnemosyne reindex` |
| `embeddingApiUrl` | `XPI_MEMO_EMBEDDING_API_URL` | `""` | Endpoint for `api` mode only; empty keeps mnemosyne's own. The API key stays in the environment (`MNEMOSYNE_EMBEDDING_API_KEY` / `OPENAI_API_KEY`) and is never written to xpi-memo's config |
| `autoAdmit` | `XPI_MEMO_AUTO_ADMIT` | `true` | Whole-rollout switch. An explicitly set env var overrides the config file. `false` keeps every candidate in the review queue with a bounded audit trail |
| `admissionAllow<Kind>` | `XPI_MEMO_ADMISSION_ALLOW_<KIND>` | `true` (all kinds) | Per-kind admission switch. Turn one off to route that kind into the review queue while every other kind keeps storing |
| `admissionMinConfidence` | `XPI_MEMO_ADMISSION_MIN_CONFIDENCE` | `0.7` | Lowest extraction confidence that may enter T1 automatically; a ratio in [0, 1] |
| `admissionEvidenceFloor` | `XPI_MEMO_ADMISSION_EVIDENCE_FLOOR` | `session-conclusion` | `session-conclusion` accepts an unverified session conclusion; `repository-fact` requires a passing repository-fact verification |
| `admissionSourceScope` | `XPI_MEMO_ADMISSION_SOURCE_SCOPE` | `all` | `all` admits into any bank; `current-project` admits only into the current project bank |
| `admissionMaxAgeDays` | `XPI_MEMO_ADMISSION_MAX_AGE_DAYS` | `30` | Candidates older than this are never admitted automatically |
| `archiveRetentionDays` | `XPI_MEMO_ARCHIVE_RETENTION_DAYS` | `30` | Days an archived candidate stays recoverable before it is deleted |
| — | `XPI_MEMO_AUTO_VERIFY` | `true` | Env-only kill switch. `false`/`0` disables repository-fact verification: every candidate queues for manual Store/Later/Reject, and auto-admission has nothing to act on |
| `retrievalMode` | `XPI_MEMO_RETRIEVAL_MODE` | `hybrid` | `fts5` / `hybrid` |
| `sleepMode` | `XPI_MEMO_SLEEP_MODE` | `disabled` | Sleep execution mode: `dedicated` / `session-model` / `mechanical` / `disabled`. Fail-closed: no explicit mode means `SLEEP_DISABLED`; a fallback is never labeled `dedicated` |
| — | `XPI_MEMO_SLEEP_MODEL` | *(empty)* | Env-only. Dedicated sleep model (`provider/model-id`) for `sleepMode=dedicated`; every other mode ignores it |
| `mentalModelDefinitions` | `XPI_MEMO_MENTAL_MODEL_DEFINITIONS` | `user-working-style,active-project-operating-model` | Which built-in mental-model ids are evaluated and refreshed, comma-separated. An unknown id makes the whole value invalid (fail-closed to the default); an empty value disables the layer entirely |
| `mentalModelSynthesisEnabled` | `XPI_MEMO_MENTAL_MODEL_SYNTHESIS_ENABLED` | `false` | Opt in to generating mental-model projections at compaction/session end. Freshness detection and delivery stay local either way |
| `profileInjection` | `XPI_MEMO_PROFILE_INJECTION` | `true` | Bounded derived preference-profile block in the recall context; `false` omits the block only — recall is unchanged |
| `eventPresentation` | `XPI_MEMO_EVENT_PRESENTATION` | `true` | Footer lifecycle-event line and `/xpi-memo-status` event summaries; `false` keeps L0/audit writes and `trace` reads |
| `passiveFeedback` | `XPI_MEMO_PASSIVE_FEEDBACK` | `true` | Rate-limited `used` feedback on recall/injection; `false` keeps explicit feedback and corrections |

### Disabling runtime surfaces (rollback)

The `evolve-memory-runtime` surfaces can be disabled independently. Turning all three off is the supported rollback: it leaves L0 capture, T1 governance, recall, export, forget and disabled sleep working exactly as before, and it never touches stored data — re-enabling restores the previous behavior.

| Surface | Disable with | What still works |
| --- | --- | --- |
| Preference profile injection | `profileInjection: false` | Recall still injects governed memories; projection stays available for status/diagnostics |
| Lifecycle event presentation | `eventPresentation: false` | L0/audit records keep being written; `/xpi-memo-status` keeps backend, counts and doctor evidence |
| Passive usage feedback | `passiveFeedback: false` | Explicit `helpful`/`wrong`/`irrelevant` feedback and corrections keep working |

## Data roots and CLI cross-checks

All three mnemosyne data roots live on disk side by side; the extension never merges or symlinks them:

| Root | Path | Who writes there |
| --- | --- | --- |
| Configured root | `~/.pi/agent/xpi-memo` (or `XPI_MEMO_DATA_DIR`) | The extension — every spawn sets `MNEMOSYNE_DATA_DIR` to this path |
| CLI default root | `~/.hermes/mnemosyne/data` | A bare `mnemosyne` command run without the env var |
| Stale root | `~/xpi-memo` | Legacy installs; typically empty |

`/xpi-memo-status` reports all three under `doctor.evidence.roots` (with distinct inodes, so a symlink merge is visible). Consolidating a split root is a **manual** check — there is no automated migration:

```bash
# See what the extension sees (same data root the extension writes to):
MNEMOSYNE_DATA_DIR="$XPI_MEMO_DATA_DIR" mnemosyne stats
# or, when XPI_MEMO_DATA_DIR is not set in your shell:
MNEMOSYNE_DATA_DIR="$HOME/.pi/agent/xpi-memo" mnemosyne stats
```

## Daily workflow examples

Check the system is healthy:

```
/xpi-memo-status
```

`/xpi-memo-status` includes the L0 session-trace summary (`l0.enabled`, `l0.sessionCount`, `l0.totalEvents`, `l0.totalBytes`) and the doctor report — one command covers health.

Export everything to Markdown (one-time, safe to repeat — incremental):

```
/xpi-memo-export
```

Pause writes during a sensitive session:

```bash
XPI_MEMO_PAUSED=true pi
```

## Upgrading from memoharness

The dedicated migration command and `docs/MIGRATION.md` were removed. Tool names changed once: `memoharness_remember` → `xpi_memo_remember` (and similarly for `recall`/`forget`/`sleep`). Historical `pi:memoharness_*` provenance values in existing L0/audit data are never rewritten — only new writes use the `xpi_memo_*` names.

Existing banks under `~/.pi/agent/memoharness/` are not auto-migrated; copy what you want to keep by hand into `~/.pi/agent/xpi-memo/banks/` (or `XPI_MEMO_DATA_DIR`), or start fresh and let L0 re-derive memory.

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

### No extraction progress line above the editor
The line that says `正在提取记忆候选...` and walks four stages is gated, and both gates are closed the way a fresh install ships:

- **It needs extraction to be on.** Nothing runs unless `offlineExtractionEnabled` **and** `l0Enabled` are both `true`. With either off, the session ends without any extraction, so there is nothing to show; the extension now says so in a one-line notice at session end (`Offline extraction is off (offlineExtractionEnabled is false): ...`).
- **It needs a surface that survives.** Compaction shows the line inline. Session shutdown starts the same run fire-and-forget, but the widget would land on a context that is already tearing down, so shutdown carries none by design (and a non-TUI session shows none at all).

Open both gates from `/xpi-memo` → **Settings** (`离线提取` / Offline extraction), or in `~/.config/xpi-memo/config.json`:

```json
{ "offlineExtractionEnabled": true, "l0Enabled": true }
```

`/xpi-memo-status` echoes both values under `config`, so you can confirm the gate before a long session rather than after it.
