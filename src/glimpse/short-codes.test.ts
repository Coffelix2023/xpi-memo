import { describe, expect, it } from "vitest";
import { SETTINGS_GROUPS } from "../settings-groups.js";
import { renderDocument } from "./document.js";
import { modelFixture } from "./fixture.js";
import { allShortCodes, FIELD_SHORT, GROUP_SHORT } from "./short-codes.js";
import { assembleParts } from "./views/index.js";

/**
 * The semantic-id contract, end to end.
 *
 * Task 4.5's acceptance criterion: every short code the design dictionary names
 * appears as an `id` in the rendered document, exactly once. This is the machine
 * check for "id === short code", which is what lets a reviewer grep the window
 * for a code the dictionary uses and what makes annotate/promotion possible.
 *
 * The expected total is a literal, not derived from `allShortCodes()`: a test
 * that reads its expectation from the code under test passes when both are
 * wrong. The number is 75 = the 57 codes the design dictionary carried plus the
 * 18 added when the settings groups grew from five to six and their fields from
 * twenty to thirty-seven, plus the settings view's loading and error regions,
 * plus the three added by the mental-model group (one group, two fields).
 */
const EXPECTED_CODE_COUNT = 80;

function renderFixtureDocument(): string {
  const model = modelFixture();
  return renderDocument({
    ...assembleParts(model, {
      initialView: "pending",
      theme: "dark",
    }),
    initialView: "pending",
    language: model.language,
    theme: "dark",
  });
}

/** Every `id="..."` value in a document. */
function idsIn(html: string): string[] {
  return [
    ...html.matchAll(/\sid="([^"]+)"/g),
  ].map((match) => match[1]);
}

describe("semantic short codes", () => {
  it("emits the expected number of codes", () => {
    expect(allShortCodes()).toHaveLength(EXPECTED_CODE_COUNT);
  });

  it("has no duplicate code", () => {
    const codes = allShortCodes();
    const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
    expect(duplicates).toEqual([]);
  });

  it("covers every group and field in the settings layout", () => {
    // A group or field added to `SETTINGS_GROUPS` without a code would render an
    // element with no id, which is how a code silently goes missing.
    for (const group of SETTINGS_GROUPS) {
      expect(GROUP_SHORT[group.id], group.id).toBeTruthy();
      for (const field of group.fields) {
        expect(FIELD_SHORT[field], field).toBeTruthy();
      }
    }
    expect(Object.keys(GROUP_SHORT)).toHaveLength(SETTINGS_GROUPS.length);
  });

  it("maps every field to a distinct code", () => {
    const codes = Object.values(FIELD_SHORT);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("rendered document carries every code as an id", () => {
  it("emits each code exactly once", () => {
    const ids = idsIn(renderFixtureDocument());

    for (const code of allShortCodes()) {
      expect(
        ids.filter((id) => id === code),
        code,
      ).toHaveLength(1);
    }
  });

  it("emits no id that is not a known code", () => {
    // The reverse direction: a stray id would mean an element outside the
    // dictionary, which no review process would catch.
    const known = new Set(allShortCodes());
    const stray = idsIn(renderFixtureDocument()).filter((id) => !known.has(id));
    expect(stray).toEqual([]);
  });

  it("renders the settings field count the config actually has", () => {
    // 39 fields across 7 groups, per `SETTINGS_GROUPS`. The window must not
    // fall back to the prototype's twenty.
    const fieldCodes = Object.values(FIELD_SHORT);
    const html = renderFixtureDocument();

    expect(fieldCodes).toHaveLength(39);
    for (const code of fieldCodes) {
      expect(html, code).toContain(`id="${code}"`);
    }
  });
});
