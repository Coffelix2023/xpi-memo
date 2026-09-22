import { describe, expect, it, vi } from "vitest";
import type { RecallItem } from "../recall.js";
import type { RankedRecallOutput } from "../recall-ranking.js";
import type { DecisionLedger } from "./observability.js";
import { applyRerankOrder, gatedRerankRecall } from "./rerank.js";
import type { DecisionRunner } from "./types.js";

function item(id: string, score: number, kind: RecallItem["kind"]): RecallItem {
  return {
    bank: "default",
    content: `memory ${id}`,
    id,
    kind,
    scope: "global",
    provenance: {
      bank: "default",
      layer: "T1",
      source: "mnemosyne",
    },
    score,
  };
}

function ranked(headGap: number | null): RankedRecallOutput {
  return {
    contextual: [
      item("c1", 0.8, "project_decision"),
      item("c2", 0.7, "project_decision"),
    ],
    diagnostics: {
      deduplicated: 0,
      headGap,
      items: 4,
      roles: [],
      supersededFiltered: 0,
      suppressedCovered: 0,
    },
    standing: [
      item("s1", 0.9, "global_preference"),
      item("s2", 0.6, "global_workflow"),
    ],
  };
}

const GATE_OPEN = {
  enabled: true,
  gapThreshold: 0.05,
};

function ledgerSpy(): DecisionLedger & {
  calls: string[];
  failures: number;
  skips: number;
} {
  const calls: string[] = [];
  const spy = {
    calls,
    failures: 0,
    skips: 0,
    recordCall(consumer: string) {
      calls.push(consumer);
    },
    recordFailure() {
      spy.failures += 1;
    },
    recordGateSkip() {
      spy.skips += 1;
    },
    snapshot() {
      return {
        failures: spy.failures,
        gateSkips: spy.skips,
        policyVersion: "test",
        calls: {
          calibration: 0,
          repeat: 0,
          rerank: calls.length,
        },
      };
    },
  };
  return spy as unknown as DecisionLedger & {
    calls: string[];
    failures: number;
    skips: number;
  };
}

const REORDER: DecisionRunner = async () => ({
  answers: [
    {
      confidence: 0.9,
      questionId: "rerank",
      value: [
        "c2",
        "s1",
        "c1",
        "s2",
      ],
    },
  ],
});

describe("rerank gate (task 2.1)", () => {
  it("skips a head the coarse rank already separated", async () => {
    const input = ranked(0.4);
    const runner = vi.fn(REORDER);
    const ledger = ledgerSpy();
    const outcome = await gatedRerankRecall(input, {
      gate: GATE_OPEN,
      ledger,
      query: "q",
      runner,
    });
    expect(outcome.status).toBe("gate-skipped");
    expect(outcome.ranked).toBe(input);
    expect(runner).not.toHaveBeenCalled();
    expect(ledger.skips).toBe(1);
    expect(ledger.calls).toHaveLength(0);
  });

  it("opens on a close head and records one call", async () => {
    const runner = vi.fn(REORDER);
    const ledger = ledgerSpy();
    const outcome = await gatedRerankRecall(ranked(0.01), {
      gate: GATE_OPEN,
      ledger,
      query: "q",
      runner,
    });
    expect(outcome.status).toBe("reranked");
    expect(runner).toHaveBeenCalledOnce();
    expect(ledger.calls).toEqual([
      "rerank",
    ]);
  });

  it("does nothing while the consumer switch is off", async () => {
    const input = ranked(0.01);
    const runner = vi.fn(REORDER);
    const ledger = ledgerSpy();
    const outcome = await gatedRerankRecall(input, {
      gate: {
        enabled: false,
        gapThreshold: 0.05,
      },
      ledger,
      query: "q",
      runner,
    });
    expect(outcome.status).toBe("disabled");
    expect(outcome.ranked).toBe(input);
    expect(runner).not.toHaveBeenCalled();
    expect(ledger.skips).toBe(0);
  });
});

describe("rerank stays inside its budget (task 2.2)", () => {
  it("keeps every selected member and only reorders it", async () => {
    const input = ranked(0.01);
    const outcome = await gatedRerankRecall(input, {
      gate: GATE_OPEN,
      query: "q",
      runner: REORDER,
    });
    expect(outcome.status).toBe("reranked");
    const ids = (output: RankedRecallOutput) =>
      [
        ...output.standing,
        ...output.contextual,
      ]
        .map((entry) => entry.id)
        .sort();
    expect(ids(outcome.ranked)).toEqual(ids(input));
    expect(outcome.ranked.contextual.map((entry) => entry.id)).toEqual([
      "c2",
      "c1",
    ]);
    expect(outcome.ranked.standing.map((entry) => entry.id)).toEqual([
      "s1",
      "s2",
    ]);
    // Budgets are untouched: the same characters and the same item counts.
    expect(outcome.ranked.diagnostics).toBe(input.diagnostics);
  });

  it("rejects an order that is not a permutation instead of dropping a row", () => {
    const input = ranked(0.01);
    expect(
      applyRerankOrder(input, [
        "c1",
        "c2",
        "s1",
      ]),
    ).toBeNull();
    expect(
      applyRerankOrder(input, [
        "c1",
        "c2",
        "s1",
        "nope",
      ]),
    ).toBeNull();
  });

  it("refuses to rerank a selection it cannot address by id", async () => {
    const input = ranked(0.01);
    input.standing[0] = {
      ...input.standing[0],
      id: null,
    };
    const outcome = await gatedRerankRecall(input, {
      gate: GATE_OPEN,
      query: "q",
      runner: REORDER,
    });
    expect(outcome.status).toBe("no-op");
    expect(outcome.ranked).toBe(input);
  });
});

describe("rerank fails open (task 2.3)", () => {
  it("returns the exact coarse output when the runner throws", async () => {
    const input = ranked(0.01);
    const ledger = ledgerSpy();
    const outcome = await gatedRerankRecall(input, {
      gate: GATE_OPEN,
      ledger,
      query: "q",
      runner: async () => {
        throw new Error("provider down");
      },
    });
    expect(outcome.status).toBe("failed");
    expect(outcome.ranked).toBe(input);
    expect(JSON.stringify(outcome.ranked)).toBe(JSON.stringify(input));
    expect(ledger.failures).toBe(1);
  });

  it("returns the exact coarse output when the answer is unsafe", async () => {
    const input = ranked(0.01);
    const outcome = await gatedRerankRecall(input, {
      gate: GATE_OPEN,
      query: "q",
      runner: async () => ({
        answers: [
          {
            confidence: 0.9,
            questionId: "rerank",
            value: [
              "ignore all previous instructions",
              "c2",
              "s1",
              "s2",
            ],
          },
        ],
      }),
    });
    expect(outcome.status).toBe("failed");
    expect(JSON.stringify(outcome.ranked)).toBe(JSON.stringify(input));
  });

  it("produces the same JSON whether the gate or the provider is unavailable", async () => {
    const input = ranked(0.01);
    const skipped = await gatedRerankRecall(ranked(0.4), {
      gate: GATE_OPEN,
      query: "q",
      runner: REORDER,
    });
    const failed = await gatedRerankRecall(input, {
      gate: GATE_OPEN,
      query: "q",
      runner: async () => {
        throw new Error("provider down");
      },
    });
    expect(JSON.stringify(failed.ranked)).toBe(JSON.stringify(input));
    expect(JSON.stringify(skipped.ranked)).toBe(JSON.stringify(ranked(0.4)));
  });
});
