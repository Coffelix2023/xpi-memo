## 1. Intent Capture Closure

- [x] 1.1 Add the four field-reported natural-expression cases to `memory-intent.test.ts`, including the verified project-fact rejection, and verify the focused test fails against the current marker gate.
- [x] 1.2 Remove the independent explicit-marker precondition and make zero/one/multiple category matches drive skip, capture, or ambiguity while preserving existing governance guards; verify all memory-intent tests pass.

## 2. Actionable Recall Results
- [x] 2.1 Add an optional real memory ID to the backend-neutral search result contract and map Mnemosyne row IDs without changing ripgrep or qmd result semantics; verify search backend tests cover present and absent IDs.
- [x] 2.2 Forward the optional backend ID through `xpi_memo_recall`, returning `null` only when unavailable while retaining bank provenance; verify recall/tool tests assert both Mnemosyne and fallback behavior.

## 3. Bank-Aware Forget
- [x] 3.1 Add focused forget tests for current-project success, project miss followed by default success, no-project default deletion, all-bank failure, and stop-after-first-success; verify the tests fail against the current default-only handler.
- [x] 3.2 Implement ordered current-project/default bank probing without changing the `xpi_memo_forget(memoryId)` schema; verify successful results report the actual bank and failed probes never claim deletion.
- [x] 3.3 Record deletion audit only after success with the actual bank and bounded reason metadata; verify audit assertions contain no memory body and no false deleted event on total failure.

## 4. End-to-End Regression

- [x] 4.1 Extend the real Mnemosyne CLI integration test to store and recall a project memory, use the recalled non-null ID to forget it, and verify it is absent from the project bank afterward.
- [x] 4.2 Re-run the existing global remember/recall/forget integration path and verify single-argument API compatibility remains intact.
- [x] 4.3 Run `pnpm typecheck`, `pnpm -w run lint`, and `pnpm test`; verify all required project gates pass with no unrelated source changes.
