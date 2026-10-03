# Design

## Context

See `proposal.md` for motivation and scope. The repository is a TypeScript Pi extension loaded directly from `src/index.ts`; it has no build artifact. The current baseline uses Pi `0.87.1`, has two physical `pi-tui` versions in the lockfile, and has one physical `typebox@1.3.27`. Pi `1.0.1` changes the tool execution context to `ExtensionToolContext` and uses fullscreen TUI by default.

## Goals / Non-Goals

**Goals:**

- Make the manifest and lockfile resolve one coherent Pi `1.0.1` runtime.
- Preserve existing extension registration, tool results, lifecycle behavior, and model-call behavior.
- Adapt only the test helpers required by the new tool-context type.
- Verify physical singleton state for `pi-tui` and `typebox`.
- Verify custom terminal surfaces in regular mode, fullscreen mode, and terminal fallback.
- Keep the change independently reversible.

**Non-Goals:**

- Do not add or adopt Pi 1.0.1 APIs that xpi-memo does not use, including MCP, codemode, virtual models, or tool renderer APIs.
- Do not upgrade `typebox` beyond the version required by Pi `1.0.1`.
- Do not change T1/L0 behavior, storage layout, user-level configuration, or mental-model synthesis semantics.
- Do not fix the existing `mental-model-runner` timeout/signal composition issue in this change.
- Do not start a development server or use the user's reserved `8010` port for verification.

## Decisions

### 1. Upgrade the Pi runtime as one dependency set

Update the direct Pi package and align its Pi-related dependency family to `1.0.1`, then regenerate the lockfile under the repository's pnpm policy. Keep `typebox@1.3.27` because Pi `1.0.1` declares that compatible version.

**Alternative considered:** Upgrade only `pi-coding-agent`. Rejected because it would leave the lockfile with mixed Pi runtime generations and make the physical `pi-tui` topology less predictable.

### 2. Make `pi-tui` resolution explicit and singular

Use an explicit package declaration only if required by the extension's direct imports and package ownership, then inspect the resulting tree with `pnpm why @earendil-works/pi-tui` and the installed filesystem. The acceptance condition is one physical `1.0.1` copy, not merely a matching semver range.

**Alternative considered:** Continue relying on an implicit optional peer. Rejected because the current lockfile already demonstrates that this can leave an undeclared direct-resolution entry and duplicate physical versions.

### 3. Adapt test contexts at the tool boundary

Update the two failing integration-test helpers to use the installed Pi `ExtensionToolContext` type or a narrow test helper type that supplies `tools` and `executeTool`. Keep command and lifecycle contexts as `ExtensionContext`; only registered-tool execution receives the stricter context.

**Alternative considered:** Cast every test call through `unknown`. Rejected because it hides an API contract change and would allow incomplete contexts to pass type checking without proving the new runtime boundary.

### 4. Treat TUI behavior as a runtime acceptance gate

Run isolated Pi smoke coverage for both regular and fullscreen modes, including overlays, keyboard input, focus restoration, Glimpse unavailability, and terminal fallback. Do not infer this behavior from TypeScript compilation.

**Alternative considered:** Force the old TUI default in configuration without testing fullscreen. Rejected because it would mask the runtime change and leave the supported default unverified.

### 5. Keep rollback at the dependency-change boundary

The implementation must be revertible as one change: manifest edits, workspace release-age policy, lockfile, and test-context updates. Verification failure blocks acceptance and must not be repaired by changing unrelated memory or projection behavior.

## Risks / Trade-offs

- **[Risk] Pi fullscreen default exposes overlay sizing, focus, or terminal fallback regressions.** → Mitigation: make regular/fullscreen and fallback smoke checks mandatory before acceptance.
- **[Risk] The test helper may provide an incomplete `ExtensionToolContext`.** → Mitigation: type the helper against the installed Pi API and provide explicit `tools`/`executeTool` behavior required by the call path.
- **[Risk] pnpm release-age policy blocks freshly released Pi packages.** → Mitigation: update only the relevant `1.0.1` Pi package exclusions and verify frozen installation.
- **[Risk] A semver-aligned tree still contains duplicate physical packages.** → Mitigation: use both `pnpm why` and physical installation inspection for `pi-tui` and `typebox`.
- **[Risk] An upgrade hides an unrelated timeout bug.** → Mitigation: keep `mental-model-runner` signal/timeout repair outside this change and track it separately.

## Migration Plan

1. Apply manifest and workspace policy changes, regenerate the lockfile, and adapt the two tool-execution test helpers.
2. Run typecheck, changed-path Biome checks, relevant tests, full tests, frozen-install verification, and dependency singleton checks.
3. Run isolated real-Pi smoke coverage for regular/fullscreen TUI and fallback behavior.
4. Accept the upgrade only when all required checks pass.
5. Roll back by reverting the change's manifest, workspace, lockfile, and test-context edits together; no data migration is required.

## Open Questions

None. Remaining runtime observations are verification results, not design decisions.
