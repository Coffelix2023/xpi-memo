import type { XpiMemoConfig } from "../config.js";
import type { CandidateDecision, ConsoleActions } from "../console.js";
import { settingsSaveValue } from "../console.js";
import type { PanelLanguage } from "../panel-text.js";
import { renderDocument, type ViewId } from "./document.js";
import type { GlimpseModule, GlimpseWindow } from "./module.js";
import {
  loadPanelPreferences,
  type PanelPreferences,
  type PanelTheme,
  savePanelPreferences,
} from "./prefs.js";
import { assembleParts, type GlimpseModel } from "./views/index.js";

/**
 * Opens the `/xpi-memo` window and drives it until it closes.
 *
 * Returns `true` when the window handled the invocation and `false` when the
 * caller should fall back to the terminal panel. Absent Glimpse and broken
 * Glimpse take the same branch on purpose: a user who cannot get a window does
 * not care which of the two happened.
 *
 * Uses `open`, not `prompt`. `prompt` resolves on the first
 * `window.glimpse.send()`, so the first theme toggle would close the window;
 * the panel needs a channel that stays open across many interactions.
 *
 * A language change re-renders the whole document through `setHTML`, because
 * all copy lives in Node — the in-page script owns no strings. The active view
 * and the selected candidate travel back with the message so the re-render
 * lands where the user was.
 */

/** The documented window size (`TUI-DESIGN.md` §1). */
export const WINDOW_WIDTH = 800;
export const WINDOW_HEIGHT = 600;
export const WINDOW_TITLE = "XpiMemo T1 Console";

export interface GlimpsePanelOptions {
  /** The same actions the terminal panel receives. */
  actions: ConsoleActions;
  /**
   * The live configuration. The window needs it to type a write: the panel
   * carries values as strings, and only the config says whether "on" is a
   * boolean or a string.
   */
  config: XpiMemoConfig;
  initialView: ViewId;
  language: PanelLanguage;
  /** Everything the views need except the language, which can change here. */
  model: Omit<GlimpseModel, "language">;
  prefsPath: string;
  /** Injected so tests can substitute the module without touching disk. */
  resolveModule: () => Promise<GlimpseModule | null>;
  title?: string;
}

type PanelMessage =
  | {
      decision: CandidateDecision;
      index: number;
      type: "review";
    }
  | {
      type: "close";
    }
  | {
      id: string;
      type: "setting";
      value: string;
    }
  | {
      type: "language";
      value: PanelLanguage;
      view?: ViewId;
    }
  | {
      type: "theme";
      value: PanelTheme;
    };

const VIEWS: readonly string[] = [
  "pending",
  "recent",
  "settings",
  "status",
];
const THEMES: readonly string[] = [
  "dark",
  "light",
];
const LANGUAGES: readonly string[] = [
  "en",
  "zh",
];
const DECISIONS: readonly string[] = [
  "store",
  "reject",
  "later",
];

function isView(value: unknown): value is ViewId {
  return typeof value === "string" && VIEWS.includes(value);
}

/**
 * Validate one message from the page.
 *
 * The payload crosses a webview boundary, so it is treated as untrusted input
 * rather than assumed to match the protocol: an unrecognised message is dropped
 * instead of reaching an action.
 */
function parseMessage(data: unknown): PanelMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const message = data as Record<string, unknown>;

  switch (message.type) {
    case "close":
      return {
        type: "close",
      };
    case "theme":
      return typeof message.value === "string" && THEMES.includes(message.value)
        ? {
            type: "theme",
            value: message.value as PanelTheme,
          }
        : null;
    case "language":
      return typeof message.value === "string" && LANGUAGES.includes(message.value)
        ? {
            type: "language",
            value: message.value as PanelLanguage,
            ...(isView(message.view)
              ? {
                  view: message.view,
                }
              : {}),
          }
        : null;
    case "review":
      return typeof message.index === "number" &&
        Number.isInteger(message.index) &&
        message.index >= 0 &&
        typeof message.decision === "string" &&
        DECISIONS.includes(message.decision)
        ? {
            decision: message.decision as CandidateDecision,
            index: message.index,
            type: "review",
          }
        : null;
    case "setting":
      // An empty id names no field; an empty value is dropped by the handler,
      // which is where the panel's "blank means leave it alone" rule lives.
      return typeof message.id === "string" &&
        message.id.length > 0 &&
        typeof message.value === "string"
        ? {
            id: message.id,
            type: "setting",
            value: message.value,
          }
        : null;
    default:
      return null;
  }
}

