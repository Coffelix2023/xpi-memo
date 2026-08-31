import type { L0Event, L0EventType } from "./types.js";

/**
 * Deterministic context derivation (Task 6.1-6.4).
 *
 * Pure functions: same log + policy + budget => identical derived view.
 * No LLM calls; folding summaries are bounded text derived mechanically.
 */

export interface ContextPolicy {
  /** Event types allowed into the derived view; others are omitted. */
  allowedTypes: readonly L0EventType[];
}

export interface FoldingMarker {
  eventCount: number;
  foldedEnd: number;
  foldedStart: number;
  kind: "folding_marker";
  summaryText: string;
}

export type DerivedEntry =
  | {
      kind: "event";
      event: L0Event;
    }
  | FoldingMarker;

export interface DerivedContext {
  entries: DerivedEntry[];
  /** positions folded away (covered by markers) */
  foldedPositions: number;
  shownEvents: number;
}

/** Maximum characters in a folding marker summary. */
export const FOLDING_SUMMARY_MAX_CHARS = 500;

const DEFAULT_POLICY: ContextPolicy = {
  allowedTypes: [
    "user_message",
    "assistant_message",
    "tool_call",
    "file_change",
    "compaction",
    "t1_memory_write",
    "candidate_created",
    "candidate_confirmed",
    "candidate_rejected",
    "routing_decision",
  ],
};

/** Bounded, mechanical summary of a folded event range. */
export function foldSummary(events: readonly L0Event[]): string {
  const typeCounts = new Map<string, number>();
  for (const event of events)
    typeCounts.set(event.type, (typeCounts.get(event.type) ?? 0) + 1);
  const breakdown = [
    ...typeCounts.entries(),
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `${type}:${count}`)
    .join(", ");
  const text = `Folded ${events.length} earlier events (${breakdown}).`;
  return text.length <= FOLDING_SUMMARY_MAX_CHARS
    ? text
    : `${text.slice(0, FOLDING_SUMMARY_MAX_CHARS - 3)}...`;
}

export function deriveContext(
  events: readonly L0Event[],
  policy: ContextPolicy = DEFAULT_POLICY,
  maxEntries?: number,
): DerivedContext {
  // 1. order is preserved (input assumed position-ordered; sort defensively)
  const ordered = [
    ...events,
  ].sort((a, b) => a.position - b.position);
  // 2. filter by policy
  const allowed = ordered.filter((event) => policy.allowedTypes.includes(event.type));

  const entries: DerivedEntry[] = [];
  // 3. budget: fold the OLDEST events into markers when over budget
  const overBudget = maxEntries !== undefined && allowed.length > maxEntries;
  const foldCount = overBudget ? allowed.length - maxEntries : 0;

  if (foldCount > 0) {
    const folded = allowed.slice(0, foldCount);
    entries.push({
      eventCount: folded.length,
      foldedEnd: folded[folded.length - 1].position,
      foldedStart: folded[0].position,
      kind: "folding_marker",
      summaryText: foldSummary(folded),
    });
  }
  for (const event of allowed.slice(foldCount))
    entries.push({
      kind: "event",
      event,
    });

  return {
    entries,
    foldedPositions: foldCount,
    shownEvents: allowed.length - foldCount,
  };
}
