## Why

xpi-memo already captures and stores memory, but the product still under-delivers when users cannot easily see what was remembered, why it was kept, and how the system decided to keep it. This change closes the gap between raw memory machinery and user trust by making memory state observable, memory capture more reliable, and recall quality more legible.

## What Changes

- Add a human-readable memory observability layer that exposes scope, trust, lifecycle state, and provenance in user-facing status surfaces.
- Add a memory activation loop that captures explicit user memory intent deterministically and can optionally enrich it through a gated offline extraction path.
- Add candidate digests and startup reminders so pending memory does not disappear into an invisible queue.
- Improve recall quality with standing/contextual separation, query-intent weighting, recency, diversity, and budgeted injection.
- Preserve xpi-memo branding in memory-facing surfaces and document any borrowed ideas or copied permissive code separately from product naming.
- Keep the existing memory engine, storage engine, and Pi UI runtime choices intact.

## Capabilities

### New Capabilities
- `memory-observability`: human-readable memory labels, lifecycle visibility, provenance summaries, and diagnostic counts.
- `memory-activation-loop`: explicit capture, gated offline extraction, candidate digesting, and recall ranking behavior.

### Modified Capabilities
- None.

## Impact

- User-facing memory state in `src/status.ts`, `src/doctor.ts`, `src/console.ts`, and `src/status-panel.ts`.
- Capture and recall flow in `src/index.ts`, `src/candidate-lifecycle.ts`, and `src/recall.ts`.
- Documentation updates in README, guide, troubleshooting, and attribution files.
- Planning alignment with `xpi-memo-ui-visual-layer`, which will render the observability outputs but does not define them.