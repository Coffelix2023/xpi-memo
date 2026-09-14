## 1. Bank state read primitive

- [x] 1.1 Survey the `mnemosyne export` output against a real bank and record which fields the memory sections expose (id, content, source, timestamp, session id, superseded marker) together with the measured elapsed time and parse size; verify the record contains measured numbers, and apply the pre-committed fallback to read-only SQLite only if the numbers exceed 5 seconds or 5 MB of parsed payload
- [x] 1.2 Implement the bounded bank state read (fixed timeout, size cap, temporary file cleaned up on every outcome, failure returned as failure); verify unit tests cover success, timeout, size overflow, and parse failure, and that no partial result is returned

## 2. Dual-source merge and projection

- [x] 2.1 Merge bank rows with L0 annotations keyed by memory ID, taking kind, scope, confirming time, session and position from `t1_memory_write`; verify unit tests cover annotated rows, rows with no L0 match, and annotations pointing at rows that no longer exist
- [x] 2.2 Apply the fixed sort key (section, then L0 position, then memory ID) and place unannotated rows at the end of their section; verify repeated projection of identical input produces byte-identical output
- [x] 2.3 Preserve the existing projection behaviour: atomic replace, section structure, exact-duplicate `supersededBy` marking, corrupt-event warnings, and source-reference fields; verify the existing export tests stay green without assertions being removed
- [x] 2.4 Remove the superseded L0-fold projection implementation; verify no stale references remain via a repository search and the full test suite stays green

## 3. Failure semantics and acceptance

- [x] 3.1 On a bank read, timeout or parse failure, keep the last successful `MEMORY.md` and leave the projection state retryable, never writing an empty or partial projection; verify injected read-failure and write-failure tests assert both behaviours
- [x] 3.2 Verify the regression scenario end to end: write A, export, delete A, export, and assert `MEMORY.md` no longer contains A while unrelated entries remain; additionally verify that a manual edit of `MEMORY.md` is corrected by the next export
- [x] 3.3 Update `ARCHITECTURE.md` and `MARKDOWN-FORMAT.md`, explicitly distinguishing "the projection layer reads bank state" from "forget must not use a full-library scan"; verify both documents state the two boundaries separately
- [x] 3.4 Run `pnpm typecheck`, `pnpm -w run lint` and `pnpm test`, and record the results; verify all three exit 0
- [x] 3.5 Write the per-task-group report required by `AGENTS.md` section 7 into `docs/task-report/dev-<next-id>/`, stating purpose, effect, characteristics and boundaries for each `##` group; verify the file exists and covers all four elements
