import type { EvidenceRecord } from "./evidence.js";
import type { MemoryKind } from "./kinds.js";

export interface AutoStorePolicyInput {
  contentLength?: number;
  evidence: EvidenceRecord;
  explicitStable?: boolean;
  kind: MemoryKind;
}

const MAX_SESSION_CONTEXT_LENGTH = 500;

/**
 * Direct-store policy for the existing non-verified paths (change
 * stabilize-candidate-auto-admission, design Decision 1): session context by
 * length, explicit preference/workflow by user-statement evidence. Project
 * facts are NOT decided here — every project candidate goes through the
 * candidate store's single admission decision.
 */
export function shouldAutoStore(input: AutoStorePolicyInput): boolean {
  if (input.kind === "session_context") {
    return (
      input.contentLength !== undefined &&
      input.contentLength <= MAX_SESSION_CONTEXT_LENGTH
    );
  }

  if (input.kind === "global_preference" || input.kind === "global_workflow") {
    return (
      input.explicitStable === true && input.evidence.type === "explicit-user-statement"
    );
  }

  return false;
}
