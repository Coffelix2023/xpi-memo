# xpi-memo Staged Evolution Tasks

## Phase 1: v0.1 - Foundation (Week 1-2)

### 1. Repository Setup

- [x] 1.1 Verify xpi-memo repository structure exists (package.json, tsconfig.json, biome.jsonc already present) and run `pnpm install`
- [x] 1.2 Backup existing src/index.ts skeleton and copy all 66 source files from fx-pi-memoharness/src/ to xpi-memo/src/ and verify file count matches
- [x] 1.3 Copy skills/ and docs/ directories from fx-pi-memoharness and verify they exist in xpi-memo
- [x] 1.4 Update package.json to add "pi.skills" config and verify peerDependencies match source project
- [x] 1.5 Create and run rename script (scripts/rename-to-xpi-memo.sh) to change all "memoharness" identifiers to "xpi-memo" (~138 occurrences in 35 files) and verify completion
- [x] 1.6 Manually verify LEGACY_MEMOHARNESS_DATA_DIR constant in src/config.ts was NOT renamed (must preserve old name for migration detection)
- [x] 1.7 Run grep to check for any remaining "memoharness" references (excluding LEGACY_) and fix manually if found
- [x] 1.8 Run `pnpm typecheck` and fix any type errors from rename
- [x] 1.9 Run `pnpm lint` and fix any linting issues
- [x] 1.10 Run `pnpm test` and fix any test failures from rename
- [x] 1.11 Run verification script (scripts/verify-naming.sh) to confirm naming consistency

### 2. Migration Tooling

- [x] 2.1 Implement config migration logic (src/migration/config-migrator.ts) to read ~/.config/memoharness/config.json, translate env var names (MEMOHARNESS_*→ XPI_MEMO_*), and write to ~/.config/xpi-memo/config.json, and verify unit test migrates sample config
- [x] 2.2 Implement audit log import logic (src/migration/audit-importer.ts) to copy audit.json preserving original provenance values (pi:memoharness_*) without modification, and verify unit test parses entries correctly
- [x] 2.3 Implement bank discovery logic (src/migration/bank-discovery.ts) to detect existing mnemosyne.db files in ~/.pi/agent/memoharness/ and banks/project-*/ subdirectories
- [x] 2.4 Implement candidate import logic (src/migration/candidate-importer.ts) to copy candidates.json preserving all metadata and verify it maintains candidate state
- [x] 2.5 Create migration CLI command (src/cli/migrate.ts) with --from, --dry-run, and --apply flags and verify `xpi-memo migrate --help` shows complete usage including path examples
- [x] 2.6 Implement migration dry-run mode showing files to copy, config translations, and disk space requirements without modifying any files
- [x] 2.7 Implement migration apply mode with progress reporting (copying banks, audit log, candidates, config) and verify it creates new xpi-memo data directory without touching originals
- [x] 2.8 Add migration validation checks (verify file counts match, check config translation correctness, detect incomplete migrations) and verify they catch issues
- [x] 2.9 Implement migration report generation (Markdown summary with file counts, data sizes, any warnings) and verify report is written to `<dataDir>/migration-report-<timestamp>.md`

### 3. Documentation and Release

- [x] 3.1 Write standalone README.md with installation, usage, migration guide, and new API names (/xpi-memo, xpi_memo_*) and verify it renders correctly on GitHub
- [x] 3.2 Write MIGRATION.md guide explaining breaking changes (command/tool/env var renames) and migration process and verify it covers all scenarios
- [x] 3.3 Update package.json with repository URL, keywords ("xpi-memo", "memory", "mnemosyne"), description, and license and verify metadata is complete
- [x] 3.4 Run full test suite (pnpm typecheck && pnpm lint && pnpm test) and verify all pass with 0 errors
- [x] 3.5 Create GitHub repository (if not exists), commit all changes with comprehensive commit message documenting breaking changes, and push code
- [x] 3.6 Tag v0.1.0 with release notes documenting breaking changes and migration path, push tag, and create GitHub release

## Phase 2: v0.2 - L0 Session Trace (Week 3-4)

### 4. L0 Event Log Infrastructure

