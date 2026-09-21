## Context

See `proposal.md` for motivation and `specs/mental-model-projections/spec.md` for behavior. The constraints shaping the implementation are:

- L0 owns append-only event history and provenance; confirmed T1 rows in Mnemosyne banks own current governed long-term memory.
- `src/profile.ts` and Markdown projection already establish the pattern for deterministic derived views that never become a second truth store.
- Whole-bank reads are allowed only through the existing bounded, read-only export path used by projections; exact operational flows must not read SQLite directly.
- Model work is already optional, provider-neutral, safety-filtered, bounded, and non-blocking through the offline runner boundary.
- Global and project memory use separate banks. Project selection must preserve Git/local project identity and must fail closed when identity is unavailable.
- Extension startup and normal memory behavior must not require Hindsight or any new runtime dependency.

## Goals / Non-Goals

**Goals:**

- Add two explicit standing-answer definitions: global user working style and current-project operating model.
- Detect projection freshness locally from the effective governed source state.
- Refresh stale projections through an opt-in, bounded, provider-neutral path.
- Persist projections atomically with enough metadata to explain freshness and trace sources.
- Deliver only fresh, relevant projections within a separate injection budget and suppress duplicated source rows.
- Keep code modular: definition/source selection, state/persistence, synthesis, and delivery remain separable from host wiring.

**Non-Goals:**

- Replacing Mnemosyne, T1 governance, ordinary recall, the preference profile, or Markdown export.
- Importing Hindsight code, running a Hindsight service, or matching its API.
- Adding a T1 memory kind for generated summaries.
- Letting a model discover new standing questions, infer personality, or promote generated text into T1.
- General tags/tag groups, cron scheduling, arbitrary schemas, full/delta document editing, or an unbounded history store.
- Changing explicit `xpi_memo_recall`; projection delivery affects only automatic context injection.

## Decisions

### 1. Use a derived projection, not a memory kind

A projection record is stored outside Mnemosyne and the candidate queue. Its identity is `(definitionId, ownerKey)`, where `ownerKey` is `global` for the user model and the canonical project bank/identity key for the project model.

Each persisted record contains:

- schema version and definition ID;
- owner key and semantic scope;
- generated content;
- bounded source memory IDs;
- a deterministic source digest;
- maximum traced L0 event position when available;
- generated time and last successful refresh time;
- state plus bounded failure category;
- safety policy and generator metadata needed for diagnosis, without prompts or raw outputs.

The source digest, not a timestamp alone, is the freshness authority. It is computed from a canonical ordering of each selected row's stable ID and state-relevant fields. This detects deletion and supersession, which a write-only watermark can miss. The L0 position remains a provenance pointer, not the sole invalidation mechanism.

**Alternatives considered:**

- Add `mental_model` to `MemoryKind`: rejected because generated multi-source prose would enter routing, admission, recall, and export as if it were a governed fact.
- Derive directly from L0: rejected because L0 intentionally includes corrections, rejected proposals, tool output, and obsolete statements.
- Use only latest timestamps: rejected because deletion and some relation changes are not reliably represented by a newer surviving row.

### 2. Ship two built-in definitions before adding user-defined configuration

The definition registry contains:

- `user-working-style`: global scope; `global_preference` and `global_workflow`.
- `active-project-operating-model`: project scope; `project_gene`, `project_constraint`, `project_decision`, and `project_gotcha`.

Definitions are code-owned, versioned, and independently enabled by effective configuration. Changing a definition's question, source kinds, or definition version invalidates its projection. Synthesis has a separate `mentalModelSynthesisEnabled` switch that defaults to `false`; local freshness evaluation may remain enabled under the existing “local deterministic defaults on” philosophy.

**Alternatives considered:**

- Arbitrary user-created definitions in the first release: rejected because it requires public CRUD, validation, migration, and UI decisions before the two validated use cases prove value.
- Automatic discovery of questions: rejected because it lets generated behavior choose new durable attention targets.

