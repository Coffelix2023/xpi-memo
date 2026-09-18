/**
 * Candidate archive arithmetic (change admission-preferences-and-pending-rescan,
 * design Decision 3). Pure functions only.
 *
 * Archiving is a status change on the existing candidate record, not a second
 * store: `candidates.json` stays the single source of truth, so recovery and
 * expiry both work by ID without a cross-file consistency problem.
 */
import type { PendingCandidate } from "./pending-candidate.js";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Ergonomic alias for the archived status, so call sites read as intent. */
export const ARCHIVED_STATUS = "archived" as const;

/**
 * Expiry stamp for a record archived at `now`, given a retention window in
 * days. The stamp is stored on the record, so changing the configured window
 * later never re-times something already archived.
 */
export function archiveExpiry(now: Date, retentionDays: number): string {
  return new Date(now.getTime() + retentionDays * MS_PER_DAY).toISOString();
}

/**
 * Whether an archived record has passed its retention window. A record without
 * a readable `expiresAt` is kept: expiry deletes data, so it needs a positive
 * statement that the deadline passed.
 */
export function isArchiveExpired(candidate: PendingCandidate, now: Date): boolean {
  if (candidate.status !== ARCHIVED_STATUS) return false;
  if (!candidate.expiresAt) return false;
  const expires = Date.parse(candidate.expiresAt);
  if (Number.isNaN(expires)) return false;
  return now.getTime() >= expires;
}
