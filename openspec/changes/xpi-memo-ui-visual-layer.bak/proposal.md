## Why

xpi-memo has become a functional memory core, but its value is still easy to miss because the user-facing shell is thin: memory state, review state, and scope are visible only indirectly. This change makes the extension feel like a first-class Pi tool by defining a coherent terminal-first visual layer with an optional rich status surface, so users can see what Agent remembered and why.

## What Changes

- Define a dedicated visual layer for xpi-memo's user-facing surfaces.
- Keep `@earendil-works/pi-tui` as the primary interaction runtime for the console.
- Use `glimpseui` as an optional rich visual layer for status, memory atlas, and diagnostics when available.
- Borrow card, recommendation, and clarification patterns from `pi-interview-tool` as design vocabulary, without making it a runtime dependency.
- Make memory labels and review states human-readable across Pending, Recent, Settings, and Status views.
- Preserve xpi-memo branding in all user-visible surfaces and document third-party inspiration and attribution.

## Capabilities

### New Capabilities
- `ui-visual-layer`: xpi-memo's terminal-first console, rich status surface, candidate review presentation, and human-readable memory taxonomy.

### Modified Capabilities
- None.

## Impact

- User-facing surfaces in `src/console.ts`, `src/status-panel.ts`, and `src/index.ts`.
- Documentation updates in README / guide / TUI design notes.
- Possible package metadata updates if the visual layer introduces or documents optional UI dependencies.
- Third-party attribution / notice documentation for borrowed UI ideas or copied permissive code.