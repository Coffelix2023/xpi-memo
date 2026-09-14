## 1. Visual runtime decisions

- [ ] 1.1 Confirm the terminal-first console and rich status surface split in design.md by checking `/xpi-memo` and `/xpi-memo-status` responsibilities, then verify the change scope excludes memory engine behavior.
- [ ] 1.2 Define the canonical UI stack choice in design.md as `pi-tui` primary plus `glimpseui` optional enhancement, and verify the decision is reflected in the proposal and spec.
- [ ] 1.3 Record the non-runtime role of `pi-interview-tool` as design vocabulary only, and verify the proposal explicitly rejects it as a dependency.

## 2. Human-readable memory taxonomy

- [ ] 2.1 Define the user-visible taxonomy labels for stored, pending, and reviewed memories in spec.md, then verify each requirement has an observable scenario.
- [ ] 2.2 Specify how scope, trust, and state must appear in the visual layer, and verify the taxonomy remains deterministic across console and rich status surfaces.
- [ ] 2.3 Document the mapping rules between internal memory kinds and user-facing labels, and verify the spec names the user-visible behavior without implementation details.

## 3. Console and status surface UX

- [ ] 3.1 Specify the terminal console's primary tabs and review affordances in spec.md, then verify Pending, Recent, Settings, and Status remain the core surface.
- [ ] 3.2 Specify the rich status surface behavior for Glimpse and fallback behavior for terminals, then verify the spec requires the same underlying state in both modes.
- [ ] 3.3 Define candidate review actions and their visible outcomes, then verify the proposal and spec both preserve Store / Later / Reject semantics as visible choices.

## 4. Branding and documentation

- [ ] 4.1 Define xpi-memo branding requirements for all user-facing surfaces, then verify the spec states upstream names must not replace the product brand.
- [ ] 4.2 Add documentation requirements for third-party inspiration and permissive code attribution, then verify the proposal and tasks require separate attribution from branding.
- [ ] 4.3 Confirm no implementation code was added during planning and verify the change directory contains only planning artifacts.
