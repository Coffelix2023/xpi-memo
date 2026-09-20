import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DARK_SELECTOR,
  DARK_TOKENS,
  LIGHT_SELECTOR,
  LIGHT_TOKENS,
  themeTokensCss,
} from "./tokens.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const DECLARATION_PATTERN = /^\s*--([a-z0-9-]+):\s*(.+?);\s*$/;
const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b/;

/** Plain ASCII ordering, so the emitted CSS is stable across locales. */
function compareNames(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
const THEMES_PATH = join(REPO_ROOT, "THEMES.md");

/**
 * Pull `--name: value` declarations out of one selector block in `THEMES.md`.
 * Deliberately a small hand parser rather than a CSS dependency: the file is a
 * single fenced block we own, and a dependency here would be more moving parts
 * than the thing it parses.
 */
function declarationsFor(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) {
    throw new Error(`THEMES.md has no '${selector} {' block`);
  }
  const end = css.indexOf("\n}", start);
  if (end < 0) {
    throw new Error(`THEMES.md block '${selector}' is not closed`);
  }
  const declarations: Record<string, string> = {};
  for (const line of css.slice(start + selector.length + 2, end).split("\n")) {
    const match = DECLARATION_PATTERN.exec(line);
    if (match) {
      declarations[match[1]] = match[2];
    }
  }
  return declarations;
}

const themes = readFileSync(THEMES_PATH, "utf8");
const lightDeclarations = declarationsFor(themes, LIGHT_SELECTOR);
const darkDeclarations = declarationsFor(themes, DARK_SELECTOR);

/** Variables present in both theme blocks — the scope `tokens.ts` commits to. */
const sharedNames = Object.keys(lightDeclarations)
  .filter((name) => name in darkDeclarations)
  .sort(compareNames);

describe("theme tokens track THEMES.md", () => {
  it("parses both theme blocks out of the document", () => {
    expect(Object.keys(lightDeclarations).length).toBeGreaterThan(0);
    expect(Object.keys(darkDeclarations).length).toBeGreaterThan(0);
    expect(sharedNames.length).toBeGreaterThan(0);
  });

  it("covers exactly the variables shared by both theme blocks", () => {
    // Anything declared in only one block (e.g. `--spacing`, `--tracking-normal`)
    // is a Tailwind concern, not part of the two-theme contract.
    expect(Object.keys(LIGHT_TOKENS).sort()).toEqual(sharedNames);
  });

  it("uses the same token names in both themes", () => {
    expect(Object.keys(DARK_TOKENS).sort()).toEqual(Object.keys(LIGHT_TOKENS).sort());
  });

  it("matches THEMES.md light values exactly", () => {
    expect(LIGHT_TOKENS).toEqual(
      Object.fromEntries(
        sharedNames.map((name) => [
          name,
          lightDeclarations[name],
        ]),
      ),
    );
  });

  it("matches THEMES.md dark values exactly", () => {
    expect(DARK_TOKENS).toEqual(
      Object.fromEntries(
        sharedNames.map((name) => [
          name,
          darkDeclarations[name],
        ]),
      ),
    );
  });

  it("contains no literal hex color", () => {
    for (const tokens of [
      LIGHT_TOKENS,
      DARK_TOKENS,
    ]) {
      for (const [name, value] of Object.entries(tokens)) {
        expect(value, `token --${name}`).not.toMatch(HEX_COLOR_PATTERN);
      }
    }
  });

  it("emits both selectors, with every token declared under each", () => {
    const css = themeTokensCss();

    expect(css).toContain(`${LIGHT_SELECTOR} {`);
    expect(css).toContain(`${DARK_SELECTOR} {`);
    for (const name of Object.keys(LIGHT_TOKENS)) {
      // Declared twice: once per theme block.
      expect(css.split(`--${name}:`).length - 1, `token --${name}`).toBe(2);
    }
    expect(css).not.toMatch(HEX_COLOR_PATTERN);
  });
});
