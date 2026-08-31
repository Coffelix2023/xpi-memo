import { describe, expect, it } from "vitest";

import { toolLine } from "./tool-rendering.js";

describe("XpiMemo tool rows", () => {
  it("renders compact outcomes without rejected payloads", () => {
    expect(
      toolLine({
        bank: "project-abc",
        kind: "project_decision",
        status: "stored",
      }),
    ).toBe("stored project_decision → project-abc");
    expect(
      toolLine({
        resultCount: 3,
        status: "recalled",
      }),
    ).toBe("recalled 3");
    expect(
      toolLine({
        reason: "secret",
        status: "rejected",
      }),
    ).toBe("rejected: secret");
    expect(
      toolLine({
        content: "apiKey=do-not-show",
        reason: "secret",
        status: "rejected",
      } as never),
    ).not.toContain("apiKey=do-not-show");
    expect(
      toolLine({
        status: "executed",
      }),
    ).toBe("sleep completed");
  });
});
