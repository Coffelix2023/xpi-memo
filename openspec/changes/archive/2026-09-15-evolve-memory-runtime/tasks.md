## 1. Memory lifecycle event foundation

- [x] 1.1 Define the body-free memory event contract, finite event kinds, bounded metadata, operation correlation and terminal statuses; verify serialization rejects memory bodies, secrets and unbounded fields.
- [x] 1.2 Add an in-process observer connected to existing L0/audit lifecycle outcomes; verify observer failure does not change T1 write or recall correctness.
- [x] 1.3 Emit capture, rejection, candidate, confirmation, storage, recall, injection, deletion and degradation events from existing operation paths; verify each started operation reaches a diagnosable terminal outcome.
## 2. User-visible status

- [x] 2.1 Extend footer/TUI rendering with a throttled one-line memory status showing phase, scope, count and bounded operation identifier; verify normal coding interaction remains non-blocking.
- [x] 2.2 Extend existing status/trace output with recent body-free event summaries and backend distinction; verify stored, candidate, rejected, recalled, injected and degraded states are distinguishable.
- [x] 2.3 Add Agent-visible memory status summaries with provenance-safe state labels; verify pending and model-derived candidates are never presented as confirmed facts.
## 3. Preference profile projection

- [x] 3.1 Define deterministic Profile projection from governed global preference/workflow memories, including source references, scope, confirmation time, status and bounded budgets; verify identical T1 state produces identical profile output.
- [x] 3.2 Add supersedes, contradicts, temporary-override and pending relation handling without mutating historical evidence; verify corrected preferences exclude superseded values from stable profile injection.
- [x] 3.3 Add bounded profile injection to the existing recall/context path; verify session-local overrides do not overwrite global preferences and conflicting durable values are not silently selected.
- [x] 3.4 Reuse existing remember/forget/candidate governance for Profile management; verify no dedicated second truth store or ungoverned edit path is introduced.

## 4. Feedback and preference evolution

- [x] 4.1 Add explicit helpful, wrong and irrelevant feedback operations through the existing governed memory surface; verify evidence type and provenance remain unchanged.
- [x] 4.2 Add passive low-risk usage feedback for recall/injection outcomes, rate-limited and limited to freshness/ranking signals; verify passive feedback cannot directly create or confirm a durable memory.
- [x] 4.3 Apply explicit user corrections with stronger precedence than passive feedback; verify old preferences are retained for traceability but no longer dominate recall.
- [x] 4.4 Expose bounded feedback, conflict and supersession counters in status/doctor; verify no memory bodies or sensitive rejection details appear.

## 5. Cross-session behavior evaluation

- [x] 5.1 Create fixed fixtures for language/style preferences, project isolation, candidate uncertainty, corrections, no-hit recall, backend fallback and write failure; verify fixtures drive the same governed hooks where practical.
- [x] 5.2 Implement bounded metrics for preference accuracy, scope leakage, false memory, correction latency, memory utility and user awareness; verify unavailable semantic backends are reported separately from logic failures.
- [x] 5.3 Add cross-session integration coverage for durable preference survival and corrected preference behavior; verify source trace links later behavior to the relevant memory operation.

## 6. Verification and rollback

- [x] 6.1 Run focused unit and integration tests for event safety, profile projection, relations, feedback and status schema; verify all new scenarios pass.
- [x] 6.2 Run `pnpm typecheck`, `pnpm -w run lint` and `pnpm test`; verify no existing governance, routing, export or isolation tests regress.
- [x] 6.3 Run isolated Pi smoke coverage for status/trace, remember, recall, export, forget and disabled sleep; verify stale context or status schema failures are not hidden.
- [x] 6.4 Document feature flags and rollback behavior for profile injection, event presentation and passive feedback; verify disabling new surfaces leaves existing L0/T1 operations usable.
