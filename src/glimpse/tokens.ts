/**
 * Theme tokens for the Glimpse panel window.
 *
 * Source of truth is `THEMES.md`. This module is a runtime copy, not a second
 * source: `tokens.test.ts` parses `THEMES.md` and fails if the two diverge, so
 * the "no literal colors outside the theme" rule has an executable check
 * instead of resting on convention.
 * Two theme principles, each with a light and a dark block (the contract table
 * is in `THEMES.md`):
 *
 *   default   `:root`      `.dark`
 *   atlas     `.atlas`     `.atlas.dark`
 *
 * The default pair is complete and carries the same names in both blocks, so its
 * token set needs no curation: it is the intersection. Atlas is authored as a
 * re-skin — a complete light block plus a color-only dark override — and this
 * module resolves that override against the light block, because the panel
 * contract requires light and dark to use the same token names. So both blocks
 * of a principle are self-contained: the square corners, the flat shadows and the
 * CJK faces survive a variant switch by being declared, not by `.atlas` still
 * matching. `tokens.test.ts` pins both halves: the dark override is a subset of
 * the light block, and the emitted pair declares the same names.
 *
 * `--spacing` and `--tracking-normal` are Tailwind build-time variables with no
 * meaning in this stylesheet, so both principles drop them.
 *
 * Keys are bare (no leading `--`), so a token is referenced as `--${name}` in
 * CSS and `THEME_TOKEN_SETS[principle].light[name]` in TypeScript.
 */

/** Documented default theme (`TUI-DESIGN.md` §2.A). */
export const LIGHT_TOKENS: Record<string, string> = {
  accent: "oklch(0.9245 0.0138 92.9892)",
  "accent-foreground": "oklch(0.2671 0.0196 98.9390)",
  background: "oklch(0.9818 0.0054 95.0986)",
  border: "oklch(0.8847 0.0069 97.3627)",
  card: "oklch(0.9818 0.0054 95.0986)",
  "card-foreground": "oklch(0.1908 0.0020 106.5859)",
  "chart-1": "oklch(0.5583 0.1276 42.9956)",
  "chart-2": "oklch(0.6898 0.1581 290.4107)",
  "chart-3": "oklch(0.8816 0.0276 93.1280)",
  "chart-4": "oklch(0.8822 0.0403 298.1792)",
  "chart-5": "oklch(0.5608 0.1348 42.0584)",
  destructive: "oklch(0.1908 0.0020 106.5859)",
  "destructive-foreground": "oklch(1.0000 0 0)",
  "font-mono": "JetBrains Mono, ui-monospace, monospace",
  "font-sans": "Inter, ui-sans-serif, sans-serif, system-ui",
  "font-serif": "Noto Serif, ui-serif, serif",
  foreground: "oklch(0.3438 0.0269 95.7226)",
  input: "oklch(0.7621 0.0156 98.3528)",
  muted: "oklch(0.9341 0.0153 90.2390)",
  "muted-foreground": "oklch(0.6059 0.0075 97.4233)",
  popover: "oklch(1.0000 0 0)",
  "popover-foreground": "oklch(0.2671 0.0196 98.9390)",
  primary: "oklch(0.6171 0.1375 39.0427)",
  "primary-foreground": "oklch(1.0000 0 0)",
  radius: "0.5rem",
  ring: "oklch(0.6171 0.1375 39.0427)",
  secondary: "oklch(0.9245 0.0138 92.9892)",
  "secondary-foreground": "oklch(0.4334 0.0177 98.6048)",
  shadow: "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10)",
  "shadow-2xl": "0 1px 3px 0px hsl(0 0% 0% / 0.25)",
  "shadow-2xs": "0 1px 3px 0px hsl(0 0% 0% / 0.05)",
  "shadow-blur": "3px",
  "shadow-color": "oklch(0 0 0)",
  "shadow-lg": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 4px 6px -1px hsl(0 0% 0% / 0.10)",
  "shadow-md": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 2px 4px -1px hsl(0 0% 0% / 0.10)",
  "shadow-opacity": "0.1",
  "shadow-sm": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10)",
  "shadow-spread": "0px",
  "shadow-x": "0",
  "shadow-xl": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 8px 10px -1px hsl(0 0% 0% / 0.10)",
  "shadow-xs": "0 1px 3px 0px hsl(0 0% 0% / 0.05)",
  "shadow-y": "1px",
  sidebar: "oklch(0.9663 0.0080 98.8792)",
  "sidebar-accent": "oklch(0.9245 0.0138 92.9892)",
  "sidebar-accent-foreground": "oklch(0.3250 0 0)",
  "sidebar-border": "oklch(0.9401 0 0)",
  "sidebar-foreground": "oklch(0.3590 0.0051 106.6524)",
  "sidebar-primary": "oklch(0.6171 0.1375 39.0427)",
  "sidebar-primary-foreground": "oklch(0.9881 0 0)",
  "sidebar-ring": "oklch(0.7731 0 0)",
};

