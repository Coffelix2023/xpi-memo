import { describe, expect, it } from "vitest";

import { mergeSearchOutcomes } from "./index.js";
import type { SearchOutcome } from "./search/selector.js";

function outcome(
  results: Array<{
    content: string;
    id?: string;
    score: number;
  }>,
  backendName: string | null = "mnemosyne",
): SearchOutcome {
  return {
    attempts: [],
    backendName,
    results: results.map((result) => ({
      content: result.content,
      id: result.id,
      score: result.score,
      source: {},
    })),
    queriedBanks: [
      "default",
    ],
  };
}

describe("mergeSearchOutcomes (plan-note-03 dual-query fusion)", () => {
  it("keeps the higher score for the same memory id", () => {
    const merged = mergeSearchOutcomes([
      outcome([
        {
          content: "决策 A",
          id: "m1",
          score: 0.4,
        },
      ]),
      outcome([
        {
          content: "决策 A",
          id: "m1",
          score: 0.9,
        },
      ]),
    ]);
    expect(merged.results).toHaveLength(1);
    expect(merged.results[0]?.score).toBe(0.9);
  });

  it("deduplicates by content signature when ids are absent", () => {
    const merged = mergeSearchOutcomes([
      outcome([
        {
          content: "约束 B",
          score: 0.2,
        },
      ]),
      outcome([
        {
          content: "约束 B ",
          score: 0.8,
        },
      ]),
    ]);
    expect(merged.results).toHaveLength(1);
    expect(merged.results[0]?.score).toBe(0.8);
  });

  it("keeps distinct memories from both queries and sorts by score", () => {
    const merged = mergeSearchOutcomes([
      outcome([
        {
          content: "中文记忆",
          score: 0.5,
        },
      ]),
      outcome([
        {
          content: "english memory",
          score: 0.7,
        },
        {
          content: "另一条",
          score: 0.3,
        },
      ]),
    ]);
    expect(merged.results.map((result) => result.content)).toEqual([
      "english memory",
      "中文记忆",
      "另一条",
    ]);
  });

  it("never lets one failed query block the other", () => {
    const merged = mergeSearchOutcomes([
      outcome([], null),
      outcome([
        {
          content: "中文记忆",
          score: 0.5,
        },
      ]),
    ]);
    expect(merged.backendName).toBe("mnemosyne");
    expect(merged.results).toHaveLength(1);
  });

  it("returns the first outcome untouched when both queries fail", () => {
    const failed = outcome([], null);
    const merged = mergeSearchOutcomes([
      failed,
      outcome([], null),
    ]);
    expect(merged.backendName).toBeNull();
    expect(merged.results).toEqual([]);
  });

  it("unions queried banks across queries", () => {
    const merged = mergeSearchOutcomes([
      outcome([
        {
          content: "a",
          score: 0.1,
        },
      ]),
      outcome([
        {
          content: "b",
          score: 0.2,
        },
      ]),
    ]);
    expect(merged.queriedBanks).toEqual([
      "default",
    ]);
  });
});
