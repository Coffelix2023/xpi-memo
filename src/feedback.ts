import type { RecallItem } from "./recall.js";

export const EXPLICIT_FEEDBACK = [
  "helpful",
  "wrong",
  "irrelevant",
] as const;
export type ExplicitFeedback = (typeof EXPLICIT_FEEDBACK)[number];
export type FeedbackMode = "explicit" | "passive";
export type PassiveUsage = "recalled" | "injected";

export interface FeedbackSummary {
  conflicts: number;
  explicit: number;
  helpful: number;
  irrelevant: number;
  passive: number;
  supersessions: number;
  wrong: number;
}

export interface FeedbackAuditEntry {
  action: string;
  metadata?: {
    feedback?: string;
    feedbackMode?: string;
    replacementMemoryId?: string;
    supersedes?: string;
    targetMemoryId?: string;
    usage?: string;
  };
  timestamp?: string;
}

const MAX_COUNTER = 999;
const PASSIVE_FEEDBACK_INTERVAL_MS = 60_000;

function boundedCounter(value: number): number {
  return Math.min(MAX_COUNTER, Math.max(0, value));
}

export function emptyFeedbackSummary(): FeedbackSummary {
  return {
    conflicts: 0,
    explicit: 0,
    helpful: 0,
    irrelevant: 0,
    passive: 0,
    supersessions: 0,
    wrong: 0,
  };
}

export function summarizeFeedback(
  entries: readonly FeedbackAuditEntry[],
): FeedbackSummary {
  const summary = emptyFeedbackSummary();
  for (const entry of entries) {
    if (entry.action !== "feedback") continue;
    const feedback = entry.metadata?.feedback;
    const mode = entry.metadata?.feedbackMode;
    if (mode === "passive" || feedback === "used") summary.passive += 1;
    else if (mode === "explicit") summary.explicit += 1;
    if (feedback === "helpful") summary.helpful += 1;
    if (feedback === "wrong") summary.wrong += 1;
    if (feedback === "irrelevant") summary.irrelevant += 1;
    if (feedback === "conflict") summary.conflicts += 1;
    if (feedback === "correction" || entry.metadata?.supersedes)
      summary.supersessions += 1;
  }
  return {
    conflicts: boundedCounter(summary.conflicts),
    explicit: boundedCounter(summary.explicit),
    helpful: boundedCounter(summary.helpful),
    irrelevant: boundedCounter(summary.irrelevant),
    passive: boundedCounter(summary.passive),
    supersessions: boundedCounter(summary.supersessions),
    wrong: boundedCounter(summary.wrong),
  };
}

export function canRecordPassiveFeedback(
  entries: readonly FeedbackAuditEntry[],
  targetMemoryId: string,
  now = new Date(),
  intervalMs = PASSIVE_FEEDBACK_INTERVAL_MS,
): boolean {
  const target = targetMemoryId.trim();
  if (!target) return false;
  const latest = entries
    .filter(
      (entry) =>
        entry.action === "feedback" &&
        entry.metadata?.feedbackMode === "passive" &&
        entry.metadata.targetMemoryId === target,
    )
    .map((entry) => Date.parse(entry.timestamp ?? ""))
    .filter(Number.isFinite)
    .reduce((max, timestamp) => Math.max(max, timestamp), 0);
  return latest === 0 || now.getTime() - latest >= Math.max(0, intervalMs);
}

export function feedbackAdjustment(
  memoryId: string | null,
  entries: readonly FeedbackAuditEntry[],
): number {
  if (!memoryId) return 0;
  let adjustment = 0;
  for (const entry of entries) {
    if (entry.action !== "feedback" || entry.metadata?.targetMemoryId !== memoryId)
      continue;
    switch (entry.metadata.feedback) {
      case "used":
        adjustment += entry.metadata.feedbackMode === "passive" ? 0.02 : 0;
        break;
      case "helpful":
        adjustment += entry.metadata.feedbackMode === "passive" ? 0.02 : 0.1;
        break;
      case "wrong":
        adjustment -= 0.25;
        break;
      case "irrelevant":
        adjustment -= 0.15;
        break;
      case "correction":
        adjustment -= 0.5;
        break;
    }
  }
  return Math.max(-1, Math.min(1, adjustment));
}

/** Apply body-free feedback and supersession relations without mutating rows. */
export function applyFeedbackToRecall(
  items: readonly RecallItem[],
  entries: readonly FeedbackAuditEntry[],
): RecallItem[] {
  const supersededBy = new Map<string, string>();
  for (const entry of entries) {
    const oldId = entry.metadata?.supersedes;
    const newId = entry.metadata?.replacementMemoryId;
    if (entry.action === "feedback" && oldId && newId) supersededBy.set(oldId, newId);
  }
  return items.map((item) => ({
    ...item,
    ...(item.id && supersededBy.has(item.id)
      ? {
          supersededBy: supersededBy.get(item.id),
        }
      : {}),
    score: item.score + feedbackAdjustment(item.id, entries),
  }));
}

export function isExplicitFeedback(value: string): value is ExplicitFeedback {
  return (EXPLICIT_FEEDBACK as readonly string[]).includes(value);
}

export const PASSIVE_FEEDBACK_INTERVAL = PASSIVE_FEEDBACK_INTERVAL_MS;
