/**
 * Bounded, machine-readable outcome + reason-code contract (task 1.1).
 *
 * Every memory operation terminates in exactly one of the eight states below.
 * Failure states carry a bounded reason code from the registry; dynamic codes
 * (e.g. `prohibited-content:<classification>`) follow the `:`-suffix pattern.
 * Bodies, tokens, credentials, and query text never appear as reason codes.
 */

export const MEMORY_OUTCOMES = [
  "stored",
  "candidate",
  "rejected",
  "skipped",
  "degraded",
  "unavailable",
  "routing_rejected",
  "SLEEP_DISABLED",
] as const;

export type MemoryOutcome = (typeof MEMORY_OUTCOMES)[number];

/** Static bounded reason-code registry shared by tools, audit, and doctor. */
export const KNOWN_REASON_CODES = [
  // routing / identity
  "project-identity-required",
  "invalid-scope",
  "no-search-backend",
  "backend-degraded",
  // policy / governance
  "paused",
  "candidate-rejected",
  "candidate-not-found",
  "candidate-conflict-reported",
  "user-rejected-candidate",
  "project-bank-unavailable",
  "session-context-too-long",
  "duplicate-content",
  "missing-l0-provenance",
  // intent skip
  "ambiguous-intent",
  "missing-project-context",
  "no-explicit-intent",
  "project-fact-requires-verification",
  // sleep capability
  "sleep-disabled-by-default",
  "implicit-trigger-not-allowed",
  "dedicated-sleep-model-unsupported",
  "sleep-command-unavailable",
  "upstream-sleep-command-unavailable",
  "upstream-sleep-has-no-independent-model-entrypoint",
] as const;

export type KnownReasonCode = (typeof KNOWN_REASON_CODES)[number];

export type ReasonCode = KnownReasonCode | `prohibited-content:${string}`;

/**
 * Allowed reason codes per outcome. Empty for success states (stored,
 * candidate). `prohibited-content:*` matches any content-policy
 * classification suffix.
 */
export const OUTCOME_REASON_CODES = {
  candidate: [],
  stored: [],
  degraded: [
    "project-bank-unavailable",
    "backend-degraded",
  ],
  rejected: [
    "paused",
    "candidate-rejected",
    "candidate-not-found",
    "candidate-conflict-reported",
    "user-rejected-candidate",
    "project-bank-unavailable",
    "session-context-too-long",
    "prohibited-content:*",
  ],
  routing_rejected: [
    "project-identity-required",
    "invalid-scope",
  ],
  SLEEP_DISABLED: [
    "sleep-disabled-by-default",
    "implicit-trigger-not-allowed",
  ],
  skipped: [
    "ambiguous-intent",
    "missing-project-context",
    "no-explicit-intent",
    "project-fact-requires-verification",
    "session-context-too-long",
    "duplicate-content",
    "missing-l0-provenance",
  ],
  unavailable: [
    "no-search-backend",
    "sleep-command-unavailable",
    "upstream-sleep-command-unavailable",
    "upstream-sleep-has-no-independent-model-entrypoint",
  ],
};

const PROHIBITED_PREFIX = "prohibited-content:";

function matchesAllowed(allowed: readonly string[], reason: string): boolean {
  return allowed.some(
    (candidate) =>
      candidate === reason ||
      (candidate === "prohibited-content:*" && reason.startsWith(PROHIBITED_PREFIX)),
  );
}

export function isMemoryOutcome(value: string): value is MemoryOutcome {
  return (MEMORY_OUTCOMES as readonly string[]).includes(value);
}

/** True when `reason` is an allowed (or dynamically patterned) code for `outcome`. */
export function isReasonCodeForOutcome(
  outcome: MemoryOutcome,
  reason: string,
): boolean {
  return matchesAllowed(OUTCOME_REASON_CODES[outcome], reason);
}

/** Human-readable one-line summary for user-facing surfaces. */
export function describeOutcome(outcome: MemoryOutcome): string {
  switch (outcome) {
    case "stored":
      return "Memory stored";
    case "candidate":
      return "Memory queued for review";
    case "rejected":
      return "Memory rejected";
    case "skipped":
      return "Memory skipped";
    case "degraded":
      return "Memory captured in degraded mode";
    case "unavailable":
      return "Memory capability unavailable";
    case "routing_rejected":
      return "Memory could not be routed";
    case "SLEEP_DISABLED":
      return "Sleep disabled";
    default:
      return "Unknown memory outcome";
  }
}

/** Failure states must always carry a bounded reason code. */
export function requiresReasonCode(outcome: MemoryOutcome): boolean {
  return outcome !== "stored" && outcome !== "candidate";
}
