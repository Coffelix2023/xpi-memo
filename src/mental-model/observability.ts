/**
 * Body-free mental-model lifecycle records (change add-mental-model-projections,
 * task 5.1).
 *
 * One module builds every L0/audit record and reads them back for status, so a
 * record that status cannot count can never be written in the first place. Every
 * field is a bounded code, a count, or an identifier: no projection body, no
 * source body, no prompt, and no raw model output ever appears here.
 */

import {
  isMentalModelRefreshOutcome,
  type MentalModelRefreshOutcome,
  type MentalModelRefreshResult,
} from "./types.js";

/** Audit action carrying every mental-model lifecycle record. */
export const MENTAL_MODEL_AUDIT_ACTION = "mental-model";

/** Coarse grouping of a bounded refresh outcome. */
export type MentalModelOutcomeStatus = "failed" | "refreshed" | "skipped";

/**
 * Outcome groups that mean "no new projection was committed".
 *
 * A safety refusal and an unsafe generated body belong with failures rather
 * than skips: the attempt ran and produced nothing usable, which is exactly
 * what an operator needs to see.
 */
const FAILED_OUTCOMES: ReadonlySet<MentalModelRefreshOutcome> = new Set([
  "aborted",
  "failed",
  "invalid-output",
  "persist-failed",
  "runner-unavailable",
  "safety-refused",
  "source-read-failed",
  "timed-out",
  "unsafe-output",
]);

export function mentalModelOutcomeStatus(
  outcome: MentalModelRefreshOutcome,
): MentalModelOutcomeStatus {
  if (outcome === "refreshed") return "refreshed";
  return FAILED_OUTCOMES.has(outcome) ? "failed" : "skipped";
}

/**
 * The shared refresh record.
 *
 * The same object is the audit metadata and the L0 payload: the audit writer
 * keeps only the keys it knows, and both surfaces stay in sync by construction.
 */
export interface MentalModelRefreshRecord {
  definitionId: string;
  digestPrefix?: string;
  durationMs: number;
  outcome: MentalModelRefreshOutcome;
  outputChars: number;
  ownerKey: string;
  scope: "global" | "project";
  /** Omitted when the digest could not be computed. */
  sourceBoundary?: number;
  sourceCount: number;
  status: MentalModelOutcomeStatus;
  trigger: "session_before_compact" | "session_shutdown";
}

export function mentalModelRefreshRecord(
  result: MentalModelRefreshResult,
  trigger: MentalModelRefreshRecord["trigger"],
): MentalModelRefreshRecord {
  return {
    definitionId: result.definitionId,
    ...(result.digestPrefix === null
      ? {}
      : {
          digestPrefix: result.digestPrefix,
        }),
    durationMs: result.durationMs,
    outcome: result.outcome,
    outputChars: result.outputChars,
    ownerKey: result.ownerKey,
    scope: result.scope,
    ...(result.sourceBoundary === null
      ? {}
      : {
          sourceBoundary: result.sourceBoundary,
        }),
    sourceCount: result.sourceCount,
    status: mentalModelOutcomeStatus(result.outcome),
    trigger,
  };
}

/** The shared automatic-delivery record. */
export interface MentalModelInjectedRecord {
  chars: number;
  definitionIds: string[];
  injectedCount: number;
  lifecycleStage: "automatic-recall";
  omittedCount: number;
  ownerKeys: string[];
  policyVersion: string;
  reasons: string[];
  /**
   * Discriminator that separates a delivery record from a refresh record:
   * `injected` when a projection was delivered, `omitted` when the decision
   * delivered nothing. A refresh record never uses either value.
   */
  status: "injected" | "omitted";
}

export function mentalModelInjectedRecord(input: {
  chars: number;
  definitionIds: readonly string[];
  injectedCount: number;
  omittedCount: number;
  ownerKeys: readonly string[];
  policyVersion: string;
  reasons: readonly string[];
}): MentalModelInjectedRecord {
  return {
    chars: Math.max(0, input.chars),
    injectedCount: input.injectedCount,
    lifecycleStage: "automatic-recall",
    omittedCount: input.omittedCount,
    policyVersion: input.policyVersion,
    status: input.injectedCount > 0 ? "injected" : "omitted",
    definitionIds: [
      ...input.definitionIds,
    ],
    ownerKeys: [
      ...input.ownerKeys,
    ],
    reasons: [
      ...input.reasons,
    ],
  };
}

