## Context

fx-pi-memoharness is a working T1 memory system in a monorepo at `fx-pi-extensions/packages/fx-pi-memoharness/` with 60+ test files, comprehensive routing/governance logic, and mnemosyne CLI integration. The existing architecture has:

- **T1 layer**: Memory routing (global/project/session), candidate lifecycle, recall policies, TUI console
- **Storage**: mnemosyne Python CLI wrapping SQLite vector databases (one per bank)
- **State files**: audit.json (append-only audit trail), candidates.json (pending confirmations)
- **Dependencies**: @earendil-works/pi-coding-agent, typebox, mnemosyne CLI

We need to migrate this to a standalone xpi-memo repository while progressively adding:
- **L0 layer**: JSONL session-trace as source of truth
- **Markdown export**: Human-readable data sovereignty
- **Pluggable search**: Support mnemosyne, ripgrep, qmd interchangeably

The key constraint: existing memoharness users must be able to upgrade smoothly without breaking changes or data loss.

## Goals / Non-Goals

**Goals:**
- Ship working v0.1 within 1-2 weeks (drop-in replacement for memoharness)
- Implement L0 session-trace layer progressively (v0.2)
- Enable Markdown data sovereignty (v0.3)
- Make mnemosyne optional by v1.0 (v0.4)
- Preserve all 60+ existing tests through migration
- Maintain backward compatibility throughout evolution

**Non-Goals:**
- T2 (AI memory) or T3 (memvid) in this change - deferred to next phase
- Rewriting existing governance/routing logic unless required by L0 integration
- Breaking API changes to tools (remember/recall/forget/sleep)
- Changing TUI console UX in v0.1

## Decisions

### Decision 1: Staged evolution over big-bang rewrite

**Chosen**: Four-phase evolution (v0.1 → v0.2 → v0.3 → v0.4 → v1.0)

**Rationale**: 
- Reduces risk by shipping working increments
- Allows early user feedback
- Preserves existing investment in tests and implementation
- Each phase has clear deliverables and rollback points

**Alternatives considered**:
- **Big-bang rewrite**: Implement everything before shipping → rejected because 3-4 week delay before users can adopt, higher risk
- **Immediate L0-only**: Remove mnemosyne in v0.1 → rejected because loses semantic search capability and forces migration

### Decision 2: L0 as JSONL append-only log

**Chosen**: One JSONL file per session at `<dataDir>/sessions/<sessionId>/events.jsonl`

**Rationale**:
- Simple format: one JSON object per line, append-only
- Easy to implement without dependencies
- Easy to debug: `cat events.jsonl | jq`
- Efficient streaming: read/write line-by-line
- Follows l0-contract.md from existing memoharness documentation

**Alternatives considered**:
- **SQLite database**: More complex, requires schema migrations, harder to inspect → rejected
- **Single global JSONL**: Session isolation requires complex indexing → rejected
- **Protobuf/binary**: Harder to debug, not human-readable → rejected for L0 (though could be used for derived indexes)

**Event schema**:
```typescript
interface L0Event {
  position: number;           // monotonic within session
  timestamp: string;          // ISO 8601
  type: 'user_message' | 'assistant_message' | 'tool_call' | 'tool_result' 
        | 'file_change' | 'compaction' | 't1_memory_write' | 'candidate_created' 
        | 'candidate_confirmed' | 'candidate_rejected' | 'routing_decision';
  payload: Record<string, unknown>;  // type-specific data
}
```

### Decision 3: Dual-write pattern for transition (v0.2-v0.3)

**Chosen**: Write to both L0 log AND existing storage (mnemosyne, audit.json, candidates.json) during v0.2-v0.3

**Rationale**:
- Enables gradual migration without breaking existing functionality
- L0 log can be validated against existing storage
- Rollback is trivial: just stop writing to L0
- Allows comparison testing: derive state from L0 vs read from existing storage

**Alternatives considered**:
- **L0-only immediately**: Too risky, no fallback → rejected
- **Read-only L0**: Doesn't test write path → rejected
- **Two-phase commit**: Overengineered for local file operations → rejected

