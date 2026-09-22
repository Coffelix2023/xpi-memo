import type { PanelLanguage } from "../panel-text.js";
import { CLIENT_SCRIPT } from "./client.js";
import { BASE_STYLES } from "./styles/base.js";
import { CHROME_STYLES } from "./styles/chrome.js";
import { COMPONENT_STYLES } from "./styles/components.js";
import { PENDING_VIEW_STYLES } from "./styles/views/pending.js";
import { RECENT_VIEW_STYLES } from "./styles/views/recent.js";
import { SETTINGS_VIEW_STYLES } from "./styles/views/settings.js";
import { STATUS_VIEW_STYLES } from "./styles/views/status.js";
import { TRIGGERS_VIEW_STYLES } from "./styles/views/triggers.js";
import {
  ATLAS_DARK_TOKENS,
  ATLAS_LIGHT_TOKENS,
  ATLAS_SELECTOR,
  DARK_SELECTOR,
  DARK_TOKENS,
  LIGHT_TOKENS,
  type ThemePrinciple,
  themeTokensCss,
} from "./tokens.js";

/** The four views, in sidebar order. */
export type ViewId = "pending" | "recent" | "settings" | "status" | "triggers";

export const VIEW_IDS: readonly ViewId[] = [
  "pending",
  "recent",
  "settings",
  "status",
  "triggers",
];

/** Hash route per view; the in-page client matches on these. */
export const VIEW_ROUTES: Record<ViewId, string> = {
  pending: "#/pending",
  recent: "#/recent",
  settings: "#/settings",
  status: "#/status",
  triggers: "#/triggers",
};

export type PanelTheme = "dark" | "light";

/** Pre-rendered fragments; this module only decides where they go. */
export interface GlimpseDocumentParts {
  /** The `.app-footer` element. */
  footer: string;
  /** The `.app-header` element. */
  header: string;
  /** The `.app-sidebar` element. */
  sidebar: string;
  /** Inner HTML per view; wrapped in a `.tabpage` container here. */
  views: Record<ViewId, string>;
}

export interface GlimpseDocumentInput extends GlimpseDocumentParts {
  initialView: ViewId;
  language: PanelLanguage;
  /** Which token set the window wears (`THEMES.md`). */
  principle: ThemePrinciple;
  /** Which variant of that set: the `dark` class, or not. */
  theme: PanelTheme;
}

/**
 * Style order matters: tokens define the variables, base resets and lays out
 * the window, chrome and components dress the persistent parts, and the view
 * modules come last so a view can override a shared rule.
 */
const STYLE_MODULES = [
  themeTokensCss(),
  BASE_STYLES,
  CHROME_STYLES,
  COMPONENT_STYLES,
  STATUS_VIEW_STYLES,
  SETTINGS_VIEW_STYLES,
  RECENT_VIEW_STYLES,
  PENDING_VIEW_STYLES,
  TRIGGERS_VIEW_STYLES,
];

function viewSection(view: ViewId, initialView: ViewId, body: string): string {
  const active = view === initialView;
  return [
    `<section class="tabpage${active ? " is-active" : ""}"`,
    ` data-route="${VIEW_ROUTES[view]}" data-page="${view}"`,
    ` aria-label="${view}"${active ? "" : " hidden"}>`,
    body,
    "</section>",
  ].join("");
}

/**
 * The class list for `<html>`: the principle's class, then `dark`.
 *
 * Both are plain classes so one attribute answers either question, and the
 * composed `.atlas.dark` (0,2,0) outranks `.dark` on its own. The names come
 * from `tokens.ts`'s selectors, minus the leading dot, so a renamed selector
 * cannot leave this file pointing at a class the stylesheet does not define.
 */
/**
 * The default principle adds no class: its tokens are declared on `:root`, so
 * `class=""` already means "default light" and `class="dark"` "default dark".
 */
const DEFAULT_PRINCIPLE_CLASS = "";

function htmlClasses(principle: ThemePrinciple, theme: PanelTheme): string {
  const principleClass =
    principle === "atlas" ? ATLAS_SELECTOR.slice(1) : DEFAULT_PRINCIPLE_CLASS;
  return [
    principleClass,
    theme === "dark" ? DARK_SELECTOR.slice(1) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * The whole window document.
 *
 * There is no first-frame theme script: the theme principle and variant are
 * resolved in Node before this document exists and are baked into the `class`
 * attribute below, so the first painted frame has the right pair. The prototype
 * needed a script only because it kept preferences in page storage.
 */
export function renderDocument(input: GlimpseDocumentInput): string {
  const classes = htmlClasses(input.principle, input.theme);
  const views = VIEW_IDS.map((view) =>
    viewSection(view, input.initialView, input.views[view]),
  ).join("\n");

  return [
    "<!DOCTYPE html>",
    `<html class="${classes}" lang="${input.language}">`,
    "<head>",
    '<meta charset="utf-8">',
    "<title>XpiMemo T1 Console</title>",
    "<style>",
    ...STYLE_MODULES,
    "</style>",
    "</head>",
    "<body>",
    '<div class="window" id="P0-1-A1" role="application" aria-label="XpiMemo T1 Console">',
    input.header,
    '<div class="app-body">',
    input.sidebar,
    '<main class="app-content">',
    views,
    "</main>",
    "</div>",
    input.footer,
    "</div>",
    "<script>",
    CLIENT_SCRIPT,
    "</script>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

/** Plain ASCII ordering, so the exported list is stable across locales. */
function compareTokenNames(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Every token name any principle declares, for the stylesheet's own checks.
 *
 * A rule that references `var(--x)` with `x` missing here is a rule that reads a
 * variable no theme defines.
 */
export const THEME_TOKEN_NAMES: readonly string[] = [
  ...new Set([
    ...Object.keys(LIGHT_TOKENS),
    ...Object.keys(DARK_TOKENS),
    ...Object.keys(ATLAS_LIGHT_TOKENS),
    ...Object.keys(ATLAS_DARK_TOKENS),
  ]),
].sort(compareTokenNames);