/** Bounded recent-record tail kept for status output. */
const MAX_RECENT_REFRESHES = 5;

export interface MentalModelAuditSummary {
  /** Total injected projection characters across recorded decisions. */
  injectedChars: number;
  /** Delivery decisions that injected at least one projection. */
  injectedDecisions: number;
  /** Total omitted projections across recorded decisions. */
  omitted: number;
  /** Count per distinct refresh outcome from the audit tail. */
  outcomes: Partial<Record<MentalModelRefreshOutcome, number>>;
  recent: MentalModelRefreshRecord[];
}

/** The minimum shape this module needs from an audit entry. */
export interface MentalModelAuditEntry {
  action: string;
  metadata: {
    chars?: number;
    definitionId?: string;
    injectedCount?: number;
    omittedCount?: number;
    outcome?: string;
    ownerKey?: string;
    scope?: string;
    sourceBoundary?: number | null;
    sourceCount?: number;
    status?: string;
    trigger?: string;
  };
}

const DELIVERY_STATUSES = new Set([
  "injected",
  "omitted",
]);

function isDeliveryRecord(entry: MentalModelAuditEntry): boolean {
  return (
    entry.metadata.status !== undefined && DELIVERY_STATUSES.has(entry.metadata.status)
  );
}

function toRecent(entry: MentalModelAuditEntry): MentalModelRefreshRecord | null {
  const outcome = entry.metadata.outcome;
  const definitionId = entry.metadata.definitionId;
  const ownerKey = entry.metadata.ownerKey;
  const scope = entry.metadata.scope;
  const trigger = entry.metadata.trigger;
  if (!outcome || !isMentalModelRefreshOutcome(outcome)) return null;
  if (!definitionId || !ownerKey) return null;
  if (scope !== "global" && scope !== "project") return null;
  if (trigger !== "session_before_compact" && trigger !== "session_shutdown")
    return null;
  return {
    definitionId,
    durationMs: 0,
    outcome,
    outputChars: entry.metadata.chars ?? 0,
    ownerKey,
    scope,
    ...(typeof entry.metadata.sourceBoundary === "number"
      ? {
          sourceBoundary: entry.metadata.sourceBoundary,
        }
      : {}),
    sourceCount: entry.metadata.sourceCount ?? 0,
    status: mentalModelOutcomeStatus(outcome),
    trigger,
  };
}

/**
 * Aggregate the bounded mental-model audit tail.
 *
 * Reads only what `mentalModelRefreshRecord` / `mentalModelInjectedRecord`
 * write, so an unknown or corrupt entry is skipped instead of guessed at.
 */
export function summarizeMentalModelAudit(
  entries: readonly MentalModelAuditEntry[],
): MentalModelAuditSummary {
  const outcomes: Partial<Record<MentalModelRefreshOutcome, number>> = {};
  const refreshes: MentalModelRefreshRecord[] = [];
  let injectedDecisions = 0;
  let injectedChars = 0;
  let omitted = 0;

  for (const entry of entries) {
    if (entry.action !== MENTAL_MODEL_AUDIT_ACTION) continue;
    if (isDeliveryRecord(entry)) {
      if (entry.metadata.status === "injected") {
        injectedDecisions += 1;
        injectedChars += Math.max(0, entry.metadata.chars ?? 0);
      }
      omitted += Math.max(0, entry.metadata.omittedCount ?? 0);
      continue;
    }
    const record = toRecent(entry);
    if (!record) continue;
    outcomes[record.outcome] = (outcomes[record.outcome] ?? 0) + 1;
    refreshes.push(record);
  }

  return {
    injectedChars,
    injectedDecisions,
    omitted,
    outcomes,
    recent: refreshes.slice(-MAX_RECENT_REFRESHES),
  };
}
