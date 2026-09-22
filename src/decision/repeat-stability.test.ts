import { describe, expect, it, vi } from "vitest";
import type { RoutingContext } from "../banks.js";
import type { DecisionLedger } from "./observability.js";
import {
  countSynonymRepeats,
  judgeRepeatStability,
  noulProbability,
  promptDigest,
  stabilityCandidate,
  type UserPromptRecord,
} from "./repeat-stability.js";
import type { DecisionRunner } from "./types.js";

const CONTEXT: RoutingContext = {
  dataDir: "/tmp/xpi-memo-decision-repeat",
  identity: "none",
  projectBank: null,
};

function prompt(
  text: string,
  sessionId = "s1",
  position = 1,
  timestamp = "2026-01-01T00:00:00.000Z",
): UserPromptRecord {
  return {
    position,
    sessionId,
    text,
    timestamp,
  };
}

describe("deterministic repeat counting (task 3.1)", () => {
  it("counts a same-meaning repeat without calling a model", () => {
    const groups = countSynonymRepeats(
      [
        prompt("Always use pnpm, never npm.", "s1", 1),
        prompt("always use pnpm never npm", "s1", 2),
        prompt("Always  use pnpm - never npm!", "s2", 3),
      ],
      3,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(3);
    expect(groups[0]?.sessionCount).toBe(2);
    expect(groups[0]?.exemplar).toBe("Always use pnpm, never npm.");
  });

  it("stays silent below the threshold", () => {
    expect(
      countSynonymRepeats(
        [
          prompt("Always use pnpm, never npm."),
          prompt("always use pnpm never npm"),
        ],
        3,
      ),
    ).toEqual([]);
  });

  it("does not merge two unrelated prompts", () => {
    expect(
      countSynonymRepeats(
        [
          prompt("Always use pnpm, never npm.", "s1", 1),
          prompt("Always use pnpm, never npm.", "s1", 2),
          prompt("Deploy the staging cluster with helm.", "s1", 3),
          prompt("Deploy the staging cluster with helm.", "s1", 4),
        ],
        2,
      ),
    ).toHaveLength(2);
  });

  it("derives a stable digest and ignores an empty prompt", () => {
    expect(promptDigest("  Hello, World! ")).toBe(promptDigest("hello world"));
    expect(
      countSynonymRepeats(
        [
          prompt("   "),
        ],
        1,
      ),
    ).toEqual([]);
  });

  it("turns a negative noul answer into a low probability", () => {
    expect(noulProbability("yes", 0.9)).toBe(0.9);
    expect(noulProbability("no", 0.95)).toBeCloseTo(0.05);
  });
});

function ledgerSpy(): DecisionLedger {
  return {
    recordCall: vi.fn(),
    recordFailure: vi.fn(),
    recordGateSkip: vi.fn(),
    snapshot: vi.fn(),
  } as unknown as DecisionLedger;
}

const GROUP = countSynonymRepeats(
  [
    prompt("Always use pnpm, never npm.", "s1", 1),
    prompt("Always use pnpm, never npm.", "s1", 2),
    prompt("Always use pnpm, never npm.", "s2", 3),
  ],
  3,
)[0] as ReturnType<typeof countSynonymRepeats>[number];

function noul(value: string, confidence: number): DecisionRunner {
  return async () => ({
    answers: [
      {
        confidence,
        questionId: "stability",
        value,
      },
    ],
  });
}

describe("stability judgment (task 3.2)", () => {
  it("produces a pending candidate and never writes T1", () => {
    const candidate = stabilityCandidate(GROUP, 0.95, {
      context: CONTEXT,
      threshold: 0.9,
    });
    expect(candidate?.status).toBe("pending");
    expect(candidate?.evidence.source).toBe("repeat-signal");
    expect(candidate?.evidence.provenance).toBe("l0:s2#3");
    // A repeat signal is not a user statement, so it can never auto-store.
    expect(candidate?.evidence.type).not.toBe("explicit-user-statement");
  });

  it("discards a proposal below the calibrated threshold", () => {
    expect(
      stabilityCandidate(GROUP, 0.4, {
        context: CONTEXT,
        threshold: 0.9,
      }),
    ).toBeNull();
  });

  it("keeps a frustration repeat out of the queue", async () => {
    const judgment = await judgeRepeatStability(GROUP, {
      enabled: true,
      runner: noul("no", 0.99),
    });
    expect(judgment.probability).toBeCloseTo(0.01);
    expect(
      stabilityCandidate(GROUP, judgment.probability ?? 0, {
        context: CONTEXT,
        threshold: 0.9,
      }),
    ).toBeNull();
  });

  it("records one call on the ledger", async () => {
    const ledger = ledgerSpy();
    await judgeRepeatStability(GROUP, {
      enabled: true,
      ledger,
      runner: noul("yes", 0.9),
    });
    expect(ledger.recordCall).toHaveBeenCalledWith("repeat");
  });
});

describe("repeat rule without a runner (task 3.3)", () => {
  it("asks nothing and produces no candidate while disabled", async () => {
    const runner = vi.fn(noul("yes", 0.99));
    const judgment = await judgeRepeatStability(GROUP, {
      enabled: false,
      runner,
    });
    expect(judgment).toEqual({
      probability: null,
      status: "disabled",
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("produces no candidate when the judgment fails", async () => {
    const ledger = ledgerSpy();
    const judgment = await judgeRepeatStability(GROUP, {
      enabled: true,
      ledger,
      runner: async () => {
        throw new Error("provider down");
      },
    });
    expect(judgment.probability).toBeNull();
    expect(judgment.status).toBe("failed");
    expect(ledger.recordFailure).toHaveBeenCalledOnce();
  });

  it("produces no candidate when no runner is configured", async () => {
    const judgment = await judgeRepeatStability(GROUP, {
      enabled: true,
    });
    expect(judgment.probability).toBeNull();
    expect(judgment.status).toBe("runner-unavailable");
  });

  it("never relaxes into an automatic write", () => {
    // A very high probability still yields a pending candidate, not a write:
    // the module exposes no T1 path at all.
    const candidate = stabilityCandidate(GROUP, 1, {
      context: CONTEXT,
      threshold: 0.9,
    });
    expect(candidate?.status).toBe("pending");
  });
});
