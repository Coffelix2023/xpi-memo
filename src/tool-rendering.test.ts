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

  it("appends a rendered execution duration when Pi reports one", () => {
    expect(
      toolLine(
        {
          resultCount: 3,
          status: "recalled",
        },
        120,
      ),
    ).toBe("recalled 3 · 120ms");
    expect(
      toolLine(
        {
          resultCount: 3,
          status: "recalled",
        },
        1200,
      ),
    ).toBe("recalled 3 · 1.2s");
    // Absent while the tool runs and for results stored before durations existed.
    expect(
      toolLine(
        {
          resultCount: 3,
          status: "recalled",
        },
        undefined,
      ),
    ).toBe("recalled 3");
  });
});
