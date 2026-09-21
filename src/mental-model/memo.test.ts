import { describe, expect, it } from "vitest";
import { createMentalModelSourceMemo, mentalModelMemoKey } from "./memo.js";
import type { MentalModelSourceEvaluation } from "./types.js";

function evaluation(id: string): MentalModelSourceEvaluation {
  return {
    boundary: 1,
    digest: id.repeat(64).slice(0, 64),
    rows: [
      {
        bank: "default",
        content: id,
        id: `m-${id}`,
        kind: "global_preference",
        scope: "global",
      },
    ],
  };
}

describe("per-session source memoization", () => {
  it("serves a repeated check from the memo for the same session and key", () => {
    const memo = createMentalModelSourceMemo();
    expect(memo.get("session-a", "global/user-working-style")).toBeUndefined();
    memo.set("session-a", "global/user-working-style", evaluation("x"));
    expect(memo.get("session-a", "global/user-working-style")).toEqual(evaluation("x"));
  });

  it("never reuses results across owner keys or definitions", () => {
    const memo = createMentalModelSourceMemo();
    memo.set("session-a", "global/user-working-style", evaluation("x"));
    // A different owner key (another project) must miss even in the same session.
    expect(
      memo.get("session-a", "project-p-aaaaaaaaaaaa/active-project-operating-model"),
    ).toBeUndefined();
    // A different definition under the same owner must miss too.
    expect(memo.get("session-a", "global/other-definition")).toBeUndefined();
  });

  it("never reuses results across sessions", () => {
    const memo = createMentalModelSourceMemo();
    memo.set("session-a", "global/user-working-style", evaluation("x"));
    expect(memo.get("session-b", "global/user-working-style")).toBeUndefined();
  });

  it("drops every entry on invalidation so changed source state is re-read", () => {
    const memo = createMentalModelSourceMemo();
    memo.set("session-a", "global/user-working-style", evaluation("x"));
    memo.set("session-b", "global/user-working-style", evaluation("y"));
    memo.invalidateAll();
    expect(memo.get("session-a", "global/user-working-style")).toBeUndefined();
    expect(memo.get("session-b", "global/user-working-style")).toBeUndefined();
  });

  it("keys combine owner and definition without ambiguity", () => {
    expect(mentalModelMemoKey("global", "user-working-style")).toBe(
      "global/user-working-style",
    );
    expect(mentalModelMemoKey("global", "user-working-style")).not.toBe(
      mentalModelMemoKey("project-p-a", "user-working-style"),
    );
  });
});
