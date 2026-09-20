/**
 * Theme tokens for the Glimpse panel window.
 *
 * Source of truth is `THEMES.md`. This module is a runtime copy, not a second
 * source: `tokens.test.ts` parses `THEMES.md` and fails if the two diverge, so
 * the "no literal colors outside the theme" rule has an executable check
 * instead of resting on convention.
 *
 * Scope rule (mechanical, no curation): the token set is exactly the variables
 * declared in BOTH `:root` and `.dark` of `THEMES.md`. Tailwind-only variables
 * such as `--tracking-normal` and `--spacing` appear in `:root` alone and are
 * therefore out of scope — they are not part of the theme's two-theme contract.
 *
 * Keys are bare (no leading `--`), so a token is referenced as `--${name}` in
 * CSS and `tokens[name]` in TypeScript.
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

/** Selector carrying the light theme; also the pre-`.dark` default. */
export const LIGHT_SELECTOR = ":root";
/** Selector carrying the dark theme. */
export const DARK_SELECTOR = ".dark";

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
 * Both theme blocks as one CSS chunk. Emitted verbatim into the window document;
 * the dark block wins when `<html>` carries the `dark` class, matching how
 * `THEMES.md` defines its `@custom-variant dark`.
 */
export function themeTokensCss(): string {
  return `${renderBlock(LIGHT_SELECTOR, LIGHT_TOKENS)}\n\n${renderBlock(DARK_SELECTOR, DARK_TOKENS)}`;
}