### 3. Select sources through a bounded T1 projection read

A source reader uses the existing bounded bank-export abstraction, never SQLite. It converts confirmed bank rows into the existing recall/profile-shaped metadata and then applies, in order:

1. owner bank and semantic scope;
2. definition kind allowlist;
3. source metadata validity;
4. superseded/deleted exclusion;
5. deterministic sort;
6. fixed item and character budgets.

Candidates are not bank rows and never enter this reader. The selected set supplies both the synthesis input and the source digest. If the bounded bank read fails or exceeds its hard payload/time cap, freshness becomes unknown/failed; the system does not call the model and does not declare the previous projection fresh.

Initial limits should reuse existing safe constants where they fit and otherwise remain small fixed defaults rather than exposing a broad tuning surface. A practical implementation target is no more than 32 source rows and 12,000 source characters per projection, with generated content capped independently.

**Alternatives considered:**

- Semantic recall to gather sources: rejected because equal T1 state could produce backend-dependent source sets and make freshness nondeterministic.
- An unbounded full-library scan: rejected; the existing bank projection read is bounded by timeout and payload size.

### 4. Keep deterministic sensing separate from model synthesis

Freshness evaluation is a pure comparison of:

- definition version;
- owner key;
- selected-source digest;
- persisted successful digest.

It yields `absent`, `fresh`, `stale`, `pending`, `failed`, or `disabled`. `pending` is transient while a refresh is executing; only a successful atomic commit changes the successful digest.

The host performs freshness evaluation lazily when status or automatic context needs it and once before eligible offline refresh. Per-session memoization avoids repeating bounded bank exports for the same unchanged bank state.

**Alternatives considered:**

- Refresh on every T1 write: rejected because bursts would cause repeated synthesis and couple memory commits to optional model work.
- Make the model decide whether a model is stale: rejected because freshness must remain cheap and reproducible.

### 5. Reuse the runner and safety contract, but keep refresh accounting distinct

Mental-model synthesis uses the existing injected-runner precedence and session-model resolution. It reuses external-content redaction/refusal, timeout/abort handling, and provider-neutral invocation patterns. It does not reuse proposal normalization or T1 governance because its output is not a memory proposal.

A small mental-model refresh ledger records per-session attempted definition IDs and bounded execution/output consumption. This prevents `before_compact` and `session_shutdown` from refreshing the same unchanged definition twice without making mental-model work consume the existing memory-proposal quota. Default limits allow at most one attempt per definition per session, with a shared small output budget.

Lifecycle behavior:

1. Determine stale/absent definitions.
2. Skip when disabled, source-empty, already attempted for the same digest, unsafe, or over budget.
3. Run one bounded synthesis per eligible definition without blocking lifecycle completion.
4. Validate a closed output object containing content and source IDs.
5. Require returned source IDs to be a subset of submitted IDs.
6. Safety-check generated content for delivery/storage policy.
7. Commit atomically; only then update the successful digest.

**Alternatives considered:**

- Reuse the extraction proposal ledger unchanged: rejected because its proposal/character counters and `consumedThrough` semantics do not describe projection refreshes and could starve either feature.
- Add a new provider SDK: rejected; the host runner already supplies the required abstraction.

### 6. Store one current projection per definition and owner

Derived files live below the existing data root, for example:

```text
<dataDir>/mental-models/
├── global/user-working-style.json
└── projects/<project-bank-key>/active-project-operating-model.json
```

The implementation uses private directories/files and temp-file-plus-rename. It keeps only the current successful content plus current bounded failure metadata; L0/audit retain lifecycle evidence. No unbounded content history is added.

A failed refresh updates bounded operational state without replacing successful content or its digest. To avoid splitting authoritative metadata across files, the write operation reconstructs one record containing the old successful payload plus the new failed state and atomically replaces the record. If that diagnostic write also fails, the prior record remains valid but stale detection will still fail closed on the next read.

**Alternatives considered:**

