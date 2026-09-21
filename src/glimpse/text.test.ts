import { describe, expect, it } from "vitest";
import { panelText } from "../panel-text.ts";
import { fillTemplate, glimpseText, recallLine, WINDOW_TEXT_KEYS } from "./text.ts";

const LANGUAGES = [
  "en",
  "zh",
] as const;

/**
 * Keys that read the same in every language on purpose: a product name, the two
 * theme principles, and the literal `on`/`off` values the info bar prints for the
 * pause flag. The translation guard skips these rather than being weakened for
 * everything.
 */
const NOT_TRANSLATED = new Set([
  "app.name",
  // The two theme principles are proper names, not copy.
  "principle.atlas",
  "principle.default",
  "info.off",
  "info.on",
]);

describe("glimpse window copy", () => {
  it("defines the same keys in every language", () => {
    // Read through the public lookup so the test does not need the private table.
    for (const key of WINDOW_TEXT_KEYS) {
      for (const language of LANGUAGES) {
        expect(glimpseText(key, language), `${language} ${key}`).not.toBe(key);
      }
    }
  });

  it("has no one-way key", () => {
    for (const key of WINDOW_TEXT_KEYS) {
      expect(glimpseText(key, "en"), `en ${key}`).toBeTruthy();
      expect(glimpseText(key, "zh"), `zh ${key}`).toBeTruthy();
    }
  });

  it("has no empty value", () => {
    for (const key of WINDOW_TEXT_KEYS) {
      for (const language of LANGUAGES) {
        expect(glimpseText(key, language).trim(), `${language} ${key}`).not.toBe("");
      }
    }
  });

  it("actually translates the keys a reader sees in both languages", () => {
    // A window that reads English in Chinese mode is the failure this guards.
    for (const key of WINDOW_TEXT_KEYS) {
      if (NOT_TRANSLATED.has(key)) continue;
      expect(glimpseText(key, "zh"), key).not.toBe(glimpseText(key, "en"));
    }
  });

  it("resolves the keys the terminal panel owns through panelText", () => {
    // View names and info-bar labels are not duplicated into the window table.
    expect(WINDOW_TEXT_KEYS).not.toContain("tab.pending");
    expect(WINDOW_TEXT_KEYS).not.toContain("info.bank");

    for (const language of LANGUAGES) {
      expect(glimpseText("tab.pending", language)).toBe(
        panelText("tab.pending", language),
      );
      expect(glimpseText("info.bank", language)).toBe(panelText("info.bank", language));
    }
    expect(glimpseText("tab.pending", "zh")).toBe("待审");
  });

  it("falls back to the key itself for an unknown string", () => {
    // Readable text, never an empty element.
    expect(glimpseText("does.not.exist", "zh")).toBe("does.not.exist");
  });

  it("falls back to English when a language has no entry", () => {
    expect(glimpseText("field.limit", "zh")).toBe(panelText("field.limit", "zh"));
  });
});

describe("glimpse window templates", () => {
  it("fills every slot", () => {
    expect(
      fillTemplate("a {x} b {y}", {
        x: "1",
        y: "2",
      }),
    ).toBe("a 1 b 2");
  });

  it("leaves an unknown slot visible rather than blank", () => {
    expect(
      fillTemplate("a {x} b {missing}", {
        x: "1",
      }),
    ).toBe("a 1 b {missing}");
  });

  it("composes the recall line from live state in both languages", () => {
    const zh = recallLine("hybrid", "ripgrep", false, "zh");
    expect(zh).toBe("召回 hybrid · 后端 ripgrep · 嵌入 不可用");

    const en = recallLine("hybrid", "ripgrep", true, "en");
    expect(en).toBe("recall hybrid · backend ripgrep · embedding available");
  });

  it("reflects embedding availability, not a baked-in demo value", () => {
    // The prototype hardcoded "embedding unavailable"; the window must not.
    expect(recallLine("fts5", "auto", true, "zh")).toContain("可用");
    expect(recallLine("fts5", "auto", true, "zh")).not.toContain("不可用");
    expect(recallLine("fts5", "auto", false, "zh")).toContain("不可用");
  });
});
