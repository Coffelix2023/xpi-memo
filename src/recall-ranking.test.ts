import { describe, expect, it } from "vitest";

import type { MemoryKind } from "./kinds.js";
import type { RecallItem } from "./recall.js";
import { detectQueryIntent, rankRecallResults } from "./recall-ranking.js";

function item(
  overrides: Partial<RecallItem> & {
    content: string;
  },
): RecallItem {
  return {
    bank: "default",
    id: null,
    kind: null,
    scope: "global",
    score: 0.5,
    provenance: {
      bank: "default",
      layer: "T1",
      source: "mnemosyne",
    },
    ...overrides,
  };
}

function kindItem(
  kind: MemoryKind,
  content: string,
  overrides: Partial<RecallItem> = {},
): RecallItem {
  return item({
    content,
    id: content,
    kind,
    ...overrides,
  });
}

describe("task 5.2 — query-intent weighting", () => {
  it("detects decision, constraint, preference, and workflow intents in Chinese and English", () => {
    expect(detectQueryIntent("我们之前决定了什么")).toMatchObject({
      project_decision: 1,
    });
    expect(detectQueryIntent("what did we decide")).toMatchObject({
      project_decision: 1,
    });
    expect(detectQueryIntent("必须遵守什么约束")).toMatchObject({
      project_constraint: 1,
    });
    expect(detectQueryIntent("what do you prefer")).toMatchObject({
      global_preference: 1,
    });
    expect(detectQueryIntent("项目结构是怎样的")).toMatchObject({
      project_gene: 1,
    });
    expect(detectQueryIntent("git 工作流怎么做")).toMatchObject({
      global_workflow: 1,
    });
  });

  it("ranks the intended kind above an equal-scoring unrelated hit in the same role", () => {
    const decision = kindItem("project_decision", "keep the adapter", {
      score: 0.5,
    });
    const gotcha = kindItem("project_gotcha", "skip the legacy hook", {
      score: 0.5,
    });
    const ranked = rankRecallResults(
      [
        gotcha,
        decision,
      ],
      "我们之前决定用什么方案",
      {
        charBudget: 10_000,
        itemBudget: 5,
      },
    );
    // Both are contextual; the decision intent must win the tie.
    expect(ranked?.contextual.map(({ content }) => content)).toEqual([
      "keep the adapter",
      "skip the legacy hook",
    ]);
  });
});

describe("task 5.3 — recency, confidence, superseded, dedupe", () => {
  it("boosts newer and higher-confidence memories over stale low-confidence ones", () => {
    const fresh = kindItem("global_preference", "use biome", {
      confidence: 0.9,
      score: 0.5,
      timestamp: "2026-01-02T00:00:00.000Z",
    });
    const stale = kindItem("global_preference", "use eslint", {
      confidence: 0.2,
      score: 0.5,
      timestamp: "2025-01-01T00:00:00.000Z",
    });
    const now = new Date("2026-02-01T00:00:00.000Z");
    const ranked = rankRecallResults(
      [
        stale,
        fresh,
      ],
      "preference",
      {
        charBudget: 10_000,
        itemBudget: 5,
        now,
      },
    );
    expect(ranked?.standing.map(({ content }) => content)).toEqual([
      "use biome",
      "use eslint",
    ]);
  });

  it("filters superseded memories out of the injected set", () => {
    const superseded = kindItem("project_decision", "old plan", {
      supersededBy: "new-plan-id",
    });
    const current = kindItem("project_decision", "new plan");
    const ranked = rankRecallResults(
      [
        superseded,
        current,
      ],
      "plan",
      {
        charBudget: 10_000,
        itemBudget: 5,
      },
    );
    expect(ranked?.contextual.map(({ content }) => content)).toEqual([
      "new plan",
    ]);
    expect(ranked?.diagnostics.supersededFiltered).toBe(1);
  });

  it("emits duplicate content once and reports the dedupe count", () => {
    const first = kindItem("global_preference", "prefer pnpm", {
      id: "id-1",
    });
    const duplicate = kindItem("global_preference", "prefer pnpm", {
      id: "id-2",
    });
    const ranked = rankRecallResults(
      [
        first,
        duplicate,
      ],
      "prefer",
      {
        charBudget: 10_000,
        itemBudget: 5,
      },
    );
    expect(ranked?.standing).toHaveLength(1);
    expect(ranked?.diagnostics.deduplicated).toBe(1);
  });
});

describe("task 5.4 — role budgets and stable injection shape", () => {
  it("applies per-role item budgets and character budgets", () => {
    const items = Array.from(
      {
        length: 6,
      },
      (_, index) =>
        kindItem("project_constraint", `constraint-${index}`, {
          id: `c-${index}`,
        }) as RecallItem,
    );
    const ranked = rankRecallResults(items, "constraint", {
      charBudget: 200,
      itemBudget: 2,
    });
    expect(ranked?.standing.length).toBeLessThanOrEqual(2);
    const chars = ranked?.standing.reduce(
      (sum, entry) => sum + entry.content.length,
      0,
    );
    expect(chars ?? 0).toBeLessThanOrEqual(200);
  });

  it("separates standing from contextual roles in the output shape", () => {
    const standing = kindItem("project_gene", "repo layout");
    const contextual = kindItem("project_decision", "chose adapter");
    const ranked = rankRecallResults(
      [
        standing,
        contextual,
      ],
      "repo",
      {
        charBudget: 10_000,
        itemBudget: 5,
      },
    );
    expect(ranked?.standing.map(({ content }) => content)).toEqual([
      "repo layout",
    ]);
    expect(ranked?.contextual.map(({ content }) => content)).toEqual([
      "chose adapter",
    ]);
  });

  it("returns null when nothing survives, so the memory block is omitted", () => {
    const superseded = kindItem("project_decision", "old", {
      supersededBy: "x",
    });
    expect(
      rankRecallResults(
        [
          superseded,
        ],
        "decision",
        {
          charBudget: 10_000,
          itemBudget: 5,
        },
      ),
    ).toBeNull();
  });
});