- Store projections in project repositories: rejected because generated local memory state should not enter source control or leak across machines.
- Keep every content version: rejected because L0/audit plus source references provide diagnosis without unbounded duplicate prose.

### 7. Deliver projections before ordinary automatic recall, then suppress covered rows

Automatic context assembly evaluates enabled definitions against the current query and context:

- The project operating model is eligible only for its exact current project and project-oriented coding context.
- The user working-style model is eligible when preference/workflow intent is detected or when the existing profile path would be eligible.

Delivery uses a dedicated maximum of two items and a fixed character budget. Each block is wrapped as untrusted, derived memory data and passes the same prompt-injection filter used by recalled memories. Only `fresh` records are eligible.

After a projection is selected, its source IDs are supplied as exclusions to automatic recall ranking. Explicit recall remains untouched. A source row may survive automatic suppression only when a separate unmatched need selects it and total budgets still permit it; diagnostics count suppressed duplicates.

If no safe projection survives, ordinary recall/profile behavior proceeds unchanged. The system never emits a partial projection body when the projection itself exceeds budget; it omits that projection.

**Alternatives considered:**

- Inject projection and all source rows: rejected because it increases tokens and lets duplicate wording dominate context.
- Replace recall globally: rejected because projections answer only two stable questions and ordinary recall remains necessary for specific facts.

### 8. Add bounded lifecycle events and status fields, not prose logs

New event/audit outcomes describe freshness checks, refresh attempts/results, refusal categories, and injection counts. They include definition ID, owner key hash or bank identifier, source count, digest prefix, source boundary, duration, output size, status, and reason category. They exclude source bodies, generated bodies, prompts, and raw model output.

Status/doctor aggregate these records and current projection metadata. Source tracing resolves projection source IDs through existing exact-ID/T1 and L0 trace paths. No new general-purpose diagnostic dump is introduced.

## Risks / Trade-offs

- **[Generated synthesis can omit or distort a governed fact]** → Keep T1 authoritative, expose source IDs, inject only fresh projections, retain ordinary recall fallback, and never write synthesis back to T1.
- **[A stale projection can look settled]** → Use a source digest that detects deletion and relation changes; fail closed when source state cannot be read; never inject stale/failed state.
- **[Whole-bank projection reads add startup or prompt latency]** → Evaluate lazily, memoize per session, retain hard export timeout/payload caps, and never perform model work on the hot path.
- **[Projection and source rows duplicate context]** → Suppress covered IDs only in automatic recall and report the count.
- **[Separate budget state adds one more local file]** → Keep one versioned, count-only ledger with atomic writes; do not introduce a scheduler or database.
- **[Fixed definitions are less flexible]** → Accept the limitation until real usage proves public definition management is needed.
- **[Project key mistakes could cross scopes]** → Derive owner keys only from existing routing identity/bank resolution and fail closed without project identity.
- **[Removing Hindsight compatibility features reduces parity]** → Intentional: this change adopts the concept, not the external architecture; tags, cron, delta documents, and arbitrary schemas remain separate future decisions.

## Migration Plan

1. Add versioned definition, projection, state, source-selection, synthesis, and delivery modules with tests; leave host wiring disabled.
2. Add configuration with synthesis defaulting to off. Existing configs load without migration.
3. Add storage readers/writers. Missing directories mean `absent`; no eager migration or projection creation occurs.
4. Wire deterministic freshness and body-free status first; verify no model calls and no existing behavior changes.
5. Wire gated lifecycle synthesis and validate disabled, unavailable, timeout, unsafe, invalid-output, and successful paths.
6. Wire bounded automatic delivery and source-ID suppression behind fresh-state checks.
7. Run required typecheck, workspace lint, and tests before enabling any local experiment.

Rollback is deletion or disabling of the host wiring/configuration plus removal of the derived `mental-models/` directory. T1 banks, L0 history, candidates, profiles, and Markdown projections require no rollback because this change never mutates their contracts or data.
