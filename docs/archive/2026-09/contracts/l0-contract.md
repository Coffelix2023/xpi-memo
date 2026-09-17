# L0 Session-Trace Contract

## Scope

L0 is an external, implementation-independent session-trace boundary. It is the
lossless source of truth for one session's execution history. T1 Memoharness
may receive only a concise, reviewed conclusion through its own evidence and
promotion policy; it never owns or mirrors the L0 event log.

## Append-only ordered events

A session trace represents user and assistant messages, tool calls and results,
file changes, errors, compaction events, and lifecycle events as an append-only
ordered event history. Earlier events are never mutated or deleted by appending
later events.

Each event has an ordering position owned by the future L0 runtime. The event
payload remains in the owning trace, including when a derived context view is
rebuilt.

## Deterministic context derivation

A model-visible context view is derived from the ordered event history using
explicit deterministic rules:

1. preserve event order;
2. select event types permitted by the context policy;
3. apply an explicit context budget;
4. apply explicit folding markers when older material is represented by a
   bounded summary or reference.

The derivation path does not call an LLM. The same event history, policy, and
budget produce the same derived view.

## Folding and compaction

A folding marker records that a range of raw events is represented in the
derived view by a bounded summary or reference. A folding marker is not a
replacement for the raw events. When the derived view is compacted, only that
view is reduced; the raw event history remains available to the L0 owner for
audit or later deterministic derivation.

L0 does not automatically promote a fold, transcript, tool output, or model
reasoning to T1. A concise conclusion must pass the destination layer's
provenance, evidence, scope, confidence, content, and confirmation rules.

## Deferred implementation boundary

This contract intentionally does not choose or implement a concrete runtime,
storage backend, lifecycle integration, retention policy, or derived-context
algorithm. Those decisions are deferred to a future change. T1 installation,
testing, routing, governed writes, recall, and status must remain operational
without any concrete L0 runtime.

L0 is not a selectable memory engine. It is the session-trace foundation; T1,
T2, and T3 retain their fixed ownership responsibilities.
