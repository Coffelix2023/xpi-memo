## Why

The current fx-pi-memoharness implementation is a working T1 memory system, but it lives in a monorepo and depends on mnemosyne Python CLI. We need to evolve it into xpi-memo as a standalone project that combines mnemosyne's semantic search capabilities with pi-memory's architectural wisdom: event sourcing, data sovereignty through Markdown exports, KV cache-stable injection, and flexible search backends. This staged evolution approach lets us ship a working v0.1 quickly while progressively implementing L0 session-trace, Markdown data sovereignty, and pluggable search backends through v1.0.

## What Changes

- Migrate fx-pi-memoharness from monorepo to standalone xpi-memo repository
- Implement L0 session-trace layer with append-only JSONL event log
- Add Markdown export capability (MEMORY.md, daily/YYYY-MM-DD.md) derived from event log
- Support pluggable search backends (mnemosyne, ripgrep, qmd)
- Make mnemosyne an optional dependency by v1.0
- Maintain backward compatibility with existing memoharness users throughout evolution
- Preserve all existing T1 capabilities: routing, governance, recall policies, TUI console

## Capabilities

### New Capabilities

- `l0-session-trace`: L0 layer that captures append-only ordered session events (user messages, tool calls, file changes, compaction events) in JSONL format with deterministic context derivation rules
- `markdown-export`: Derive human-readable Markdown files from L0 event log (MEMORY.md for long-term decisions/preferences, daily/YYYY-MM-DD.md for daily activity logs) to provide data sovereignty
- `pluggable-search`: Abstraction layer supporting multiple search backends (mnemosyne vector search, ripgrep full-text, qmd semantic) with runtime configuration
- `migration-tooling`: Tools to migrate from fx-pi-memoharness to xpi-memo, including data import and configuration migration

### Modified Capabilities

- `t1-memory-routing`: Extend existing routing to work with L0 event log as source of truth while maintaining backward compatibility with direct mnemosyne access
- `t1-governance`: Adapt candidate lifecycle and confirmation flow to write to both L0 event log and current storage during transition phases

## Impact

**Code:**
- All source files from `fx-pi-extensions/packages/fx-pi-memoharness/` migrate to standalone repo
- New L0 event log infrastructure (JSONL writer, reader, event types)
- New Markdown export derivation logic
- New search backend abstraction layer
- Configuration system extended to support search backend selection

**Dependencies:**
- Phase 1 (v0.1): Keep mnemosyne as required dependency
- Phase 4 (v0.4): mnemosyne becomes optional, add ripgrep/qmd as optional
- Node.js peer dependencies unchanged (@earendil-works/pi-coding-agent, typebox)

**APIs:**
- T1 tools (remember/recall/forget/sleep) signatures unchanged
- Commands (/memoharness, /memoharness-status) unchanged
- Internal: new L0 event log APIs, Markdown export APIs, search backend interface

**Systems:**
- New L0 event storage alongside existing audit.json
- New Markdown export directory structure
- Existing mnemosyne.db banks preserved for backward compatibility
- Configuration file may need updates to specify search backend

**Migration:**
- Existing memoharness users can upgrade smoothly (v0.1 is drop-in replacement)
- Data migration path provided for users who want to backfill L0 from audit.json
- Gradual adoption: users can enable new features (Markdown export, alternative search) progressively
