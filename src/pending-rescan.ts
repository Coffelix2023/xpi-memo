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
  /**
   * Records moved out of the queue because the preferences held them back.
   * A dry run counts the ones it would move.
   */
  archived: number;
  /** Records written to T1. A dry run counts the ones it would write. */
  stored: number;
  /** Records the rescan looked at. */
  total: number;
}

/** Live counters for a `N/M · S stored` line; see `onProgress`. */
export interface RescanProgress {
  archived: number;
  /** Candidates judged so far, of `total`. */
  processed: number;
  stored: number;
  /** Size of the queue this walk started with. */
  total: number;
}

export interface RescanOptions {
  auditLog?: AuditLog;
  /** Restrict the rescan to one bank; omitted means every bank. */
  bank?: string;
  candidates: CandidateStore;
  /**
   * Judge only (change rescan-visibility-and-throughput, task 1.1). Every
   * candidate still goes through the same `admit()`, but nothing is written:
   * no T1 memory, no archive, no audit entry, no state file. `RescanOutcome`
   * then reads as a projection rather than as a result.
   */
  dryRun?: boolean;
  /** Called after each candidate, so a caller can show progress (task 2.1). */
  onProgress?: (progress: RescanProgress) => void;
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
  // Sequential by design: each iteration spawns a mnemosyne process, and the
  // walk shares one in-memory state, so concurrency would only raise the CPU
  // peak. The walk also shares one state write (task 3.1) — or none at all when
  // it is a dry run, which must leave the queue byte-identical.
  const walk = async (): Promise<void> => {
    for (const candidate of queued) {
      outcome.total += 1;
      // biome-ignore lint/performance/noAwaitInLoops: sequential by design.
      const result = await options.candidates.admit(candidate.id, {
        dryRun: options.dryRun,
      });
      const admitted = result.status === "stored";
      if (admitted) {
        outcome.stored += 1;
      } else {
        if (!options.dryRun) options.candidates.archive(candidate.id);
        outcome.archived += 1;
      }
      // Audit entries record what happened; a dry run has nothing to record.
      if (!options.dryRun)
        options.auditLog?.record("candidate-rescan", {
          candidateId: candidate.id,
          decision: admitted ? "stored" : "archived",
          kind: candidate.kind,
          reason: result.reason ?? "admitted",
          scope: candidate.targetScope,
          status: result.status,
        });
      options.onProgress?.({
        archived: outcome.archived,
        processed: outcome.total,
        stored: outcome.stored,
        total: queued.length,
      });
    }
  };
  if (options.dryRun) {
    await walk();
  } else {
    await options.candidates.batch(walk);
  }
  return outcome;
}