export const DARK_TOKENS: Record<string, string> = {
  accent: "oklch(0.2130 0.0078 95.4245)",
  "accent-foreground": "oklch(0.9663 0.0080 98.8792)",
  background: "oklch(0.2679 0.0036 106.6427)",
  border: "oklch(0.3618 0.0101 106.8928)",
  card: "oklch(0.2679 0.0036 106.6427)",
  "card-foreground": "oklch(0.9818 0.0054 95.0986)",
  "chart-1": "oklch(0.5583 0.1276 42.9956)",
  "chart-2": "oklch(0.6898 0.1581 290.4107)",
  "chart-3": "oklch(0.2130 0.0078 95.4245)",
  "chart-4": "oklch(0.3074 0.0516 289.3230)",
  "chart-5": "oklch(0.5608 0.1348 42.0584)",
  destructive: "oklch(0.6368 0.2078 25.3313)",
  "destructive-foreground": "oklch(1.0000 0 0)",
  "font-mono": "JetBrains Mono, ui-monospace, monospace",
  "font-sans": "Inter, ui-sans-serif, sans-serif, system-ui",
  "font-serif": "Noto Serif, ui-serif, serif",
  foreground: "oklch(0.8074 0.0142 93.0137)",
  input: "oklch(0.4336 0.0113 100.2195)",
  muted: "oklch(0.2213 0.0038 106.7070)",
  "muted-foreground": "oklch(0.7713 0.0169 99.0657)",
  popover: "oklch(0.3085 0.0035 106.6039)",
  "popover-foreground": "oklch(0.9211 0.0040 106.4781)",
  primary: "oklch(0.6724 0.1308 38.7559)",
  "primary-foreground": "oklch(1.0000 0 0)",
  radius: "0.5rem",
  ring: "oklch(0.6724 0.1308 38.7559)",
  secondary: "oklch(0.9818 0.0054 95.0986)",
  "secondary-foreground": "oklch(0.3085 0.0035 106.6039)",
  shadow: "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10)",
  "shadow-2xl": "0 1px 3px 0px hsl(0 0% 0% / 0.25)",
  "shadow-2xs": "0 1px 3px 0px hsl(0 0% 0% / 0.05)",
  "shadow-blur": "3px",
  "shadow-color": "oklch(0 0 0)",
  "shadow-lg": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 4px 6px -1px hsl(0 0% 0% / 0.10)",
  "shadow-md": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 2px 4px -1px hsl(0 0% 0% / 0.10)",
  "shadow-opacity": "0.1",
  "shadow-sm": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10)",
  "shadow-spread": "0px",
  "shadow-x": "0",
  "shadow-xl": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 8px 10px -1px hsl(0 0% 0% / 0.10)",
  "shadow-xs": "0 1px 3px 0px hsl(0 0% 0% / 0.05)",
  "shadow-y": "1px",
  sidebar: "oklch(0.2357 0.0024 67.7077)",
  "sidebar-accent": "oklch(0.1680 0.0020 106.6177)",
  "sidebar-accent-foreground": "oklch(0.8074 0.0142 93.0137)",
  "sidebar-border": "oklch(0.9401 0 0)",
  "sidebar-foreground": "oklch(0.8074 0.0142 93.0137)",
  "sidebar-primary": "oklch(0.3250 0 0)",
  "sidebar-primary-foreground": "oklch(0.9881 0 0)",
  "sidebar-ring": "oklch(0.7731 0 0)",
};

