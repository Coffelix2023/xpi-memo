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

/**
 * Structured repository-fact verification declaration (change
 * stabilize-candidate-auto-admission). Bound to a repo-relative file, a
 * bounded verbatim excerpt and an optional revision; produced only by the
 * offline-extraction boundary and verified against the working tree.
 */
export interface RepositoryFact {
  /** Verbatim evidence excerpt (bounded, must appear in the file). */
  excerpt: string;
  /** Repo-relative path inside the current project root. */
  path: string;
  /** Optional revision the fact was true at; mismatch keeps the candidate pending. */
  revision?: string;
}

/** The subset of a pending candidate a verifier is allowed to look at. */
export interface VerificationCandidate {
  content: string;
  kind: MemoryKind;
  repositoryFact?: RepositoryFact;
}

/**
 * Outcome of the admission verification step. `verified` carries bounded
 * evidence (relative file + line + excerpt + timestamp) for the audit trail;
 * `failed` and `skipped` both leave the candidate in the pending queue —
 * only the audit entry differs.
 */
export type VerificationResult =
  | {
      excerpt: string;
      filePath: string;
      line: number;
      status: "verified";
      timestamp: string;
    }
  | {
      reason: string;
      status: "failed" | "skipped";
    };

/**
 * The single admission decision every candidate-producing entry path must
 * obtain (change stabilize-candidate-auto-admission, design Decision 1).
 */
export type AdmissionDecision = "auto-stored" | "pending" | "shadow-verified";
