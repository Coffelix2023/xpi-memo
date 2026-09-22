import { describe, expect, it } from "vitest";

import { validateDnaEntry, validateDnaFile } from "./schema.ts";

const validEntry = {
  confidence: "high",
  id: "card-border",
  semantic: "卡片需要 1px border",
  source: "user-authored",
} as const;

describe("DNA schema validation (task 2.1)", () => {
  it("accepts a valid entry with params", () => {
    const result = validateDnaEntry({
      ...validEntry,
      params: {
        dense: false,
        gap: 12,
        token: "spacing-3",
      },
    });
    expect(result.ok).toBe(true);
  });

  it("accepts empty, single-domain and dual-domain files", () => {
    expect(validateDnaFile({}).ok).toBe(true);
    expect(
      validateDnaFile({
        art: [],
      }).ok,
    ).toBe(true);
    expect(
      validateDnaFile({
        art: [],
        write: [],
      }).ok,
    ).toBe(true);
  });

  it("accepts the same id in different domains", () => {
    expect(
      validateDnaFile({
        art: [
          validEntry,
        ],
        write: [
          validEntry,
        ],
      }).ok,
    ).toBe(true);
  });

  it("rejects a missing id", () => {
    const { confidence, semantic, source } = validEntry;
    const result = validateDnaEntry({
      confidence,
      semantic,
      source,
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.some((issue) => issue.message.includes("id"))).toBe(true);
  });

  it("rejects a non-kebab-case id", () => {
    const result = validateDnaEntry({
      ...validEntry,
      id: "Card_Border",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects unknown entry fields", () => {
    const result = validateDnaEntry({
      ...validEntry,
      extra: "surprise",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.some((issue) => issue.message === "unknown field")).toBe(
        true,
      );
  });

  it("rejects invalid source and confidence values", () => {
    expect(
      validateDnaEntry({
        ...validEntry,
        source: "guessed",
      }).ok,
    ).toBe(false);
    expect(
      validateDnaEntry({
        ...validEntry,
        confidence: "certain",
      }).ok,
    ).toBe(false);
  });

  it("rejects empty semantic text", () => {
    expect(
      validateDnaEntry({
        ...validEntry,
        semantic: "",
      }).ok,
    ).toBe(false);
  });

  it("rejects duplicate ids within one domain with a bounded path", () => {
    const result = validateDnaFile({
      art: [
        validEntry,
        validEntry,
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues).toContainEqual({
        message: "duplicate id in domain",
        path: "/art/1/id",
      });
  });

  it("rejects unknown root domains", () => {
    const result = validateDnaFile({
      code: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues).toContainEqual({
        message: "unknown field",
        path: "/code",
      });
  });
});
