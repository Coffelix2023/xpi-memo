/**
 * Gated recall rerank (change add-typesafe-decision-hooks, task 2.x).
 *
 * The rerank is a strictly bounded post-pass over an already budgeted recall
 * selection:
 * - only the head that the coarse rank left *close* is judged (gate, task 2.1);
 * - the judge returns a permutation of the selected ids, so the member set and
 *   the item/character budgets are unchanged by construction (task 2.2);
 * - anything else — disabled, gated out, unavailable, timed out, or refused —
 *   returns the exact object it was given (task 2.3).
 */

import type { RecallItem } from "../recall.js";
import type { RankedRecallOutput } from "../recall-ranking.js";
import type { DecisionLedger } from "./observability.js";
import { runDecision } from "./runner.js";
import type { DecisionRunner } from "./types.js";

export interface RerankGate {
  enabled: boolean;
  /** Head gap at or below this value counts as "too close to call". */
  gapThreshold: number;
}

export interface GatedRerankOptions {
  gate: RerankGate;
  ledger?: DecisionLedger;
  query: string;
  runner?: DecisionRunner;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type RerankStatus =
  | "disabled"
  | "failed"
  | "gate-skipped"
  | "no-op"
  | "reranked";

export interface RerankOutcome {
  /** Identical to the input whenever `status !== "reranked"`. */
  ranked: RankedRecallOutput;
  status: RerankStatus;
}

const RERANK_PROMPT =
  "Rank the candidate memories by how directly each one answers the query. " +
  "Return every candidate exactly once, most relevant first.";

/** Bound on one candidate snippet inside the outbound state. */
const MAX_CANDIDATE_SNIPPET_CHARS = 400;

/**
 * Reorder the selected rows by `order`, keeping every row and every role
 * bucket. Returns null when `order` is not a permutation of the selected ids,
 * so an unusable answer falls back instead of silently dropping a row.
 */
export function applyRerankOrder(
  ranked: RankedRecallOutput,
  order: readonly string[],
): RankedRecallOutput | null {
  const selected = [
    ...ranked.standing,
    ...ranked.contextual,
  ];
  const ids = selected.map((item) => item.id);
  if (ids.some((id) => typeof id !== "string")) return null;
  if (order.length !== ids.length) return null;
  const rank = new Map(
    order.map((id, index) => [
      id,
      index,
    ]),
  );
  if (rank.size !== order.length) return null;
  for (const id of ids) if (!rank.has(id as string)) return null;

  const byRank = (left: RecallItem, right: RecallItem) =>
    (rank.get(left.id as string) ?? 0) - (rank.get(right.id as string) ?? 0);
  return {
    ...ranked,
    contextual: [
      ...ranked.contextual,
    ].sort(byRank),
    standing: [
      ...ranked.standing,
    ].sort(byRank),
  };
}

/**
 * Run the rerank gate and, when it opens, one bounded decision call.
 * Never throws and never mutates the input.
 */
export async function gatedRerankRecall(
  ranked: RankedRecallOutput,
  options: GatedRerankOptions,
): Promise<RerankOutcome> {
  if (!options.gate.enabled)
    return {
      ranked,
      status: "disabled",
    };

  const gap = ranked.diagnostics.headGap;
  if (gap === null || gap > options.gate.gapThreshold) {
    options.ledger?.recordGateSkip();
    return {
      ranked,
      status: "gate-skipped",
    };
  }

  const selected = [
    ...ranked.standing,
    ...ranked.contextual,
  ];
  const optionIds: string[] = [];
  for (const item of selected) {
    if (typeof item.id !== "string")
      return {
        ranked,
        status: "no-op",
      };
    optionIds.push(item.id);
  }
  if (optionIds.length < 2)
    return {
      ranked,
      status: "no-op",
    };

  options.ledger?.recordCall("rerank");
  const result = await runDecision({
    enabled: true,
    questions: [
      {
        id: "rerank",
        options: optionIds,
        primitive: "score",
        prompt: RERANK_PROMPT,
      },
    ],
    ...(options.runner
      ? {
          runner: options.runner,
        }
      : {}),
    ...(options.signal
      ? {
          signal: options.signal,
        }
      : {}),
    state: JSON.stringify({
      candidates: selected.map((item) => ({
        id: item.id,
        text: item.content.slice(0, MAX_CANDIDATE_SNIPPET_CHARS),
      })),
      query: options.query,
    }),
    ...(options.timeoutMs === undefined
      ? {}
      : {
          timeoutMs: options.timeoutMs,
        }),
  });
  if (result.status !== "completed") {
    options.ledger?.recordFailure();
    return {
      ranked,
      status: "failed",
    };
  }

  const answer = result.output.answers[0];
  const order = answer && Array.isArray(answer.value) ? answer.value : null;
  const reordered = order ? applyRerankOrder(ranked, order) : null;
  if (!reordered) {
    options.ledger?.recordFailure();
    return {
      ranked,
      status: "failed",
    };
  }
  return {
    ranked: reordered,
    status: "reranked",
  };
}