/** The atlas principle's complete light block (`THEMES.md` `## Atlas-Themes`). */
export const ATLAS_LIGHT_TOKENS: Record<string, string> = {
  accent: "oklch(0.6769 0.1554 56.7868)",
  "accent-foreground": "oklch(0.9808 0.0199 84.5897)",
  background: "oklch(0.9442 0.0184 86.1479)",
  border: "oklch(0.3693 0.0605 248.2026)",
  card: "oklch(0.9618 0.0168 87.9987)",
  "card-foreground": "oklch(0.3398 0.0652 248.9571)",
  "chart-1": "oklch(0.3058 0.0641 249.4045)",
  "chart-2": "oklch(0.6769 0.1554 56.7868)",
  "chart-3": "oklch(0.6528 0.047 248.5505)",
  "chart-4": "oklch(0.7887 0.0592 89.6434)",
  "chart-5": "oklch(0.5156 0.155 30.0196)",
  destructive: "oklch(0.5156 0.155 30.0196)",
  "destructive-foreground": "oklch(0.9808 0.0199 84.5897)",
  "font-display": '"Oswald", "Arial Narrow", "Noto Sans SC", sans-serif',
  "font-mono": '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
  "font-sans": '"Noto Sans SC", "PingFang SC", ui-sans-serif, system-ui, sans-serif',
  "font-serif": '"Noto Serif SC", "Songti SC", Georgia, ui-serif, serif',
  foreground: "oklch(0.3398 0.0652 248.9571)",
  "grid-line": "oklch(0.8863 0.0282 88.761)",
  input: "oklch(0.4905 0.0446 241.8758)",
  muted: "oklch(0.9195 0.0252 89.2183)",
  "muted-foreground": "oklch(0.5243 0.019 91.6812)",
  popover: "oklch(0.9732 0.0151 90.2337)",
  "popover-foreground": "oklch(0.3398 0.0652 248.9571)",
  primary: "oklch(0.3058 0.0641 249.4045)",
  "primary-foreground": "oklch(0.9585 0.018 89.3579)",
  radius: "0rem",
  ring: "oklch(0.6769 0.1554 56.7868)",
  secondary: "oklch(0.9016 0.0281 88.7586)",
  "secondary-foreground": "oklch(0.3398 0.0652 248.9571)",
  shadow: "none",
  "shadow-2xl": "none",
  "shadow-2xs": "none",
  "shadow-blur": "0",
  "shadow-color": "oklch(0.3058 0.0641 249.4045)",
  "shadow-lg": "none",
  "shadow-md": "none",
  "shadow-opacity": "0",
  "shadow-sm": "none",
  "shadow-spread": "0px",
  "shadow-x": "0",
  "shadow-xl": "none",
  "shadow-xs": "none",
  "shadow-y": "0",
  sidebar: "oklch(0.3058 0.0641 249.4045)",
  "sidebar-accent": "oklch(0.3558 0.0676 250.2684)",
  "sidebar-accent-foreground": "oklch(0.9442 0.0184 86.1479)",
  "sidebar-border": "oklch(0.3976 0.0609 246.4672)",
  "sidebar-foreground": "oklch(0.9442 0.0184 86.1479)",
  "sidebar-primary": "oklch(0.6769 0.1554 56.7868)",
  "sidebar-primary-foreground": "oklch(0.9808 0.0199 84.5897)",
  "sidebar-ring": "oklch(0.6769 0.1554 56.7868)",
  track: "oklch(0.8706 0.0172 88.0085)",
};

/**
 * The atlas principle's dark declarations, exactly as `THEMES.md` writes them:
 * colors only.
 *
 * Atlas is a re-skin, so its `.dark` block overrides the palette and leaves the
 * fonts, the square corners and the flat shadows to `.atlas`. `tokens.test.ts`
 * pins that every name here also exists in the light block — a name declared
 * only in the dark block would come back as a default-theme value in the light
 * variant.
 */
const ATLAS_DARK_OVERRIDES: Record<string, string> = {
  accent: "oklch(0.6459 0.1377 62.2708)",
  "accent-foreground": "oklch(0.2718 0.0488 252.0843)",
  background: "oklch(0.2539 0.0467 249.0998)",
  border: "oklch(0.3998 0.0624 249.6356)",
  card: "oklch(0.2866 0.0536 250.2057)",
  "card-foreground": "oklch(0.9278 0.0248 91.6213)",
  "chart-1": "oklch(0.7548 0.0635 246.4807)",
  "chart-2": "oklch(0.7102 0.1389 59.4035)",
  "chart-3": "oklch(0.6157 0.0483 247.5984)",
  "chart-4": "oklch(0.7887 0.0592 89.6434)",
  "chart-5": "oklch(0.6627 0.135 30.5788)",
  destructive: "oklch(0.6627 0.135 30.5788)",
  "destructive-foreground": "oklch(0.1963 0.0301 34.021)",
  foreground: "oklch(0.9102 0.0265 90.1074)",
  "grid-line": "oklch(0.3221 0.0582 250.883)",
  input: "oklch(0.4501 0.061 249.3183)",
  muted: "oklch(0.3163 0.0609 253.3487)",
  "muted-foreground": "oklch(0.7383 0.0248 90.8045)",
  popover: "oklch(0.3095 0.0576 249.3827)",
  "popover-foreground": "oklch(0.9278 0.0248 91.6213)",
  primary: "oklch(0.7102 0.1389 59.4035)",
  "primary-foreground": "oklch(0.2718 0.0488 252.0843)",
  ring: "oklch(0.7102 0.1389 59.4035)",
  secondary: "oklch(0.3412 0.0616 250.8275)",
  "secondary-foreground": "oklch(0.9102 0.0265 90.1074)",
  sidebar: "oklch(0.2347 0.0462 251.4574)",
  "sidebar-accent": "oklch(0.3412 0.0616 250.8275)",
  "sidebar-accent-foreground": "oklch(0.9102 0.0265 90.1074)",
  "sidebar-border": "oklch(0.3871 0.0749 252.0744)",
  "sidebar-foreground": "oklch(0.9102 0.0265 90.1074)",
  "sidebar-primary": "oklch(0.7102 0.1389 59.4035)",
  "sidebar-primary-foreground": "oklch(0.2718 0.0488 252.0843)",
  "sidebar-ring": "oklch(0.7102 0.1389 59.4035)",
  track: "oklch(0.3567 0.0626 251.4689)",
};

