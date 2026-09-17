import { createEvidenceRecord, type EvidenceType } from "./evidence.js";
import { evidenceSummary, type PendingCandidate } from "./pending-candidate.js";
import type { VerificationResult } from "./types.js";

/**
 * The only sanctioned evidence upgrade path (change
 * candidate-admission-autopilot): an offline-extraction conclusion may become
 * a tool-verified repository fact. Anything else — including "upgrading" an
 * `explicit-user-statement`, which would actually weaken it — is rejected.
 */
export const EVIDENCE_UPGRADE_WHITELIST: Partial<Record<EvidenceType, EvidenceType>> = {
  "l0-conclusion": "verified-repository-fact",
};

/**
 * Upgrade a candidate's evidence type after a passing tool verification.
 *
 * A non-verified result keeps the candidate untouched (task 4.1: failure
 * preserves the original evidence type). A candidate whose current evidence
 * type is not on the whitelist throws — the whitelist is the single guard
 * against both arbitrary conversions and `explicit-user-statement` downgrades
 * (task 4.3). Provenance/source/timestamp/confidence are carried over
 * unchanged (task 4.2).
 */
export function upgradeEvidence(
  candidate: PendingCandidate,
  verification: VerificationResult,
): PendingCandidate {
  if (verification.status !== "verified") return candidate;
  const target = EVIDENCE_UPGRADE_WHITELIST[candidate.evidence.type];
  if (!target) {
    throw new Error(`Evidence upgrade not allowed: ${candidate.evidence.type}`);
  }
  const evidence = createEvidenceRecord({
    ...candidate.evidence,
    type: target,
  });
  return {
    ...candidate,
    evidence,
    evidenceSummary: evidenceSummary(evidence),
  };
}
