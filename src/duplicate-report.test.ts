import { describe, expect, it } from "vitest";

import { markExactDuplicates, nearDuplicatePairs } from "./duplicate-report.js";

describe("duplicate-report", () => {
  it("marks older exact duplicates in the same bank and kind", () => {
    const marked = markExactDuplicates(
      [
        {
          bank: "project-a",
          content: "keep the adapter",
          id: "old",
          kind: "project_decision",
        },
        {
          bank: "project-a",
          content: "keep the  adapter",
          id: "new",
          kind: "project_decision",
        },
      ],
      (item) => (item.id === "new" ? 2 : 1),
    );

    expect(marked[0]?.supersededBy).toBe("new");
    expect(marked[1]?.supersededBy).toBeUndefined();
  });

  it("does not mark exact duplicates across banks or kinds", () => {
    const marked = markExactDuplicates(
      [
        {
          bank: "project-a",
          content: "keep the adapter",
          id: "a",
          kind: "project_decision",
        },
        {
          bank: "project-b",
          content: "keep the adapter",
          id: "b",
          kind: "project_decision",
        },
        {
          bank: "project-a",
          content: "keep the adapter",
          id: "c",
          kind: "project_gotcha",
        },
      ],
      () => 0,
    );

    expect(marked.every((item) => item.supersededBy === undefined)).toBe(true);
  });

  it("reports near duplicates without touching exact matches", () => {
    const pairs = nearDuplicatePairs([
      {
        bank: "project-a",
        content: "keep the existing adapter boundary",
        id: "a",
        kind: "project_decision",
      },
      {
        bank: "project-a",
        content: "keep the existing adapter",
        id: "b",
        kind: "project_decision",
      },
      {
        bank: "project-a",
        content: "keep the existing adapter",
        id: "c",
        kind: "project_decision",
      },
    ]);

    expect(pairs).toEqual([
      {
        a: "a",
        b: "b",
        bank: "project-a",
        kind: "project_decision",
      },
      {
        a: "a",
        b: "c",
        bank: "project-a",
        kind: "project_decision",
      },
    ]);
  });
});