/** Rebuild the document for the current view, language, and theme. */
function buildHtml(
  options: GlimpsePanelOptions,
  state: {
    language: PanelLanguage;
    selectedIndex: number;
    theme: PanelTheme;
    view: ViewId;
  },
): string {
  const model: GlimpseModel = {
    ...options.model,
    language: state.language,
  };
  return renderDocument({
    ...assembleParts(model, {
      initialView: state.view,
      selectedIndex: state.selectedIndex,
      theme: state.theme,
    }),
    initialView: state.view,
    language: state.language,
    theme: state.theme,
  });
}

export async function openGlimpsePanel(options: GlimpsePanelOptions): Promise<boolean> {
  let module_: GlimpseModule | null = null;
  try {
    module_ = await options.resolveModule();
  } catch {
    // A resolver that throws is the same as one that finds nothing.
    module_ = null;
  }

  const open = module_?.open;
  if (typeof open !== "function") return false;

  let prefs: PanelPreferences = {
    ...loadPanelPreferences(options.prefsPath),
  };
  const state = {
    language: options.language,
    selectedIndex: 0,
    theme: prefs.theme,
    view: options.initialView,
  };

  try {
    const win: GlimpseWindow = open(buildHtml(options, state), {
      height: WINDOW_HEIGHT,
      title: options.title ?? WINDOW_TITLE,
      width: WINDOW_WIDTH,
    });

    await new Promise<void>((closed) => {
      win.on("closed", () => closed());
      win.on("message", (data) => {
        // An action that throws must not tear down the message loop; the
        // window stays usable and the failure stays out of the caller.
        void handle(parseMessage(data)).catch(() => {});
      });

      async function handle(message: PanelMessage | null): Promise<void> {
        if (message === null) return;

        switch (message.type) {
          case "close":
            win.close();
            return;
          case "theme":
            state.theme = message.value;
            prefs = {
              theme: message.value,
            };
            savePanelPreferences(options.prefsPath, prefs);
            return;
          case "language": {
            // The re-render is whole-document, so the view the user was on has
            // to be adopted before it: without this the window lands back on
            // the initial view on every language switch.
            if (message.view) state.view = message.view;
            applyLanguage(message.value);
            return;
          }
          case "setting": {
            await applySetting(message);
            return;
          }
          case "review": {
            const candidate = options.model.pending[message.index];
            if (!candidate) return;
            state.selectedIndex = message.index;

            // The window already asked with three buttons; only fall back to
            // the terminal chooser when the caller has no direct path.
            const decide = options.actions.reviewDecision?.bind(options.actions);
            if (decide) await decide(candidate, message.decision);
            else await options.actions.reviewCandidate(candidate);
            return;
          }
        }
      }

      /**
       * Language changes redraw every label, so they own the whole document.
       *
       * The row's own value moves first: a re-render draws from the model, and
       * a row left on the old value would put the old language back in the
       * select after the switch that was meant to change it.
       */
      function applyLanguage(value: PanelLanguage): void {
        const row = options.model.rows.find((entry) => entry.id === "language");
        if (row) row.currentValue = value;
        state.language = value;
        // Carry the choice into the configuration so both surfaces agree.
        options.actions.save({
          language: value,
        });
        win.setHTML(buildHtml(options, state));
      }

      /**
       * Apply one edited setting.
       *
       * Mirrors the terminal panel's `changeField`: the row's value moves
       * before the write, and `sleep` is special because it is an action
       * rather than a stored key.
       */
      async function applySetting(message: {
        id: string;
        value: string;
      }): Promise<void> {
        const row = options.model.rows.find((entry) => entry.id === message.id);
        // An unknown id names no field this window owns; a blank value is the
        // terminal panel's "leave it alone". Neither reaches the config.
        if (!row || message.value.length === 0) return;

        if (row.id === "sleep") {
          // The action row writes no configuration, so its value always
          // returns to `off`: it queues one run, it does not hold a state.
          row.currentValue = "off";
          if (message.value !== "run") return;
          const confirmed = await options.actions.confirm(
            "Run one-shot sleep",
            "Sleep performs one authorized T1 consolidation and is not persisted.",
          );
          if (confirmed) await options.actions.sleep();
          return;
        }

        row.currentValue = message.value;
        options.actions.save(settingsSaveValue(row.id, message.value, options.config));
      }
    });

    return true;
  } catch {
    // Anything the window or the native host throws becomes a fallback.
    return false;
  }
}
