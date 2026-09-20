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
/** The settings pane's field-explanation rows and their container. */
const DETAIL_LINE_RULE = /\.detail-line \{[^}]*\}/;
const SETTINGS_DETAIL_RULE = /\.settings-detail \{[^}]*\}/;
/** A fixed height on that container, which `min-height` must have replaced. */
const FIXED_DETAIL_HEIGHT = /[^-]height: 72px/;
/** The window shell and the flexible body under it. */
const WINDOW_RULE = /\.window \{[^}]*\}/;
const APP_BODY_RULE = /\.app-body \{[^}]*\}/;
/** The launch geometry, which the stylesheet must no longer hardcode. */
const LAUNCH_WIDTH_PX = /\b800px/;
const LAUNCH_HEIGHT_PX = /\b600px/;

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
    // The settings rows' own editors. Without this rule a select would render
    // at the browser's default width and size inside a 180px grid column.
    expect(ALL_STYLES).toContain(".f-control");
  });

  it("fills the host window instead of holding a fixed size", () => {
    // The Glimpse window is resizable, so an inner 800x600 left every enlarged
    // pixel empty. The launch size is `glimpse/window.ts`'s WINDOW_WIDTH and
    // WINDOW_HEIGHT; the stylesheet's job is to fill whatever it is given.
    const shell = BASE_STYLES.match(WINDOW_RULE)?.[0] ?? "";
    expect(shell).toContain("width: 100%");
    expect(shell).toContain("height: 100vh");
    expect(shell).not.toMatch(LAUNCH_WIDTH_PX);
    expect(shell).not.toMatch(LAUNCH_HEIGHT_PX);
    // The chrome keeps its documented heights; the body takes what is left, and
    // `min-height: 0` is what lets it actually shrink.
    expect(BASE_STYLES).toContain("--h-header: 56px");
    expect(BASE_STYLES).toContain("--h-footer: 44px");
    expect(BASE_STYLES).toContain("--w-sidebar: 180px");
    const body = BASE_STYLES.match(APP_BODY_RULE)?.[0] ?? "";
    expect(body).toContain("flex: 1 1 auto");
    expect(body).toContain("min-height: 0");
  });

  it("keeps the hidden attribute authoritative over explicit display", () => {
    // Empty states rely on `hidden`; a class-level `display: flex` would win
    // over the UA rule at equal specificity.
    expect(BASE_STYLES).toMatch(HIDDEN_OVERRIDE_PATTERN);
  });

  it("lets the settings detail wrap instead of clipping it", () => {
    // This pane exists to explain the focused field. `nowrap` plus an ellipsis
    // turns a full Chinese sentence into a clipped one, and a fixed 72px box
    // clipped it again; both are what the panel looked like in use.
    const line = SETTINGS_VIEW_STYLES.match(DETAIL_LINE_RULE)?.[0] ?? "";
    expect(line).toContain("overflow-wrap: anywhere");
    expect(line).not.toContain("white-space: nowrap");
    expect(line).not.toContain("text-overflow: ellipsis");

    const detail = SETTINGS_VIEW_STYLES.match(SETTINGS_DETAIL_RULE)?.[0] ?? "";
    expect(detail).toContain("min-height: 72px");
    expect(detail).not.toMatch(FIXED_DETAIL_HEIGHT);
  });

  it("honors reduced motion", () => {
    expect(ALL_STYLES).toContain("prefers-reduced-motion");
  });
});
