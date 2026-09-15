/**
 * Bounded behavior-evaluation metrics (task 5.2).
 *
 * Fixed cross-session fixtures drive governed hooks; this module projects the
 * observed outcomes onto six bounded metrics required by the
 * memory-behavior-evaluation spec:
 *
 * - preferenceAccuracy: confirmed preferences adopted when relevant
 * - scopeLeakRate: project memories influencing a foreign project
 * - falseMemoryRate: presented-as-confirmed items that were never stored
 * - correctionLatency: sessions from correction to old value leaving recall
 * - memoryUtility: injected memories that changed the eventual behavior
 * - userAwareness: outcomes the user could see via a bounded status surface
 *
 * Every counter is clamped to a bounded range and every metric is body-free:
 * the projection receives booleans/counts, never memory content. Environment
 * failures are reported through `backendAvailable` so a missing semantic
 * backend is never disguised as a logic pass (spec: backend unavailable must
 * be explicit).
 */

export interface EvalCase {
  /** True when the confirmed memory was adopted in the later session. */
  adopted: boolean;
  /** Sessions between the explicit correction and old value leaving recall. */
  correctionSessions: number | null;
  /** True when a presented item was not actually a stored/confirmed memory. */
  falseMemory: boolean;
  /** Case identifier from the fixed fixture set. */
  id: string;
  /** True when a project memory influenced a foreign project's context. */
  leaked: boolean;
  /** True when an injected memory changed the eventual behavior. */
  useful: boolean;
  /** True when the user-visible status surface reported the outcome. */
  userAware: boolean;
}

export interface BehaviorMetrics {
  /** Mean correction latency in sessions; null when no correction ran. */
  correctionLatency: number | null;
  falseMemoryRate: number;
  memoryUtility: number;
  preferenceAccuracy: number;
  scopeLeakRate: number;
  /** 0..1 share of cases with a bounded user-visible outcome. */
  userAwareness: number;
}

export interface EvaluationReport {
  backendAvailable: boolean;
  cases: number;
  metrics: BehaviorMetrics;
}

const RATE_CEILING = 1;
const MAX_LATENCY_SESSIONS = 99;
const MAX_CASES = 999;

function boundedShare(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(RATE_CEILING, Math.max(0, numerator / denominator));
}

export function computeBehaviorMetrics(cases: readonly EvalCase[]): BehaviorMetrics {
  const total = Math.min(MAX_CASES, cases.length);
  const adopted = cases.reduce((count, entry) => count + (entry.adopted ? 1 : 0), 0);
  const leaked = cases.reduce((count, entry) => count + (entry.leaked ? 1 : 0), 0);
  const falseMemory = cases.reduce(
    (count, entry) => count + (entry.falseMemory ? 1 : 0),
    0,
  );
  const latencies = cases
    .map((entry) => entry.correctionSessions)
    .filter((value): value is number => value !== null && value >= 0)
    .map((value) => Math.min(MAX_LATENCY_SESSIONS, value));
  const useful = cases.reduce((count, entry) => count + (entry.useful ? 1 : 0), 0);
  const aware = cases.reduce((count, entry) => count + (entry.userAware ? 1 : 0), 0);
  return {
    correctionLatency:
      latencies.length === 0
        ? null
        : Math.min(
            MAX_LATENCY_SESSIONS,
            latencies.reduce((sum, value) => sum + value, 0) / latencies.length,
          ),
    falseMemoryRate: boundedShare(falseMemory, total),
    memoryUtility: boundedShare(useful, total),
    preferenceAccuracy: boundedShare(adopted, total),
    scopeLeakRate: boundedShare(leaked, total),
    userAwareness: boundedShare(aware, total),
  };
}

export function buildEvaluationReport(
  cases: readonly EvalCase[],
  backendAvailable: boolean,
): EvaluationReport {
  return {
    backendAvailable,
    cases: cases.length,
    metrics: computeBehaviorMetrics(cases),
  };
}
