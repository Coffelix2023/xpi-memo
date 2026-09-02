import { describeMemoryKindOrNull, type MemoryKind } from "./kinds.js";
import type { PendingCandidate } from "./pending-candidate.js";

/**
 * Bounded candidate digest (task 4.1).
 *
 * Surfaceable backlog summary: pending count, per-kind category counts,
 * oldest pending age, and the review surface or command. The digest never
 * carries candidate body text — only counts, kinds, and ages — so it stays
 * provenance-safe for TUI and non-TUI surfaces alike.
 */

export const REVIEW_SURFACE_HINT = "/xpi-memo console · Pending tab";

export interface CandidateDigest {
  /** Per-kind pending counts; kinds with zero pending are omitted. */
  categories: Partial<Record<MemoryKind, number>>;
  /** ISO timestamp of the oldest pending candidate, when one exists. */
  oldestPendingCreatedAt: string | null;
  pending: number;
  reviewSurface: string;
}

export function buildCandidateDigest(
  candidates: readonly PendingCandidate[],
): CandidateDigest {
  const categories: Partial<Record<MemoryKind, number>> = {};
  let oldestCreatedAt: string | null = null;

  for (const candidate of candidates) {
    categories[candidate.kind] = (categories[candidate.kind] ?? 0) + 1;
    if (oldestCreatedAt === null || candidate.createdAt < oldestCreatedAt) {
      oldestCreatedAt = candidate.createdAt;
    }
  }

  return {
    categories,
    oldestPendingCreatedAt: oldestCreatedAt,
    pending: candidates.length,
    reviewSurface: REVIEW_SURFACE_HINT,
  };
}

export function oldestPendingAgeMinutes(
  digest: CandidateDigest,
  now = new Date(),
): number | null {
  if (!digest.oldestPendingCreatedAt) return null;
  const created = Date.parse(digest.oldestPendingCreatedAt);
  if (!Number.isFinite(created)) return null;
  return Math.max(0, Math.floor((now.getTime() - created) / 60_000));
}

/** One-line, body-free summary for startup notifications. */
export function renderCandidateDigest(digest: CandidateDigest): string {
  const age = oldestPendingAgeMinutes(digest);
  const categories = Object.entries(digest.categories)
    .map(([kind, count]) => {
      const label = describeMemoryKindOrNull(kind as MemoryKind)?.label ?? kind;
      return `${label}×${count}`;
    })
    .join(", ");
  return [
    `${digest.pending} pending memory review${digest.pending === 1 ? "" : "s"}`,
    categories ? `(${categories})` : "",
    age !== null ? `oldest ${age}min` : "",
    `· ${digest.reviewSurface}`,
  ]
    .filter(Boolean)
    .join(" ");
}