**Implementation**: Wrap existing operations with L0 event emission:
```typescript
// Before (v0.1)
await runtime.adapter.store(operation);
runtime.audit.record('write', {...});

// After (v0.2)
const l0Event = createL0Event('t1_memory_write', operation);
await l0Writer.append(l0Event);  // NEW: L0 first
await runtime.adapter.store(operation);  // Keep existing
runtime.audit.record('write', {...});   // Keep existing
```

### Decision 4: Markdown export as derived view

**Chosen**: Markdown files are generated FROM L0 log, not written directly

**Rationale**:
- Single source of truth (L0 log)
- Markdown can be regenerated at any time
- Users can safely edit Markdown (next run regenerates from L0)
- Fits pi-memory philosophy: Markdown for sovereignty, log for truth

**Alternatives considered**:
- **Markdown as primary storage**: Parsing ambiguity, harder to query → rejected
- **Bidirectional sync**: Complex conflict resolution → deferred to future if needed
- **No Markdown at all**: Loses data sovereignty goal → rejected

**Export trigger points**:
1. Manual command: `xpi-memo export`
2. Auto-export on session end (configurable)
3. Auto-export on T1 write (configurable, may be noisy)

### Decision 5: Search backend abstraction with runtime fallback

**Chosen**: Define `SearchBackend` interface, implement adapters for mnemosyne/ripgrep/qmd, select at runtime

**Rationale**:
- Allows gradual backend adoption
- Users can switch backends without code changes
- Degradation path if preferred backend unavailable
- Isolates backend-specific logic

**Interface**:
```typescript
interface SearchBackend {
  name: string;
  isAvailable(): Promise<boolean>;
  search(query: string, scope: Scope, limit: number): Promise<SearchResult[]>;
  capabilities(): BackendCapabilities;
}

interface SearchResult {
  content: string;
  score: number;
  source: { bank?: string; path?: string; position?: number };
  kind?: MemoryKind;
}
```

**Fallback order**: configured → mnemosyne → ripgrep → qmd → empty results with warning

**Alternatives considered**:
- **Hard-coded mnemosyne**: Doesn't allow evolution → rejected
- **Plugin system with dynamic loading**: Overengineered → deferred
- **Separate search service**: Out of scope for v1.0 → deferred

### Decision 6: Preserve existing test infrastructure

**Chosen**: Keep all 60+ test files, add new tests for L0/Markdown/search alongside

**Rationale**:
- Validates backward compatibility
- Regression detection
- Documentation of existing behavior

**Test organization**:
```
src/
  l0/                    # NEW: L0 layer
    event-log.test.ts
    event-log.ts
    context-derivation.test.ts
    context-derivation.ts
  markdown-export/       # NEW: Markdown export
    exporter.test.ts
    exporter.ts
  search/                # NEW: Search backends
    backend.ts
    mnemosyne-backend.test.ts
    mnemosyne-backend.ts
    ripgrep-backend.test.ts
    ripgrep-backend.ts
  index.ts               # KEEP: Existing entry point
  routing.ts             # KEEP: Modify to integrate L0
  candidate-lifecycle.ts # KEEP: Modify to integrate L0
  ... (all existing files)
```

### Decision 7: Migration tooling as first-class feature

**Chosen**: Implement `xpi-memo migrate` command in v0.1 that handles config/data import from memoharness

**Rationale**:
- Lowers adoption barrier
- Reduces support burden
- Tests migration path before users hit it

**Migration command**:
```bash
xpi-memo migrate --from ~/.pi/agent/memoharness --dry-run
xpi-memo migrate --from ~/.pi/agent/memoharness --apply
```

**Alternatives considered**:
- **Manual migration documentation**: Error-prone → rejected

### Decision 8: Complete brand reboot with full rename (memoharness → xpi-memo)

**Chosen**: Rename all user-facing APIs, commands, tools, environment variables, and internal identifiers from "memoharness" to "xpi-memo" in v0.1

**Rationale**:
- Clean break: xpi-memo is a new brand and standalone project, not a monorepo package
- Consistency: package name (`xpi-memo`), function name (`xpiMemo()`), and API names should align
- Long-term clarity: Avoids confusion between old monorepo package (`@fx-pi/memoharness`) and new standalone project
- User expectations: Users installing `xpi-memo` should see `xpi-memo` commands, not legacy names
- Migration is explicit: Users consciously upgrade and migrate data rather than silently replacing

