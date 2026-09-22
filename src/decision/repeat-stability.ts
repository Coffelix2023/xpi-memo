/**
 * Repeat-prompt stability judgment (change add-typesafe-decision-hooks,
 * task 3.x).
 *
 * Two stages, deliberately asymmetric in cost:
 * 1. a deterministically counted, model-free repeat signal over the L0 user
 *    events (task 3.1) — free, so it may run on every prompt;
 * 2. one bounded Noul call, and only once a repeat has crossed the configured
 *    threshold (task 3.2).
 *
 * A passing judgment produces a *pending* candidate. It never writes T1: the
 * existing candidate governance still decides, and a disabled or failed runner
 * behaves exactly as if this rule did not exist (task 3.3).
 */

import { createHash } from "node:crypto";
import type { RoutingContext } from "../banks.js";
import { createEvidenceRecord, type EvidenceRecord } from "../evidence.js";
import {
  generatePendingCandidate,
  type PendingCandidate,
  RATIONALE_T1_GOVERNANCE,
} from "../pending-candidate.js";
import type { DecisionLedger } from "./observability.js";
import { runDecision } from "./runner.js";
import type { DecisionRunner, DecisionStatus } from "./types.js";

/** One user prompt as read back from the L0 trace. */
export interface UserPromptRecord {
  /** 1-based L0 position, the provenance handle for a later candidate. */
  position: number;
  sessionId: string;
  text: string;
  timestamp: string;
}

export interface RepeatGroup {
  count: number;
  digest: string;
  /** Bounded, verbatim first occurrence; the candidate body when judged stable. */
  exemplar: string;
  /** Most recent occurrence, the L0 reference a candidate carries. */
  latest: UserPromptRecord;
  /** Distinct sessions the repeat spans, capped for the bounded outbound state. */
  sessionCount: number;
}

const MAX_EXEMPLAR_CHARS = 400;
const MAX_GROUP_SESSIONS = 20;

/** Jaccard similarity at or above this merges two near-identical prompts. */
const SYNONYM_SIMILARITY = 0.8;

function normalize(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter(Boolean));
}

/** Stable digest of a normalized prompt: the exact-repeat key. */
export function promptDigest(text: string): string {
  return createHash("sha256").update(normalize(text)).digest("hex").slice(0, 32);
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

interface Bucket {
  digestOf: Set<string>;
  records: UserPromptRecord[];
  tokens: Set<string>;
}

/**
 * Count same-meaning repeats deterministically. No model call, no I/O: two
 * prompts merge when their normalized digests match or their token sets are
 * near-identical.
 *
 * ponytail: O(n²) bucket merge over the bounded prompt window; swap in an
 * embedding index if the window ever grows past a few thousand prompts.
 */
export function countSynonymRepeats(
  prompts: readonly UserPromptRecord[],
  threshold: number,
): RepeatGroup[] {
  const buckets: Bucket[] = [];
  for (const record of prompts) {
    if (normalize(record.text).length === 0) continue;
    const tokens = tokensOf(normalize(record.text));
    const merged = buckets.find(
      (bucket) =>
        jaccard(bucket.tokens, tokens) >= SYNONYM_SIMILARITY ||
        bucket.digestOf.has(promptDigest(record.text)),
    );
    if (merged) {
      merged.records.push(record);
      continue;
    }
    const bucket: Bucket = {
      digestOf: new Set([
        promptDigest(record.text),
      ]),
      records: [
        record,
      ],
      tokens,
    };
    buckets.push(bucket);
  }

  return buckets
    .filter((bucket) => bucket.records.length >= threshold)
    .map((bucket) => {
      const records = [
        ...bucket.records,
      ].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
      const sessions = new Set(records.map((record) => record.sessionId));
      return {
        count: records.length,
        digest: promptDigest(records[0].text),
        exemplar: records[0].text.slice(0, MAX_EXEMPLAR_CHARS),
        latest: records.at(-1) as UserPromptRecord,
        sessionCount: Math.min(MAX_GROUP_SESSIONS, sessions.size),
      };
    })
    .sort((left, right) => right.count - left.count);
}

const STABILITY_PROMPT =
  "Is this a stable, durable user preference that should be remembered — as " +
  "opposed to a transient frustration, a repeated error report, or a question " +
  "already answered by the project state?";

export interface StabilityJudgment {
  /** Calibrated probability that the repeat is a durable preference. */
  probability: number | null;
  status: DecisionStatus;
}

/** Noul answers are directional: `no` with high confidence is low probability. */
export function noulProbability(value: string | string[], confidence: number): number {
  return value === "yes" ? confidence : 1 - confidence;
}

export interface StabilityOptions {
  enabled: boolean;
  ledger?: DecisionLedger;
  runner?: DecisionRunner;
  timeoutMs?: number;
}

/**
 * Ask once whether a repeat group is a durable preference. Never throws; an
 * unusable runner yields a null probability, which the caller treats as
 * "no candidate" rather than as "not stable but store anyway".
 */
export async function judgeRepeatStability(
  group: RepeatGroup,
  options: StabilityOptions,
): Promise<StabilityJudgment> {
  if (!options.enabled)
    return {
      probability: null,
      status: "disabled",
    };
  options.ledger?.recordCall("repeat");
  const result = await runDecision({
    enabled: true,
    questions: [
      {
        id: "stability",
        primitive: "noul",
        prompt: STABILITY_PROMPT,
        options: [
          "no",
          "yes",
        ],
      },
    ],
    ...(options.runner
      ? {
          runner: options.runner,
        }
      : {}),
    state: JSON.stringify({
      occurrences: group.count,
      prompt: group.exemplar,
      sessions: group.sessionCount,
    }),
    ...(options.timeoutMs === undefined
      ? {}
      : {
          timeoutMs: options.timeoutMs,
        }),
  });
  if (result.status !== "completed") {
    options.ledger?.recordFailure();
    return {
      probability: null,
      status: result.status,
    };
  }
  const answer = result.output.answers[0];
  if (!answer) {
    options.ledger?.recordFailure();
    return {
      probability: null,
      status: "invalid-output",
    };
  }
  return {
    probability: noulProbability(answer.value, answer.confidence),
    status: "completed",
  };
}

export interface StabilityCandidateOptions {
  context: RoutingContext;
  /** Calibrated probability threshold from config. */
  threshold: number;
}

/**
 * Turn a passed judgment into a pending candidate.
 *
 * `allowAutoStore: false` is the whole point: a repeat signal is not an
 * explicit user statement, so it can never satisfy `shouldAutoStore` and must
 * always wait for the existing candidate governance.
 */
export function stabilityCandidate(
  group: RepeatGroup,
  probability: number,
  options: StabilityCandidateOptions,
): PendingCandidate | null {
  if (probability < options.threshold) return null;
  const evidence: EvidenceRecord = createEvidenceRecord({
    confidence: probability,
    provenance: `l0:${group.latest.sessionId}#${group.latest.position}`,
    source: "repeat-signal",
    timestamp: group.latest.timestamp,
    type: "l0-conclusion",
  });
  return generatePendingCandidate({
    allowAutoStore: false,
    content: group.exemplar,
    context: options.context,
    evidence,
    kind: "global_preference",
    rationale: RATIONALE_T1_GOVERNANCE,
    reason: "high-impact-durable",
  });
}
