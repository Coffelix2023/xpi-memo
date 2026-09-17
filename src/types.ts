/**
 * Shared admission types for the candidate auto-admission path (change
 * candidate-admission-autopilot, tasks 1.1/3.1). Kept in one place so
 * kind-routing and tool-verification can share them without cycles.
 */

import type { MemoryKind } from "./kinds.js";

/** Admission strategies a memory kind can be routed to at confirm time. */
export const KIND_ADMISSION_POLICIES = [
  "tool-verify",
  "accumulate",
  "manual-confirm",
] as const;

export type KindAdmissionPolicy = (typeof KIND_ADMISSION_POLICIES)[number];

/** The subset of a pending candidate a verifier is allowed to look at. */
export interface VerificationCandidate {
  content: string;
  kind: MemoryKind;
}

/**
 * Outcome of the admission verification step. `verified` carries bounded
 * evidence (file + matched line + timestamp) for the audit trail; `failed`
 * and `skipped` both leave the candidate in the pending queue — only the
 * audit entry differs.
 */
export type VerificationResult =
  | {
      filePath: string;
      matchedLine: string;
      status: "verified";
      timestamp: string;
    }
  | {
      reason: string;
      status: "failed" | "skipped";
    };
