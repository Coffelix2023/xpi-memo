## Why

xpi-memo can govern and recall individual T1 memories, but it has no durable way to recognize that several confirmed memories now form one stable answer, detect when that answer is stale, or reuse the same bounded synthesis across sessions. A mental-model projection closes that gap without weakening the existing boundary: L0 remains authoritative for event history and provenance, T1 remains authoritative for current governed long-term memory, and the projection remains disposable derived state.

## What Changes

- Add explicit mental-model definitions that declare a stable question, scope, and permitted T1 source kinds.
- Add deterministic freshness detection over governed T1 sources using source references and a watermark; freshness checks do not call a model.
- Add an optional, bounded synthesis path at existing offline lifecycle points. It is disabled by default, non-blocking, safety-filtered, and does not write generated content back to T1.
- Persist replaceable mental-model projections with source memory references, L0 provenance watermark, freshness state, generation time, and bounded failure metadata.
- Preserve the last successful projection when refresh fails; advance its watermark only after a successful atomic write.
- Add bounded delivery of fresh projections to automatic context, with project isolation, untrusted-data formatting, and deduplication against covered recall rows.
- Add body-free status and diagnostics for fresh, stale, pending, failed, refreshed, skipped, and injected outcomes.
- Keep the implementation native to xpi-memo. Do not add a Hindsight runtime, service, package, or API dependency.
- Exclude automatic model-definition discovery, arbitrary tag-query languages, cron scheduling, delta document operations, and arbitrary response schemas from this change.

## Capabilities

### New Capabilities

- `mental-model-projections`: Defines explicit model declarations, governed source selection, deterministic staleness detection, gated synthesis, failure-safe projection storage, traceability, and bounded delivery.

### Modified Capabilities

None. Existing L0 history, T1 governance, recall ranking, memory safety, preference profile, and observability requirements remain unchanged and constrain the new capability.

## Impact

- Expected implementation areas: new mental-model domain modules plus minimal wiring in configuration, lifecycle hooks, context injection, status/doctor output, audit/L0 event types, and tests.
- Storage gains a derived mental-model area under the existing xpi-memo data root; it is rebuildable and must not contain a second T1 bank.
- Existing memory kinds, `xpi_memo_remember`, candidate admission, bank routing, and Mnemosyne storage contracts remain compatible.
- Model use and external cost remain opt-in. Deterministic freshness checks may run locally without enabling synthesis.
- No new production dependency is required, and Hindsight source code or runtime components are not adopted.