**Breaking changes** (from memoharness):
- Commands: `/memoharness` → `/xpi-memo`, `/memoharness-status` → `/xpi-memo-status`
- Tools: `memoharness_remember` → `xpi_memo_remember`, `memoharness_recall` → `xpi_memo_recall`, `memoharness_forget` → `xpi_memo_forget`, `memoharness_sleep` → `xpi_memo_sleep`
- Environment variables: `MEMOHARNESS_*` → `XPI_MEMO_*`
- Data directory: `~/.pi/agent/memoharness/` → `~/.pi/agent/xpi-memo/`
- Config directory: `~/.config/memoharness/` → `~/.config/xpi-memo/`
- Internal identifiers: `customType: "memoharness-memory"` → `"xpi-memo-memory"`, `T1: "memoharness"` → `"xpi-memo"`, `ui.setStatus("memoharness", ...)` → `ui.setStatus("xpi-memo", ...)`
- Provenance (new writes): `"pi:memoharness_*"` → `"pi:xpi_memo_*"`

**Backward compatibility preserved**:
- Migration tool copies all data from old directories to new
- Historical audit logs keep original provenance values (`pi:memoharness_remember`) for audit integrity
- System reads old provenance values correctly (no rewriting of history)
- Legacy detection: `LEGACY_MEMOHARNESS_DATA_DIR` constant preserved to detect old installations

**Scope of rename** (~138 occurrences in 35 files):
- Function export: `export default function memoharness()` → `xpiMemo()`
- Type names: `MemoharnessDependencies` → `XpiMemoDependencies`, `DEFAULT_MEMOHARNESS_CONFIG` → `DEFAULT_XPI_MEMO_CONFIG`
- Test fixtures: temporary directory prefixes `"memoharness-*"` → `"xpi-memo-*"`
- Skills documentation: Update `skills/memory-boundaries/SKILL.md`

**Alternatives considered**:
- **Keep "memoharness" API names (v0.1-v0.3), rename later**: Would create brand confusion and make later migration more painful → rejected
- **Dual API support (both names)**: Maintenance burden, user confusion about which to use → rejected for v0.1 (could reconsider for transition period in future)
- **Gradual rename across versions**: Users face multiple migration events → rejected

**Implementation strategy**:
1. Automated rename script changes 138 occurrences across 35 files
2. Manual verification of LEGACY_* constants (must preserve old names)
3. Migration tool (`xpi-memo migrate`) handles data/config copying from old paths
4. Documentation clearly explains breaking changes and migration path

- **Automatic detection**: Too magical, users may not want migration → rejected

## Risks / Trade-offs

### Risk: Dual-write consistency during v0.2-v0.3

**Risk**: L0 log and existing storage (mnemosyne, audit.json) could diverge if one write succeeds and another fails

**Mitigation**:
- Write to L0 first (most critical)
- If L0 write fails, abort entire operation
- If subsequent writes fail, log error but L0 has the record
- Add reconciliation command: `xpi-memo doctor --reconcile` checks L0 vs existing storage

**Trade-off accepted**: May have orphaned L0 events that didn't reach mnemosyne during network/disk failures. This is acceptable because L0 is source of truth; reconciliation can replay missing events.

### Risk: JSONL file growth for long sessions

**Risk**: A single session's events.jsonl could grow very large (100MB+) for day-long sessions with many tool calls

**Mitigation**:
- Implement log rotation: when events.jsonl exceeds 10MB, rotate to events.001.jsonl, events.002.jsonl, etc.
- Context derivation reads from current + recent rotated logs
- Old rotated logs can be archived or compressed

**Trade-off accepted**: Very long sessions may require multiple file reads. This is acceptable because most sessions are <1000 events (<1MB).

### Risk: Markdown export performance for large histories

**Risk**: Exporting months of session history to Markdown could take minutes

**Mitigation**:
- Export is async and reports progress
- Default to last 30 days unless user specifies --all
- Incremental export: only process new L0 events since last export
- Background export option: run in separate process

**Trade-off accepted**: Initial full export of large history is slow. This is acceptable because it's one-time and optional.

