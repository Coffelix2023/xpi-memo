import { describe, expect, it } from "vitest";

import {
  type ContentClassification,
  classifyProhibitedContent,
  isPersistableContent,
} from "./content-policy.ts";

describe("T1 prohibited content policy", () => {
  it.each([
    [
      "secret",
      "api_key=do-not-store",
    ],
    [
      "credential",
      "password:do-not-store",
    ],
    [
      "private key",
      "-----BEGIN PRIVATE KEY-----",
    ],
    [
      "token",
      "access_token:do-not-store",
    ],
    [
      "cookie",
      "cookie:do-not-store",
    ],
    [
      "raw transcript",
      "role: user\nrole: assistant\nraw transcript",
    ],
    [
      "raw tool output",
      "Tool output:\nraw stdout",
    ],
    [
      "raw L0 event",
      "event_type: tool_result\nraw L0 event",
    ],
    [
      "model reasoning",
      "chain of thought: hidden reasoning",
    ],
    [
      "unverified speculation",
      "This probably uses an unknown provider.",
    ],
  ])("rejects %s", (_label, content) => {
    expect(
      classifyProhibitedContent({
        content,
      }),
    ).not.toBeNull();
    expect(
      isPersistableContent({
        content,
      }),
    ).toBe(false);
  });

  it.each([
    "concise-conclusion",
    "reviewed-fact",
  ] as const)("accepts explicitly classified %s content", (classification) => {
    const content = "The repository uses pnpm.";

    expect(
      classifyProhibitedContent({
        classification,
        content,
      }),
    ).toBeNull();
    expect(
      isPersistableContent({
        classification,
        content,
      }),
    ).toBe(true);
  });

  it("does not reject might/seems phrasing as speculation", () => {
    const content = "the build might fail without pnpm 11.5+";

    expect(
      classifyProhibitedContent({
        content,
      }),
    ).toBeNull();
    expect(
      isPersistableContent({
        content,
      }),
    ).toBe(true);
  });

  it.each([
    "secret",
    "credential",
    "private-key",
    "token",
    "cookie",
    "raw-transcript",
    "raw-tool-output",
    "raw-l0-event",
    "model-reasoning",
    "unverified-speculation",
  ] as const)(
    "rejects explicit %s classification",
    (classification: ContentClassification) => {
      expect(
        classifyProhibitedContent({
          classification,
          content: "safe-looking text",
        }),
      ).toBe(classification);
    },
  );

  it("rejects blank content", () => {
    expect(
      classifyProhibitedContent({
        content: " \n ",
      }),
    ).toBe("empty-content");
    expect(
      isPersistableContent({
        content: " \n ",
      }),
    ).toBe(false);
  });
});
