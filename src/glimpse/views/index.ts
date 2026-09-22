import type { PanelLanguage } from "../../panel-text.js";
import type { PendingCandidate } from "../../pending-candidate.js";
import type { MemoryStatus } from "../../status.js";
import { summarize } from "../../status-summary.js";
import type { GlimpseDocumentParts, PanelTheme, ViewId } from "../document.js";
import type { ThemePrinciple } from "../tokens.js";
import { renderFooter, renderHeader, renderSidebar } from "./chrome.js";
import { type PendingNotice, renderPendingView } from "./pending.js";
import { renderRecentView } from "./recent.js";
import { renderSettingsView, type SettingsRowLike } from "./settings.js";
import { renderStatusView } from "./status.js";
import { renderTriggersView } from "./triggers.js";

/**
 * Assembles the window's parts from one model.
 *
 * The input shape is structural rather than `ConsoleViewModel` itself, so the
 * views stay testable with plain objects and this module does not need to import
 * the console (which imports the window to open it).
 *
 * The status summary is derived here via `summarize(statusJson)` — the same call
 * the terminal panel makes — rather than accepted from the caller. That is what
 * makes "both surfaces show the same counts" true by construction instead of by
 * convention: there is one derivation, and both surfaces read its output.
 */
export interface GlimpseModel {
  language: PanelLanguage;
  /** Injected so every view is deterministic in tests. */
  now: number;
  pending: readonly PendingCandidate[];
  /** The panel's field rows, in `SETTINGS_GROUPS` order. */
  rows: readonly SettingsRowLike[];
  status: MemoryStatus;
  statusJson: string;
}

export interface AssembleOptions {
  initialView: ViewId;
  /** The decision the window just applied; the pending view renders its label. */
  notice?: PendingNotice;
  principle: ThemePrinciple;
  /** Which pending candidate starts selected. */
  selectedIndex?: number;
  theme: PanelTheme;
}

export function assembleParts(
  model: GlimpseModel,
  options: AssembleOptions,
): GlimpseDocumentParts {
  const { language, now, pending, rows, status, statusJson } = model;
  const summary = summarize(statusJson);
  const chrome = {
    activeView: options.initialView,
    language,
    principle: options.principle,
    summary,
    theme: options.theme,
  };

  return {
    footer: renderFooter(chrome),
    header: renderHeader(chrome),
    sidebar: renderSidebar(chrome),
    views: {
      pending: renderPendingView({
        candidates: pending,
        language,
        ...(options.notice === undefined
          ? {}
          : {
              notice: options.notice,
            }),
        now,
        selectedIndex: options.selectedIndex ?? 0,
      }),
      recent: renderRecentView({
        language,
        status,
      }),
      settings: renderSettingsView({
        language,
        rows,
      }),
      status: renderStatusView({
        language,
        now,
        status,
        statusJson,
      }),
      triggers: renderTriggersView({
        language,
        rows,
      }),
    },
  };
}