### Risk: Search backend unavailability

**Risk**: User configures ripgrep backend but doesn't have rg installed

**Mitigation**:
- Availability check on startup, warn if configured backend unavailable
- Automatic fallback to next available backend
- Clear installation instructions in error messages
- Status command shows available backends

**Trade-off accepted**: Silent fallback may confuse users expecting specific backend. Logging and status visibility mitigate this.

### Risk: Backward compatibility breaks in mnemosyne CLI

**Risk**: Future mnemosyne updates could break our CLI integration

**Mitigation**:
- Version check: warn if mnemosyne version is outside tested range
- Search backend abstraction isolates mnemosyne-specific code
- Tests against multiple mnemosyne versions in CI (when available)
- Graceful degradation: if mnemosyne breaks, fall back to other backends

**Trade-off accepted**: We don't control mnemosyne's release cycle. Making it optional (v0.4) reduces this risk long-term.

### Risk: L0 event schema evolution

**Risk**: Future changes to L0 event schema could break old log reading

**Mitigation**:
- Include schema version in each event: `{ version: 1, ... }`
- Implement schema migration on read: v1 events are upgraded to v2 format in-memory
- Never mutate on-disk events
- Document schema changes in CHANGELOG

**Trade-off accepted**: Schema migrations add complexity. This is acceptable because L0 is foundational and stability is critical.

## Migration Plan

### Phase 1: v0.1 - Foundation (Week 1-2)

**Deliverable**: Standalone xpi-memo package that's a drop-in replacement for fx-pi-memoharness

**Steps**:
1. Create xpi-memo repo structure
2. Copy source files from memoharness
3. Update package.json (name: "xpi-memo", remove monorepo deps)
4. Update imports (remove monorepo paths)
5. Run all tests, fix any broken imports
6. Implement `xpi-memo migrate` command
7. Add migration tests
8. Write README for standalone usage
9. Tag v0.1.0

**Rollback**: Users continue using fx-pi-memoharness; xpi-memo is a separate package

### Phase 2: v0.2 - L0 Session Trace (Week 3-4)

**Deliverable**: L0 event log running alongside existing storage

**Steps**:
1. Implement L0 event log writer (JSONL)
2. Implement L0 event log reader
3. Define event types and schemas
4. Integrate L0 writes into existing operations (dual-write)
5. Add L0 tests
6. Add `xpi-memo l0 status` command
7. Add `xpi-memo doctor --reconcile` command
8. Tag v0.2.0

**Rollback**: Disable L0 writes via config flag; system operates as v0.1

### Phase 3: v0.3 - Markdown Export (Week 5-6)

**Deliverable**: Markdown files derived from L0 log

**Steps**:
1. Implement Markdown exporter (L0 → MEMORY.md, daily/*.md)
2. Add export command: `xpi-memo export`
3. Add auto-export on session end (configurable)
4. Add export tests
5. Document Markdown format
6. Tag v0.3.0

**Rollback**: Disable auto-export; manual export is optional feature

### Phase 4: v0.4 - Pluggable Search (Week 7-8)

**Deliverable**: Search backend abstraction with mnemosyne/ripgrep/qmd support

**Steps**:
1. Define SearchBackend interface
2. Implement MnemosyneBackend (wrap existing code)
3. Implement RipgrepBackend (search Markdown + JSONL)
4. Implement QmdBackend (optional, if available)
5. Implement backend selection and fallback
6. Add backend availability checks
7. Make mnemosyne an optional dependency in package.json
8. Add search backend tests
9. Tag v0.4.0

**Rollback**: Configure backend to "mnemosyne" only; system operates as v0.3

### Phase 5: v1.0 - Polish & Stabilization (Week 9+)

**Deliverable**: Production-ready stable release

**Steps**:
1. Performance optimization (L0 log rotation, export incremental)
2. Documentation complete
3. Migration guide for memoharness users
4. Integration tests for all phases
5. Version compatibility matrix
6. Tag v1.0.0

**Rollback**: Each feature (L0, Markdown, pluggable search) has config flag to disable

## Open Questions

None. All design decisions needed for task breakdown are resolved. Future questions (e.g., "Should we support custom Markdown templates?") can be answered during implementation without changing specs or tasks.
