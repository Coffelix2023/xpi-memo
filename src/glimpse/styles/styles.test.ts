import { describe, expect, it } from "vitest";
import { BASE_STYLES } from "./base.ts";
import { CHROME_STYLES } from "./chrome.ts";
import { COMPONENT_STYLES } from "./components.ts";
import { PENDING_VIEW_STYLES } from "./views/pending.ts";
import { RECENT_VIEW_STYLES } from "./views/recent.ts";
import { SETTINGS_VIEW_STYLES } from "./views/settings.ts";
import { STATUS_VIEW_STYLES } from "./views/status.ts";

const MODULES: ReadonlyArray<
  readonly [
    string,
    string,
  ]
> = [
  [
    "base",
    BASE_STYLES,
  ],
  [
    "chrome",
    CHROME_STYLES,
  ],
  [
    "components",
    COMPONENT_STYLES,
  ],
  [
    "views/status",
    STATUS_VIEW_STYLES,
  ],
  [
    "views/settings",
    SETTINGS_VIEW_STYLES,
  ],
  [
    "views/recent",
    RECENT_VIEW_STYLES,
  ],
  [
    "views/pending",
    PENDING_VIEW_STYLES,
  ],
];

const ALL_STYLES = MODULES.map(([, css]) => css).join("\n");
const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b/;
/** The prototype's demo-only toolbar, which the shipped window must not carry. */
const DEMO_TOOLBAR_PATTERN = /\.tb-btn|\.toolbar/;
/** `[hidden]` winning over an explicit `display` at equal specificity. */
const HIDDEN_OVERRIDE_PATTERN = /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/;

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("glimpse style modules", () => {
  it("every module contributes style", () => {
    for (const [name, css] of MODULES) {
      expect(css.trim().length, name).toBeGreaterThan(0);
    }
  });

  it("has balanced braces in every module", () => {
    // An unbalanced module silently swallows the rules after the break.
    for (const [name, css] of MODULES) {
      expect(count(css, "{"), `${name}: {`).toBe(count(css, "}"));
    }
  });

  it("has no unterminated comment in any module", () => {
    // The prototype shipped a block whose `/*` was missing; the whole block was
    // dropped by the CSS parser and the settings pane overflowed the window.
    // Nothing else in the pipeline notices that, so it is asserted here.
    for (const [name, css] of MODULES) {
      expect(count(css, "/*"), `${name}: /*`).toBe(count(css, "*/"));
    }
  });

  it("introduces no literal color", () => {
    for (const [name, css] of MODULES) {
      expect(css, name).not.toMatch(HEX_COLOR_PATTERN);
    }
  });

  it("contains no backtick, which would terminate the template literal", () => {
    // Each module's CSS is a template literal. A stray backtick — easy to add
    // while writing a comment — closes it early and turns the rest of the
    // stylesheet into a JavaScript syntax error. The failure surfaces as a
    // confusing esbuild message in an unrelated file, so it is asserted here.
    for (const [name, css] of MODULES) {
      expect(css, name).not.toContain("`");
    }
  });

  it("does not carry over the prototype's demo toolbar", () => {
    // `.toolbar` / `.tb-btn` existed only to hand-toggle empty/loading/error in
    // the prototype; the shipped window derives those states from real data.
    expect(ALL_STYLES).not.toMatch(DEMO_TOOLBAR_PATTERN);
  });

  it("keeps the three-state styles the window needs", () => {
    expect(ALL_STYLES).toContain(".empty-state");
    expect(ALL_STYLES).toContain(".skeleton");
    expect(ALL_STYLES).toContain(".error-banner");
  });

  it("pins the window to the documented 800x600 geometry", () => {
    expect(BASE_STYLES).toContain("--win-w: 800px");
    expect(BASE_STYLES).toContain("--win-h: 600px");
    // 56 + 500 + 44 = 600, and 180 + 620 = 800.
    expect(BASE_STYLES).toContain("--h-header: 56px");
    expect(BASE_STYLES).toContain("--h-body: 500px");
    expect(BASE_STYLES).toContain("--h-footer: 44px");
    expect(BASE_STYLES).toContain("--w-sidebar: 180px");
    expect(BASE_STYLES).toContain("--w-content: 620px");
  });

  it("keeps the hidden attribute authoritative over explicit display", () => {
    // Empty states rely on `hidden`; a class-level `display: flex` would win
    // over the UA rule at equal specificity.
    expect(BASE_STYLES).toMatch(HIDDEN_OVERRIDE_PATTERN);
  });

  it("honors reduced motion", () => {
    expect(ALL_STYLES).toContain("prefers-reduced-motion");
  });
});
