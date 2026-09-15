## Context

See `proposal.md` for motivation and scope. Existing `xpi-memo` already has L0 as the append-only source of event provenance, T1 as the governed memory state, audit/status surfaces, candidate lifecycle, recall ranking and Markdown projection. The design must preserve those boundaries and must not introduce a second memory truth source.

## Goals / Non-Goals

**Goals:**

- Make memory operations observable during execution without exposing memory bodies by default.
- Give each memory operation a stable correlation identity and terminal outcome.
- Derive a bounded preference profile from governed T1 memories.
- Represent supersession, conflict, correction and feedback without destroying historical provenance.
- Validate memory usefulness across sessions and projects with reproducible scenarios.

**Non-Goals:**

- Replacing Mnemosyne or adding another database/vector store.
- Building a full Web dashboard or remote memory service.
- Automatically inferring personality, health, sensitive identity or durable emotion from one interaction.
- Treating model-generated proposals as user-confirmed facts.
- Making all memory activity blocking or requiring a confirmation dialog.

## Decisions

### 1. Use the existing L0/audit path as the event source

Memory lifecycle events should be emitted alongside existing L0 and audit writes, with a bounded in-process observer for footer/TUI/status consumers. L0 remains the durable provenance record; the observer is a presentation path and may lose transient display events without changing memory correctness.

Alternatives considered:

- A new event database: rejected because it creates a second source of truth and migration burden.
- Writing memory bodies to a live stream: rejected because it increases privacy exposure and is unnecessary for user awareness.

### 2. Use a discriminated, body-free event schema

Events use a finite event kind and bounded metadata: operationId, sessionId, scope, memory kind, status, result count, reason code, source event reference, and timestamp. Sensitive rejection details and memory content remain outside the event payload.

The event lifecycle should support capture/detected, rejected, candidate-created, confirmed, stored, recalled, injected, used, superseded, forgotten and degraded. A terminal event is required for operations that start successfully; failures use explicit degraded/rejected/error status rather than silent disappearance.

### 3. Keep Profile as a deterministic projection, not a new store

The profile is calculated from active, governed global preference/workflow memories plus bounded feedback and relation metadata. It can be cached or exported as a derived view, but its authoritative inputs remain T1 rows and their provenance. Rebuilding the profile from the same governed state should be deterministic.

The profile resolver should apply this order:

1. scope eligibility;
2. active/non-superseded state;
3. conflict exclusion or explicit resolution;
4. user-confirmed evidence before model-derived proposals;
5. recency/freshness and bounded feedback;
6. item and character budgets.

### 4. Model corrections as relations and state transitions

Do not mutate historical evidence. A correction creates a new governed memory or candidate and records a supersedes/contradicts relation. The old memory remains traceable but is excluded or down-ranked by automatic profile and recall policies.

### 5. Treat feedback as evidence about usefulness, not proof of truth

Helpful/wrong/irrelevant feedback can influence freshness, ranking and profile confidence, but it must not change the original evidence type from explicit user statement, verified tool result or model-derived proposal. Explicit user correction has stronger governance effect than passive usage signals.

### 6. Prefer progressive disclosure for visibility

The default surface is one short footer/status line. A status or trace command exposes bounded event details. Agent-visible summaries contain counts, scope and state, while full memory content remains available only through governed recall or the existing review surface.

### 7. Evaluate behavior, not storage alone

Evaluation fixtures should drive the same registered hooks and storage boundaries as production where practical. A passing test requires the memory to affect a later decision or response under the intended scope, not merely to exist in a bank. Environment failures such as missing Mnemosyne are reported separately from logic failures.

## Risks / Trade-offs

- **[Risk]** More visible events could create TUI noise. → Keep the default line compact, throttle repeated events, and expose details only on demand.
- **[Risk]** A transient observer can miss events. → Persist authoritative state through existing L0/audit first; observability is not the write commit path.
- **[Risk]** Feedback may reinforce an incorrect memory. → Treat feedback as ranking/freshness input, preserve evidence types, and require explicit correction for high-impact changes.
- **[Risk]** Profile projection can hide useful conflicting evidence. → Expose conflict and omission counts in status and retain explicit recall access to source memories.
- **[Risk]** Cross-session evaluation may overfit to scripted prompts. → Include paraphrases, project switches, corrections, backend fallback and negative cases.
- **[Risk]** Operation correlation can expose session identifiers. → Use bounded short display identifiers while retaining full IDs only in local diagnostics.

## Migration Plan

1. Add event types and adapters that can be populated from existing lifecycle outcomes without changing storage semantics.
2. Add footer/status rendering and tests; keep the event observer optional and fail-open for presentation.
3. Add relation metadata and derived profile computation using existing T1 records; default profile injection to a conservative bounded mode.
4. Add feedback and correction handling behind explicit governed operations.
5. Add cross-session evaluation fixtures and run the existing typecheck, lint and test gates.
6. Roll back by disabling profile injection and the presentation observer; retain L0/T1 data and existing tools unchanged.

## Open Questions

- Whether Pi should expose a dedicated command for recent memory events or extend the existing status/trace commands.
- Whether feedback should be model-generated only after explicit user confirmation or also support passive low-risk usage signals.
- Whether profile entries need a user-facing edit surface in the first release or can initially be managed through existing forget/remember flows.
