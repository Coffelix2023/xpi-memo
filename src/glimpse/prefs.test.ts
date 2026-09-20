import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PANEL_PREFERENCES,
  loadPanelPreferences,
  savePanelPreferences,
  UI_PREFS_FILE,
  uiPrefsPath,
} from "./prefs.ts";

describe("glimpse panel preferences", () => {
  let dir = "";
  let path = "";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "glimpse-prefs-"));
    path = uiPrefsPath(dir);
  });

  afterEach(() => {
    rmSync(dir, {
      force: true,
      recursive: true,
    });
  });

  it("targets the documented file name inside the data dir", () => {
    expect(UI_PREFS_FILE).toBe("ui-prefs.json");
    expect(path).toBe(join(dir, "ui-prefs.json"));
  });

  it("returns the default theme when the file does not exist", () => {
    expect(loadPanelPreferences(path)).toEqual(DEFAULT_PANEL_PREFERENCES);
    expect(DEFAULT_PANEL_PREFERENCES.theme).toBe("dark");
  });

  it("round-trips a saved preference", () => {
    savePanelPreferences(path, {
      theme: "light",
    });

    expect(loadPanelPreferences(path)).toEqual({
      theme: "light",
    });
  });

  it("falls back to the default when the file is not valid JSON", () => {
    writeFileSync(path, "{ this is not json");

    expect(() => loadPanelPreferences(path)).not.toThrow();
    expect(loadPanelPreferences(path)).toEqual(DEFAULT_PANEL_PREFERENCES);
  });

  it("falls back to the default when the theme value is not a known theme", () => {
    writeFileSync(
      path,
      JSON.stringify({
        theme: "solarized",
      }),
    );
    expect(loadPanelPreferences(path)).toEqual(DEFAULT_PANEL_PREFERENCES);

    writeFileSync(path, JSON.stringify({}));
    expect(loadPanelPreferences(path)).toEqual(DEFAULT_PANEL_PREFERENCES);

    writeFileSync(path, JSON.stringify(null));
    expect(loadPanelPreferences(path)).toEqual(DEFAULT_PANEL_PREFERENCES);
  });

  it("writes complete JSON and leaves no temp file behind", () => {
    savePanelPreferences(path, {
      theme: "light",
    });

    // Complete, parseable content — the rename landed the whole document.
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      theme: "light",
    });
    // Atomic write means the temp file was renamed away, not left orphaned.
    expect(readdirSync(dir)).toEqual([
      UI_PREFS_FILE,
    ]);
  });

  it("overwrites an existing preference without leaving temp files", () => {
    savePanelPreferences(path, {
      theme: "light",
    });
    savePanelPreferences(path, {
      theme: "dark",
    });

    expect(loadPanelPreferences(path)).toEqual({
      theme: "dark",
    });
    expect(readdirSync(dir)).toEqual([
      UI_PREFS_FILE,
    ]);
  });

  it("creates missing parent directories", () => {
    const nested = join(dir, "a", "b", UI_PREFS_FILE);
    savePanelPreferences(nested, {
      theme: "light",
    });

    expect(loadPanelPreferences(nested)).toEqual({
      theme: "light",
    });
  });
});