- [x] 4.1 Define L0Event type and event schemas (src/l0/types.ts) and verify types are exported
- [x] 4.2 Implement JSONL event log writer (src/l0/event-log-writer.ts) with atomic append and verify unit test can write events
- [x] 4.3 Implement JSONL event log reader (src/l0/event-log-reader.ts) with streaming support and verify unit test can read events
- [x] 4.4 Implement session ID generation and log file path resolution (src/l0/session-manager.ts) and verify each session gets unique ID
- [x] 4.5 Add event position tracking (monotonic counter per session) and verify positions are sequential
- [x] 4.6 Implement log rotation logic (split when events.jsonl exceeds 10MB) and verify rotation creates events.001.jsonl, events.002.jsonl

### 5. L0 Integration with Existing Operations

- [x] 5.1 Add L0 event emission to memory write operations (src/index.ts) and verify t1_memory_write events are logged
- [x] 5.2 Add L0 event emission to candidate lifecycle (src/candidate-lifecycle.ts) and verify candidate_created, candidate_confirmed, candidate_rejected events are logged
- [x] 5.3 Add L0 event emission to routing decisions (src/routing.ts) and verify routing_decision events are logged
- [x] 5.4 Add L0 event emission to user messages and tool calls (src/index.ts hooks) and verify user_message and tool_call events are logged
- [x] 5.5 Implement dual-write pattern (L0 first, then existing storage) and verify both L0 log and audit.json contain same events
- [x] 5.6 Add error handling for L0 write failures (abort operation if L0 write fails) and verify operation is aborted when L0 is unavailable

### 6. L0 Context Derivation

- [x] 6.1 Implement deterministic context derivation from L0 log (src/l0/context-derivation.ts) and verify same log produces same derived context
- [x] 6.2 Implement event type filtering based on context policy and verify filtered view omits excluded event types
- [x] 6.3 Implement context budget application (fold older events when budget exceeded) and verify older events are represented by folding markers
- [x] 6.4 Implement folding marker generation and verify markers reference correct event range

### 7. L0 Commands and Validation

- [x] 7.1 Add `xpi-memo l0 status` command showing session count, event count, disk usage and verify it reports accurate statistics
- [x] 7.2 Add `xpi-memo doctor --reconcile` command to check L0 vs existing storage and verify it detects divergence
- [x] 7.3 Implement reconciliation logic to replay missing events and verify missing mnemosyne writes can be recovered from L0
- [x] 7.4 Add L0 enable/disable config flag and verify disabling L0 falls back to v0.1 behavior
- [x] 7.5 Add comprehensive L0 integration tests and verify L0 layer works end-to-end
- [x] 7.6 Tag v0.2.0 and create release and verify release notes document L0 features

## Phase 3: v0.3 - Markdown Export (Week 5-6)

### 8. Markdown Exporter Core

- [x] 8.1 Implement L0-to-Markdown transformer (src/markdown-export/transformer.ts) and verify it converts events to prose
- [x] 8.2 Implement MEMORY.md generator (src/markdown-export/memory-generator.ts) with sections for decisions/preferences/constraints and verify it groups memories by kind
- [x] 8.3 Implement daily log generator (src/markdown-export/daily-generator.ts) creating daily/YYYY-MM-DD.md files and verify dates use ISO 8601 format
- [x] 8.4 Implement source traceability (embed event position in Markdown) and verify each entry references source L0 event
- [x] 8.5 Implement duplicate detection for MEMORY.md and verify only latest version of duplicate content appears
- [x] 8.6 Implement handoff log generation on compaction and verify handoff entries are marked with "Handoff:" prefix

### 9. Export Commands and Configuration

- [x] 9.1 Add `xpi-memo export` command with --session and --all flags and verify it generates Markdown files
- [x] 9.2 Implement export progress reporting for long-running exports and verify progress percentage is displayed
- [x] 9.3 Add auto-export on session end (configurable) and verify Markdown is generated when session ends
- [x] 9.4 Implement export configuration (output directory, content filters, privacy redaction) and verify config is respected
- [x] 9.5 Implement incremental export (only process new L0 events since last export) and verify re-export is fast
- [x] 9.6 Add export error handling (disk full, permission denied, corrupt events) and verify errors don't block session

