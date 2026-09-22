/**
 * Body-free decision counters (change add-typesafe-decision-hooks, task 1.5).
 *
 * One bounded state file answers "is the decision boundary on, how often did it
 * run, and how often did it fall back?" without carrying any judged content:
 * counts and closed codes only, never the state sent out or the answer that
 * came back. It is a small sibling of the extraction budget ledger rather than
 * an audit action, so the audit schema stays untouched.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export const DECISION_POLICY_VERSION = "decision-boundary-v1";
export const MAX_DECISION_COUNT = 999;

/** The three consumers that share the boundary. */
export const DECISION_CONSUMERS = [
  "calibration",
  "repeat",
  "rerank",
] as const;

export type DecisionConsumer = (typeof DECISION_CONSUMERS)[number];

export interface DecisionCounters {
  /** Calls actually issued per consumer. */
  calls: Record<DecisionConsumer, number>;
  /** fail-open outcomes across every consumer. */
  failures: number;
  /** Gate decisions that skipped the call entirely (bounded, free). */
  gateSkips: number;
}

export interface DecisionLedgerSnapshot extends DecisionCounters {
  policyVersion: string;
}

export interface DecisionLedger {
  recordCall(consumer: DecisionConsumer): void;
  recordFailure(): void;
  recordGateSkip(): void;
  snapshot(): DecisionLedgerSnapshot;
}

interface DecisionLedgerState extends DecisionCounters {
  version: 1;
}

function bounded(value: number): number {
  return Math.min(MAX_DECISION_COUNT, Math.max(0, value));
}

function emptyCounters(): DecisionCounters {
  return {
    failures: 0,
    gateSkips: 0,
    calls: {
      calibration: 0,
      repeat: 0,
      rerank: 0,
    },
  };
}

function parseCounters(value: unknown): DecisionCounters {
  const counters = emptyCounters();
  if (typeof value !== "object" || value === null) return counters;
  const record = value as Record<string, unknown>;
  const calls = record.calls;
  if (typeof calls === "object" && calls !== null) {
    const callRecord = calls as Record<string, unknown>;
    for (const consumer of DECISION_CONSUMERS) {
      const count = callRecord[consumer];
      if (typeof count === "number" && Number.isFinite(count))
        counters.calls[consumer] = bounded(Math.trunc(count));
    }
  }
  if (typeof record.failures === "number" && Number.isFinite(record.failures))
    counters.failures = bounded(Math.trunc(record.failures));
  if (typeof record.gateSkips === "number" && Number.isFinite(record.gateSkips))
    counters.gateSkips = bounded(Math.trunc(record.gateSkips));
  return counters;
}

function loadState(path: string): DecisionCounters {
  if (!existsSync(path)) return emptyCounters();
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return emptyCounters();
    if (
      (
        parsed as {
          version?: unknown;
        }
      ).version !== 1
    )
      return emptyCounters();
    return parseCounters(parsed);
  } catch {
    return emptyCounters();
  }
}

function saveState(path: string, counters: DecisionCounters): void {
  const state: DecisionLedgerState = {
    ...counters,
    version: 1,
  };
  mkdirSync(dirname(path), {
    mode: 0o700,
    recursive: true,
  });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort on platforms without POSIX permissions.
  }
}

export function createDecisionLedger(statePath: string): DecisionLedger {
  const counters = loadState(statePath);

  function commit(): void {
    saveState(statePath, counters);
  }

  return {
    recordCall(consumer) {
      counters.calls[consumer] = bounded(counters.calls[consumer] + 1);
      commit();
    },
    recordFailure() {
      counters.failures = bounded(counters.failures + 1);
      commit();
    },
    recordGateSkip() {
      counters.gateSkips = bounded(counters.gateSkips + 1);
      commit();
    },
    snapshot() {
      return {
        ...counters,
        policyVersion: DECISION_POLICY_VERSION,
        calls: {
          ...counters.calls,
        },
      };
    },
  };
}

/** Read-only view for status/doctor; an absent or corrupt file reads as zero. */
export function readDecisionLedger(statePath: string): DecisionLedgerSnapshot {
  return {
    ...loadState(statePath),
    policyVersion: DECISION_POLICY_VERSION,
  };
}
