import type { EvidenceRecord } from "./evidence.js";
import type { MemoryKind } from "./kinds.js";

export interface AutoStorePolicyInput {
  contentLength?: number;
  evidence: EvidenceRecord;
  explicitStable?: boolean;
  kind: MemoryKind;
  verified?: boolean;
}

const MAX_SESSION_CONTEXT_LENGTH = 500;

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

  if (input.kind === "project_gene" || input.kind === "project_constraint") {
    return (
      input.verified === true &&
      (input.evidence.type === "verified-repository-fact" ||
        input.evidence.type === "verified-tool-result")
    );
  }

  return false;
}
