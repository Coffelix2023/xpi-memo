---
name: memory-boundaries
description: Use xpi-memo T1 memory within fixed routing, evidence, confirmation, and sleep boundaries; keep L0 session trace separate.
---

# xpi-memo Memory Boundaries

`xpi-memo` owns T1 Mnemosyne memory only. Keep these boundaries explicit:

- **L0 event-sourced session trace** owns the append-only current-session event history and deterministic context derivation. Do not copy raw L0 events, transcripts, tool output, or model reasoning into T1.
- **T1 Mnemosyne** stores bounded cross-session facts, global preferences/workflows, verified project facts, governed project decisions, and bounded `session_context`.
- T2 `ai-memory` and T3 Memvid are separate tiers. Do not select an engine arbitrarily or duplicate raw history across tiers.

## Writes

Before durable storage, classify the memory kind, target bank, scope, evidence, confidence, and provenance. Auto-store only explicit stable preferences/workflows and verified project facts. Project decisions, ambiguous preferences, broad gotchas, and cross-layer conclusions require a pending candidate and user confirmation.

Reject secrets, credentials, tokens, private keys, cookies, raw transcripts, raw tool output, raw L0 events, model reasoning, and unverified speculation. A rejected payload must not be copied into audit data.

## Sleep

`sleep` is disabled by default. Run it only after explicit user authorization. Never trigger it from recall, status, automatic writes, background activity, or session end. Use a dedicated model only when the upstream capability is verified; otherwise return a capability error and never silently fall back to the primary model.

## Recall

Default recall is limited to the current project bank plus bounded global preferences/workflows. Never search unrelated project banks by default. Use L0 session trace for current-session continuity and T1 recall for governed cross-session facts.
