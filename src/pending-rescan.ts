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
  candidates: CandidateStore;
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
  const queued = options.candidates.list();
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
