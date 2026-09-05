import { describe, expect, it } from "vitest";
import { extractMemoryTitle, formatMemoryList } from "./formatting.js";

describe("memory formatting", () => {
  it("extracts the first sentence", () => {
    expect(extractMemoryTitle("Use pnpm. Keep scripts deterministic.")).toBe(
      "Use pnpm",
    );
    expect(extractMemoryTitle("优先使用 pnpm。保留脚本确定性。")).toBe("优先使用 pnpm");
  });

  it("truncates long titles to 50 characters", () => {
    const title = extractMemoryTitle("x".repeat(80));
    expect(title).toHaveLength(50);
    expect(title.endsWith("…")).toBe(true);
  });

  it("formats a bounded memory list with ids", () => {
    expect(
      formatMemoryList([
        {
          content: "Use pnpm for scripts.",
          id: "memory-1",
        },
        {
          content: "Keep tests deterministic.",
          id: null,
        },
      ]),
    ).toBe("1. Use pnpm for scripts [memory-1]\n2. Keep tests deterministic");
    expect(formatMemoryList([])).toBe("No memories found.");
  });
});
