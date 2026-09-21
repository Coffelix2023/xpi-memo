/**
 * Bounded automatic delivery (change add-mental-model-projections, tasks
 * 4.1-4.4).
 *
 * Only a **fresh** projection whose declared scope matches the current request
 * is deliverable. Delivery has its own item and character budget, separate from
 * ordinary recall, and a projection that does not fit is omitted whole: the
 * system never emits a partial standing answer that reads like an authority.
 *
 * Delivered content is marked as untrusted derived memory data and must pass the
 * same prompt-injection policy as recalled memories. The source ids of every
 * delivered projection are returned so automatic recall can suppress rows that
 * are already represented; explicit `xpi_memo_recall` is untouched.
 */

import { isPromptInjection } from "../memory-safety.js";
import { detectQueryIntent } from "../recall-ranking.js";
import type { MentalModelEvaluation } from "./evaluate.js";
import type { MentalModelScope } from "./types.js";

/** Independent delivery budget (design Decision 7: maximum two items). */
export const MENTAL_MODEL_DELIVERY_BUDGETS = {
  maxChars: 900,
  maxItems: 2,
} as const;

/** Closed, body-free omission reasons. */
export const MENTAL_MODEL_DELIVERY_REASONS = [
  "absent",
  "disabled",
  "failed",
  "identity-mismatch",
  "irrelevant-query",
  "over-budget",
  "stale",
  "unsafe-content",
] as const;

export type MentalModelDeliveryReason = (typeof MENTAL_MODEL_DELIVERY_REASONS)[number];

export interface MentalModelDeliveryItem {
  chars: number;
  definitionId: string;
  ownerKey: string;
  scope: MentalModelScope;
  sourceIds: string[];
}

export interface MentalModelDelivery {
  /** Model-visible block, or null when nothing safe and fresh survived. */
  context: string | null;
  /** Source ids covered by an injected projection; automatic recall excludes them. */
  coveredSourceIds: string[];
  injected: MentalModelDeliveryItem[];
  /**
   * True when this decision is worth a lifecycle record: something was
   * injected, or a real projection was skipped for a reason other than the
   * default `absent`/`disabled` state. A default installation therefore
   * writes no delivery record at all.
   */
  notable: boolean;
  omitted: number;
  reasons: MentalModelDeliveryReason[];
}

export interface MentalModelDeliveryOptions {
  evaluations: readonly MentalModelEvaluation[];
  /** Canonical project bank, or null when no project identity is recognized. */
  projectBank: string | null;
  query: string;
}

const EMPTY: MentalModelDelivery = {
  context: null,
  coveredSourceIds: [],
  injected: [],
  notable: false,
  omitted: 0,
  reasons: [],
};

function stateReason(
  state: MentalModelEvaluation["freshness"]["state"],
): MentalModelDeliveryReason | null {
  if (state === "fresh") return null;
  if (state === "absent") return "absent";
  if (state === "disabled") return "disabled";
  if (state === "failed") return "failed";
  if (state === "stale") return "stale";
  // `pending` is transient in-process state; it is never deliverable.
  return "stale";
}
/**
 * A projection is relevant when the query shows intent for at least one of the
 * kinds the definition reads. The fixed automatic-injection template names every
 * eligible intent, so default context assembly keeps both models; an unrelated
 * prompt delivers neither.
 */
function queryIsRelevant(evaluation: MentalModelEvaluation, query: string): boolean {
  const intents = detectQueryIntent(query);
  return evaluation.definition.kinds.some((kind) => intents[kind] !== undefined);
}

/** One selected projection plus the exact body it will render. */
interface SelectedProjection {
  content: string;
  item: MentalModelDeliveryItem;
}

/**
 * Select and render the deliverable projections. Never throws and never reads
 * the bank: every input was already evaluated by `evaluateMentalModels`.
 */
export function deliverMentalModels(
  options: MentalModelDeliveryOptions,
): MentalModelDelivery {
  if (options.evaluations.length === 0) return EMPTY;

  const selected: SelectedProjection[] = [];
  const reasons: MentalModelDeliveryReason[] = [];
  const coveredSourceIds: string[] = [];
  let omitted = 0;
  let chars = 0;

  for (const evaluation of options.evaluations) {
    const state = stateReason(evaluation.freshness.state);
    if (state) {
      reasons.push(state);
      omitted += 1;
      continue;
    }
    const projection = evaluation.projection;
    // Scope must match exactly: a project projection is only eligible for its
    // own project, never for another project or for a global context.
    if (
      evaluation.freshness.scope === "project" &&
      (options.projectBank === null || evaluation.owner.key !== options.projectBank)
    ) {
      reasons.push("identity-mismatch");
      omitted += 1;
      continue;
    }
    if (!projection || projection.content.trim().length === 0) {
      reasons.push("absent");
      omitted += 1;
      continue;
    }
    if (!queryIsRelevant(evaluation, options.query)) {
      reasons.push("irrelevant-query");
      omitted += 1;
      continue;
    }
    if (isPromptInjection(projection.content)) {
      reasons.push("unsafe-content");
      omitted += 1;
      continue;
    }
    if (
      selected.length >= MENTAL_MODEL_DELIVERY_BUDGETS.maxItems ||
      chars + projection.content.length > MENTAL_MODEL_DELIVERY_BUDGETS.maxChars
    ) {
      reasons.push("over-budget");
      omitted += 1;
      continue;
    }
    chars += projection.content.length;
    selected.push({
      content: projection.content.replace(/[\r\n]+/g, " "),
      item: {
        chars: projection.content.length,
        definitionId: evaluation.definition.id,
        ownerKey: evaluation.owner.key,
        scope: evaluation.owner.scope,
        // Only ids this projection is the first to cover, so diagnostics count
        // distinct covered rows rather than repeated ones.
        sourceIds: projection.sourceIds.filter((id) => !coveredSourceIds.includes(id)),
      },
    });
    coveredSourceIds.push(...projection.sourceIds);
  }

  // A plain `absent`/`disabled` skip is the default state of a fresh install,
  // not an event: it is already visible through the status counts.
  const notable = reasons.some(
    (reason) => reason !== "absent" && reason !== "disabled",
  );

  if (selected.length === 0)
    return {
      ...EMPTY,
      notable,
      omitted,
      reasons,
    };

  const lines = selected.map(
    ({ content, item }, index) =>
      `${index + 1}. [derived mental model: ${item.definitionId}] ${content}`,
  );
  return {
    context: `<untrusted-memory-data>\n${lines.join("\n")}\n</untrusted-memory-data>`,
    coveredSourceIds,
    injected: selected.map(({ item }) => item),
    notable: true,
    omitted,
    reasons,
  };
}
