/**
 * Pending-candidate rescan (change admission-preferences-and-pending-rescan,
 * task group 4).
 *
 * Re-judges the candidates that piled up while the admission decision was
 * stricter than the current preferences. It owns no admission logic of its
 * own: every record goes through the same `admit()` the live path uses, so
 * there is exactly one definition of what may enter T1.
 */
import type { AuditLog } from "./audit.js";
import type { CandidateStore } from "./candidate-lifecycle.js";

export interface RescanOutcome {
  /** Records moved out of the queue because the preferences held them back. */
  archived: number;
  /** Records written to T1. */
  stored: number;
  /** Records the rescan looked at. */
  total: number;
}

export interface RescanOptions {
  auditLog?: AuditLog;
  /** Restrict the rescan to one bank; omitted means every bank. */
  bank?: string;
  candidates: CandidateStore;
}

/** What a rescan would look at, per bank: a read, never a judgement. */
export interface RescanPreview {
  byBank: Record<string, number>;
  total: number;
}

/**
 * The queue a rescan would walk, optionally scoped to one bank. The callers
 * that only want to describe the work use `previewRescan`; the rescan itself
 * takes its own snapshot so the two never share mutable state.
 */
function queuedFor(
  candidates: CandidateStore,
  bank: string | undefined,
): ReturnType<CandidateStore["list"]> {
  const queued = candidates.list();
  return bank === undefined
    ? queued
    : queued.filter((candidate) => candidate.targetBank === bank);
}

/**
 * Queue composition by bank, so a slow rescan can be described before it
 * starts: how many records, in which banks. Counts only — never a candidate
 * body, which is what the preview is allowed to show.
 */
export function previewRescan(
  candidates: CandidateStore,
  bank?: string,
): RescanPreview {
  const byBank: Record<string, number> = {};
  for (const candidate of queuedFor(candidates, bank))
    byBank[candidate.targetBank] = (byBank[candidate.targetBank] ?? 0) + 1;
  return {
    byBank,
    total: Object.values(byBank).reduce((sum, count) => sum + count, 0),
  };
}

/** `project-a (3) · default (2)` — biggest bank first, name breaks ties. */
export function formatRescanPreview(preview: RescanPreview): string {
  return Object.entries(preview.byBank)
    .sort(
      ([leftBank, leftCount], [rightBank, rightCount]) =>
        rightCount - leftCount || leftBank.localeCompare(rightBank),
    )
    .map(([bank, count]) => `${bank} (${count})`)
    .join(" · ");
}

/**
 * Re-judge every queued candidate under the current preferences.
 *
 * Idempotent by construction: it walks `list()`, which only returns pending
 * records, and an admitted record stops being pending. A second run therefore
 * has nothing left to write. Records the preferences hold back leave the queue
 * for the archive rather than accumulating forever, and stay recoverable for
 * the retention window.
 *
 * Audit entries carry the candidate id, the outcome and a bounded reason code;
 * candidate bodies are never written.
 */
export async function rescanPendingCandidates(
  options: RescanOptions,
): Promise<RescanOutcome> {
  const outcome: RescanOutcome = {
    archived: 0,
    stored: 0,
    total: 0,
  };
  // Snapshot first: archiving mutates the store during the walk.
  const queued = queuedFor(options.candidates, options.bank);
  // Sequential by design: every iteration rewrites the candidate state file, so
  // parallel admits would race on the same file.
  for (const candidate of queued) {
    outcome.total += 1;
    // biome-ignore lint/performance/noAwaitInLoops: sequential by design.
    const result = await options.candidates.admit(candidate.id);
    const admitted = result.status === "stored";
    if (admitted) {
      outcome.stored += 1;
    } else {
      options.candidates.archive(candidate.id);
      outcome.archived += 1;
    }
    options.auditLog?.record("candidate-rescan", {
      candidateId: candidate.id,
      decision: admitted ? "stored" : "archived",
      kind: candidate.kind,
      reason: result.reason ?? "admitted",
      scope: candidate.targetScope,
      status: result.status,
    });
  }
  return outcome;
}
