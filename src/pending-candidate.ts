import { randomUUID } from "node:crypto";
import { shouldAutoStore } from "./auto-store-policy.js";
import type { RoutingContext } from "./banks.js";
import type { EvidenceRecord } from "./evidence.js";
import type { MemoryKind } from "./kinds.js";
import { routeMemoryKind } from "./routing.js";

export const PENDING_CANDIDATE_REASONS = [
  "project-decision",
  "ambiguous-preference",
  "broad-gotcha",
  "cross-project-relevance",
  "high-impact-durable",
] as const;

export type PendingCandidateReason = (typeof PENDING_CANDIDATE_REASONS)[number];

export interface PendingCandidateInput {
  content: string;
  context: RoutingContext;
  evidence: EvidenceRecord;
  explicitStable?: boolean;
  kind: MemoryKind;
  rationale: string;
  reason: PendingCandidateReason;
  verified?: boolean;
}

export interface PendingCandidate {
  conflictState: "none" | "reported";
  content: string;
  createdAt: string;
  evidence: EvidenceRecord;
  evidenceSummary: string;
  id: string;
  kind: MemoryKind;
  rationale: string;
  reason: PendingCandidateReason;
  status: "pending";
  targetBank: string;
  targetScope: "global" | "session";
}

function evidenceSummary(evidence: EvidenceRecord): string {
  return `${evidence.type} from ${evidence.source} (${evidence.provenance})`;
}

export function generatePendingCandidate(
  input: PendingCandidateInput,
): PendingCandidate | null {
  if (
    shouldAutoStore({
      contentLength: input.content.length,
      evidence: input.evidence,
      explicitStable: input.explicitStable,
      kind: input.kind,
      verified: input.verified,
    })
  ) {
    return null;
  }

  const route = routeMemoryKind(input.kind, input.context);
  return {
    conflictState: "none",
    content: input.content,
    createdAt: new Date().toISOString(),
    evidence: input.evidence,
    evidenceSummary: evidenceSummary(input.evidence),
    id: randomUUID(),
    kind: input.kind,
    rationale: input.rationale,
    reason: input.reason,
    status: "pending",
    targetBank: route.bank,
    targetScope: route.scope,
  };
}
