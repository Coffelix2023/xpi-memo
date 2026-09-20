import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Window-scoped appearance preferences.
 *
 * Theme lives here rather than in `XpiMemoConfig` on purpose: every effective
 * config field must be visible in the terminal settings view, so adding a
 * config key would force a new settings row for what is a purely cosmetic
 * choice. Language is *not* stored here — it reuses the existing
 * `config.language`, so both surfaces always speak the same language.
 *
 * Failing closed means failing *open* here: an unreadable or corrupt file
 * yields the documented default rather than an error, because a preference
 * file must never be able to stop the panel from opening.
 */
export type PanelTheme = "dark" | "light";

export interface PanelPreferences {
  theme: PanelTheme;
}

/** Dark is the documented default (`TUI-DESIGN.md` §2.A, `THEMES.md`). */
export const DEFAULT_PANEL_PREFERENCES: PanelPreferences = {
  theme: "dark",
};

export const UI_PREFS_FILE = "ui-prefs.json";

export function uiPrefsPath(dataDir: string): string {
  return join(dataDir, UI_PREFS_FILE);
}

function isPanelTheme(value: unknown): value is PanelTheme {
  return value === "dark" || value === "light";
}

/**
 * Read preferences, falling back to the default for a missing, unreadable,
 * malformed, or partially-valid file. Never throws.
 */
export function loadPanelPreferences(path: string): PanelPreferences {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      const theme = (
        parsed as {
          theme?: unknown;
        }
      ).theme;
      if (isPanelTheme(theme)) {
        return {
          theme,
        };
      }
    }
  } catch {
    // Missing, unreadable, or not JSON — the default is the answer either way.
  }
  return {
    ...DEFAULT_PANEL_PREFERENCES,
  };
}

/**
 * Persist preferences atomically (temp file + rename), matching the
 * `audit.json` / `candidates.json` write pattern so a crash mid-write cannot
 * leave a half-written preferences file behind.
 */
export function savePanelPreferences(
  path: string,
  preferences: PanelPreferences,
): void {
  mkdirSync(dirname(path), {
    mode: 0o700,
    recursive: true,
  });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(preferences, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort on platforms without POSIX permissions.
  }
}
