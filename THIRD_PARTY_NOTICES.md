# Third-Party Notices

_Last audited: 2026-09-02 (xpi-memo v1.0.0, memory-observability change task 7.3)_

## Audit conclusion

This audit covers `src/`, `skills/`, and the dependency tree as of the commit
above. **No permissively-licensed source code has been copied into this
repository.** The implementation is original: interfaces, data models, and
algorithms were written independently.

Evidence:

- No copied-code markers (`copied from`, `adapted from`, `port of`,
  `vendor`-style annotations, upstream file references) exist in `src/` or
  `skills/`.
- No upstream source file from any referenced project is present in the tree.
- No GPL / AGPL / LGPL license text appears in the dependency tree
  (`pnpm-lock.yaml` contains no license-bearing GPL terms) and no GPL source
  has been copied.

This notice will be extended with a full `{source URL, version/commit, copied
files/functions, license text, copyright, local modifications}` entry if and
when permissively-licensed code is ever copied.

## Inspiration-only references (no code copied)

These projects informed design and behavior; their names appear only in
attribution and internal comments, never as runtime API names:

| Project | License | Relationship |
| --- | --- | --- |
| [mnemopi](https://github.com/can1357/oh-my-pi/tree/main/packages/mnemopi) (Oh My Pi) | MIT | Inspiration: automatic recall/retain lifecycle, query-intent weighting, ranking. No code copied. |
| [pi-memory](https://github.com/jayzeng/pi-memory) | MIT | Inspiration: low-friction capture, Markdown views, handoff/snapshot patterns. No code copied. |
| [pi-interview-tool](https://github.com/earendil-works/pi-interview-tool) | MIT | Design vocabulary for the UI layer only; not a runtime dependency. |
| [glimpseui](https://github.com/earendil-works/glimpseui) | MIT | Optional rich display layer resolved at runtime when installed; the TUI remains the primary surface. |

## Runtime / peer dependencies

All runtime peer dependencies are MIT-licensed:

| Package | License |
| --- | --- |
| `@earendil-works/pi-coding-agent` | MIT |
| `@earendil-works/pi-tui` | MIT |
| `typebox` | MIT |

Development-only dependencies (`@biomejs/biome` MIT OR Apache-2.0, Vitest MIT,
TypeScript Apache-2.0) ship no code into the extension; Pi loads `src/index.ts`
directly with no build step.