/**
 * The atlas principle's dark set as the window emits it: the light block with the
 * authored dark declarations layered on top.
 *
 * Resolving the override here rather than leaning on `.atlas` retaining them is
 * what satisfies the panel contract's "light and dark use the same token names":
 * each emitted block is self-contained, so a variant switch cannot leave a name
 * resolving only because the other class happened to match.
 */
export const ATLAS_DARK_TOKENS: Record<string, string> = {
  ...ATLAS_LIGHT_TOKENS,
  ...ATLAS_DARK_OVERRIDES,
};
/** Selector carrying the default principle's light theme; the pre-`.dark` default. */
export const LIGHT_SELECTOR = ":root";
/** Selector carrying the default principle's dark theme. */
export const DARK_SELECTOR = ".dark";
/** Selector carrying the atlas principle's light theme. */
export const ATLAS_SELECTOR = ".atlas";
/** Selector carrying the atlas principle's dark theme. */
export const ATLAS_DARK_SELECTOR = ".atlas.dark";

/** The two theme principles the header can switch between. */
export type ThemePrinciple = "atlas" | "default";

export const THEME_PRINCIPLES: readonly ThemePrinciple[] = [
  "default",
  "atlas",
];

export interface ThemeTokenSet {
  /** Overrides applied on top of `light` when the `dark` class is present. */
  dark: Record<string, string>;
  /** Selector for the dark variant. */
  darkSelector: string;
  /** The principle's complete set, and the variant it starts in. */
  light: Record<string, string>;
  /** Selector for the light variant. */
  lightSelector: string;
}

/** The four token blocks, keyed by principle. */
export const THEME_TOKEN_SETS: Record<ThemePrinciple, ThemeTokenSet> = {
  atlas: {
    dark: ATLAS_DARK_TOKENS,
    darkSelector: ATLAS_DARK_SELECTOR,
    light: ATLAS_LIGHT_TOKENS,
    lightSelector: ATLAS_SELECTOR,
  },
  default: {
    dark: DARK_TOKENS,
    darkSelector: DARK_SELECTOR,
    light: LIGHT_TOKENS,
    lightSelector: LIGHT_SELECTOR,
  },
};

/** Plain ASCII ordering, so the emitted CSS is stable across locales. */
function compareTokenNames(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function renderBlock(selector: string, tokens: Record<string, string>): string {
  const declarations = Object.keys(tokens)
    .sort(compareTokenNames)
    .map((name) => `  --${name}: ${tokens[name]};`)
    .join("\n");
  return `${selector} {\n${declarations}\n}`;
}

/**
 * Every principle's two blocks as one CSS chunk, emitted verbatim into the
 * window document.
 *
 * Order carries meaning: a later block of equal specificity wins. `.dark` has
 * to follow `:root`, and `.atlas` has to follow `.dark` so the atlas re-skin is
 * not overwritten by the default colors under `class="atlas"` alone. Under
 * `class="atlas dark"` the composed `.atlas.dark` (0,2,0) outranks the plain
 * class selectors wherever the two meet, so the atlas dark colors win without
 * relying on source order.
 */
export function themeTokensCss(): string {
  return THEME_PRINCIPLES.map((principle) => {
    const set = THEME_TOKEN_SETS[principle];
    return [
      renderBlock(set.lightSelector, set.light),
      renderBlock(set.darkSelector, set.dark),
    ].join("\n\n");
  }).join("\n\n");
}
