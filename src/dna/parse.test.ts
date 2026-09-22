import { describe, expect, it } from "vitest";

import { MAX_DNA_FILE_CHARS, parseDna } from "./parse.ts";
import { MAX_DNA_ISSUES } from "./schema.ts";

const valid = `
# 手编注释保留
art:
  - id: card-border
    semantic: 卡片需要 1px border
    source: user-authored
    confidence: high
write: []
`;

describe("DNA parse + schema double gate (task 2.2)", () => {
  it("accepts a valid file", () => {
    const result = parseDna(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file.art).toHaveLength(1);
  });

  it("treats an empty file as an empty DNA", () => {
    expect(parseDna("")).toEqual({
      file: {},
      ok: true,
    });
  });

  it("rejects broken yaml, keeps input bytes and bounds issues", () => {
    const text = "art: [\n  - id: oops";
    const result = parseDna(text);
    expect(result.ok).toBe(false);
    expect(text).toBe("art: [\n  - id: oops");
    if (!result.ok) {
      expect(result.issues.length).toBeLessThanOrEqual(MAX_DNA_ISSUES);
      for (const issue of result.issues)
        expect(issue.message.length).toBeLessThanOrEqual(200);
    }
  });

  it("rejects a non-mapping root", () => {
    const result = parseDna("- art\n- write\n");
    expect(result.ok).toBe(false);
  });

  it("rejects syntactically valid but structurally wrong files", () => {
    const result = parseDna("art: not-a-list\n");
    expect(result.ok).toBe(false);
  });

  it("rejects unknown root fields", () => {
    const result = parseDna("code: []\n");
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues).toContainEqual({
        message: "unknown field",
        path: "/code",
      });
  });

  it("rejects duplicate ids inside a domain", () => {
    const result = parseDna(`
art:
  - id: same-id
    semantic: a
    source: user-authored
    confidence: high
  - id: same-id
    semantic: b
    source: user-authored
    confidence: low
`);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues).toContainEqual({
        message: "duplicate id in domain",
        path: "/art/1/id",
      });
  });

  it("bounds issue count and rejects oversized files", () => {
    const entries = Array.from(
      {
        length: 40,
      },
      (_, index) => `  - id: bad-${index}`,
    ).join("\n");
    const result = parseDna(`art:\n${entries}\n`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeLessThanOrEqual(MAX_DNA_ISSUES);
    const oversized = parseDna(`art: []\n# ${"x".repeat(MAX_DNA_FILE_CHARS)}`);
    expect(oversized.ok).toBe(false);
  });
});
