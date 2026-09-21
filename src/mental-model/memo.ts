/**
 * Per-session source memoization (change add-mental-model-projections,
 * task 2.5).
 *
 * Re-reading a whole bank through `mnemosyne export` on every freshness check
 * would put a multi-hundred-millisecond CLI call on status and context paths.
 * This memo keeps the last bounded source evaluation per session and owner key
 * so repeated checks on an unchanged bank avoid the duplicate read.
 *
 * Correctness over speed: keys always include the owner key (two projects can
 * never share an evaluation), the memo is session-scoped (another session's
 * entries are never reused), and the host invalidates it after any observed T1
 * mutation, so changed source state can never be served stale.
 */

import type { MentalModelSourceEvaluation } from "./types.js";

export interface MentalModelSourceMemo {
  get(sessionId: string, key: string): MentalModelSourceEvaluation | undefined;
  /**
   * Drop every session's entries. Call after any T1 write in the current
   * process: over-invalidation only costs one re-read, under-invalidation
   * would serve a stale projection as fresh.
   */
  invalidateAll(): void;
  set(sessionId: string, key: string, value: MentalModelSourceEvaluation): void;
}

/** One memo key per owner and definition: `ownerKey/definitionId`. */
export function mentalModelMemoKey(ownerKey: string, definitionId: string): string {
  return `${ownerKey}/${definitionId}`;
}

export function createMentalModelSourceMemo(): MentalModelSourceMemo {
  const bySession = new Map<string, Map<string, MentalModelSourceEvaluation>>();

  function session(sessionId: string): Map<string, MentalModelSourceEvaluation> {
    let bucket = bySession.get(sessionId);
    if (!bucket) {
      bucket = new Map();
      bySession.set(sessionId, bucket);
    }
    return bucket;
  }

  return {
    get(sessionId, key) {
      return bySession.get(sessionId)?.get(key);
    },
    invalidateAll() {
      bySession.clear();
    },
    set(sessionId, key, value) {
      session(sessionId).set(key, value);
    },
  };
}