### 10. Export Validation and Polish

- [x] 10.1 Implement export validation (verify all events were exported) and verify validation reports missing exports
- [x] 10.2 Add Git-friendly formatting (append-only, stable ordering) and verify diffs are clean
- [x] 10.3 Add Markdown export tests covering all event types and verify exported Markdown is human-readable
- [x] 10.4 Document Markdown file format in MARKDOWN-FORMAT.md and verify documentation is complete
- [x] 10.5 Tag v0.3.0 and create release and verify release notes document Markdown export

## Phase 4: v0.4 - Pluggable Search (Week 7-8)

### 11. Search Backend Abstraction

- [x] 11.1 Define SearchBackend interface (src/search/backend.ts) and verify interface is exported
- [x] 11.2 Define SearchResult and BackendCapabilities types and verify types cover all backends
- [x] 11.3 Implement backend selection logic with fallback chain and verify fallback order is respected
- [x] 11.4 Implement backend availability checking and verify unavailable backends are detected
- [x] 11.5 Add backend performance metrics tracking (latency, result count) and verify metrics are recorded

### 12. Backend Implementations

- [x] 12.1 Implement MnemosyneBackend (src/search/mnemosyne-backend.ts) wrapping existing CLI code and verify it returns standardized results
- [x] 12.2 Implement RipgrepBackend (src/search/ripgrep-backend.ts) searching Markdown and JSONL and verify it finds matches with context
- [x] 12.3 Implement QmdBackend (src/search/qmd-backend.ts) for semantic search and verify it invokes qmd CLI correctly
- [x] 12.4 Implement scope mapping (global/project/session → backend-specific targets) and verify correct directories are searched
- [x] 12.5 Implement result limit enforcement across all backends and verify no backend exceeds requested limit

### 13. Backend Configuration and Polish

- [x] 13.1 Add backend configuration (preferred backend, fallback options) and verify runtime backend switching works
- [x] 13.2 Make mnemosyne an optionalDependency in package.json and verify package installs without mnemosyne
- [x] 13.3 Add backend installation guidance in error messages and verify messages include installation commands
- [x] 13.4 Update status command to show available backends and active backend and verify output is accurate
- [x] 13.5 Add comprehensive search backend tests and verify all backends pass integration tests
- [x] 13.6 Tag v0.4.0 and create release and verify release notes document pluggable search

## Phase 5: v1.0 - Polish & Stabilization (Week 9+)

### 14. Performance Optimization

- [x] 14.1 Optimize L0 log rotation for large sessions and verify rotation doesn't block operations
- [x] 14.2 Optimize Markdown export for large histories and verify incremental export is fast
- [x] 14.3 Add caching for expensive operations (project identity resolution, backend availability) and verify caching reduces latency
- [ ] 14.4 Profile and optimize hot paths and verify improvements with benchmarks

### 15. Documentation and Testing

- [ ] 15.1 Write comprehensive user guide (GUIDE.md) and verify it covers all features
- [ ] 15.2 Write architecture documentation (ARCHITECTURE.md) and verify it explains L0/T1 layers
- [ ] 15.3 Write troubleshooting guide (TROUBLESHOOTING.md) and verify it covers common issues
- [ ] 15.4 Add integration tests covering all phases (v0.1 → v0.2 → v0.3 → v0.4) and verify upgrade path works
- [ ] 15.5 Create version compatibility matrix and verify it documents tested configurations
- [ ] 15.6 Update README with full feature list and verify documentation is complete

### 16. Final Release

- [ ] 16.1 Run full test suite across all phases and verify 100% pass rate
- [ ] 16.2 Verify backward compatibility with memoharness data and verify migration works flawlessly
- [ ] 16.3 Verify all config flags work (L0 enable/disable, auto-export, backend selection) and verify each flag has expected effect
- [ ] 16.4 Create migration guide for memoharness users and verify guide is clear
- [ ] 16.5 Tag v1.0.0 and create release and verify release notes are comprehensive
- [ ] 16.6 Publish to npm (if applicable) and verify package is installable
