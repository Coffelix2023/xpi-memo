import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ATLAS_DARK_TOKENS,
  ATLAS_LIGHT_TOKENS,
  DARK_SELECTOR,
  DARK_TOKENS,
  LIGHT_SELECTOR,
  LIGHT_TOKENS,
  THEME_PRINCIPLES,
  THEME_TOKEN_SETS,
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

/** Where the second principle starts; its blocks are the ones after it. */
const ATLAS_HEADING = "## Atlas-Themes";
const atlasThemes = themes.slice(themes.indexOf(ATLAS_HEADING));
const atlasLightDeclarations = declarationsFor(atlasThemes, LIGHT_SELECTOR);
const atlasDarkDeclarations = declarationsFor(atlasThemes, DARK_SELECTOR);

/**
 * Tailwind build-time variables: declared in the CSS, meaningless to the panel.
 * Both principles drop them, so they never reach the emitted chunk.
 */
const TAILWIND_ONLY_NAMES = new Set([
  "spacing",
  "tracking-normal",
]);

function withoutTailwindOnly(
  declarations: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(declarations).filter(([name]) => !TAILWIND_ONLY_NAMES.has(name)),
  );
}

const atlasLightExpected = withoutTailwindOnly(atlasLightDeclarations);
const atlasDarkExpected = withoutTailwindOnly(atlasDarkDeclarations);

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

  it("contains no literal hex color in any principle", () => {
    for (const tokens of [
      LIGHT_TOKENS,
      DARK_TOKENS,
      ATLAS_LIGHT_TOKENS,
      ATLAS_DARK_TOKENS,
    ]) {
      for (const [name, value] of Object.entries(tokens)) {
        expect(value, `token --${name}`).not.toMatch(HEX_COLOR_PATTERN);
      }
    }
  });
});

/** One emitted block, split out of the chunk by its blank-line separators. */
function emittedBlocks(): Array<{
  names: string[];
  selector: string;
}> {
  return themeTokensCss()
    .split("\n\n")
    .map((block) => ({
      names: [
        ...block.matchAll(/^ {2}--([a-z0-9-]+):/gm),
      ].map((match) => match[1] ?? ""),
      selector: block.slice(0, block.indexOf(" {")),
    }));
}

const emitted = emittedBlocks();

describe("the emitted chunk carries one light/dark pair per principle", () => {
  it("emits the four blocks in cascade order", () => {
    // Order is the contract: `.atlas` has to come after `.dark`, or the
    // default colors would win under `class="atlas"` alone.
    expect(emitted.map((block) => block.selector)).toEqual([
      ":root",
      ".dark",
      ".atlas",
      ".atlas.dark",
    ]);
  });

  it("declares the same token names under both blocks of a principle", () => {
    // `glimpse-console-panel`: light and dark must use one token set, so a
    // variant switch cannot leave a name resolving from the other class.
    for (const principle of THEME_PRINCIPLES) {
      const set = THEME_TOKEN_SETS[principle];
      const light = emitted.find((block) => block.selector === set.lightSelector);
      const dark = emitted.find((block) => block.selector === set.darkSelector);
      const names = Object.keys(set.light).sort();

      expect(light?.names.sort(), `${principle} light`).toEqual(names);
      expect(dark?.names.sort(), `${principle} dark`).toEqual(names);
      expect(Object.keys(set.dark).sort(), `${principle} set`).toEqual(names);
    }
    expect(themeTokensCss()).not.toMatch(HEX_COLOR_PATTERN);
  });
});

describe("theme tokens track the atlas blocks in THEMES.md", () => {
  it("parses the atlas section out of the document", () => {
    expect(atlasThemes.length).toBeGreaterThan(0);
    expect(Object.keys(atlasLightDeclarations).length).toBeGreaterThan(0);
    expect(Object.keys(atlasDarkDeclarations).length).toBeGreaterThan(0);
  });

  it("matches the atlas light block exactly", () => {
    expect(ATLAS_LIGHT_TOKENS).toEqual(atlasLightExpected);
  });

  it("matches the resolved atlas dark block exactly", () => {
    // `THEMES.md` writes atlas `.dark` as an override; the window emits it
    // resolved, so the expectation is the light block with the authored dark
    // declarations layered on top — the same layering `tokens.ts` performs.
    expect(ATLAS_DARK_TOKENS).toEqual({
      ...atlasLightExpected,
      ...atlasDarkExpected,
    });
  });

  it("keeps the authored atlas dark block a subset of its light block", () => {
    // A name declared only in the dark block would leave the light variant on a
    // default-theme value.
    for (const name of Object.keys(atlasDarkExpected)) {
      expect(atlasLightExpected, `--${name}`).toHaveProperty(name);
    }
  });

  it("keeps the atlas re-skin: square corners, flat shadows, CJK faces", () => {
    // None of these live in the atlas dark block, so they have to reach the
    // dark variant from `.atlas` itself.
    expect(ATLAS_LIGHT_TOKENS.radius).toBe("0rem");
    expect(ATLAS_LIGHT_TOKENS.shadow).toBe("none");
    expect(ATLAS_LIGHT_TOKENS["shadow-sm"]).toBe("none");
    expect(ATLAS_LIGHT_TOKENS["font-sans"]).toContain("Noto Sans SC");
    expect(ATLAS_LIGHT_TOKENS["grid-line"]).toBeTruthy();
    expect(ATLAS_LIGHT_TOKENS.track).toBeTruthy();
  });
});
