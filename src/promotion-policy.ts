import type { RoutingContext } from "./banks.js";
import { classifyProhibitedContent } from "./content-policy.js";
import type { EvidenceRecord } from "./evidence.js";
import type { MemoryKind } from "./kinds.js";
import { routeMemoryKind } from "./routing.js";

export interface PromotionRequest {
  content: string;
  context: RoutingContext;
  evidence: EvidenceRecord;
  explicitPromotion: boolean;
  kind: MemoryKind;
  reviewedConclusion: boolean;
  sourceLayer: "L0" | "T2";
  targetLayer: string;
  /** Canonical semantic scope (task 1.2): global / project / session. */
  targetScope: "global" | "project" | "session";
  userConfirmed: boolean;
}

export interface PromotionResult {
  accepted: boolean;
  reason?:
    | "content-not-concise"
    | "evidence-source-mismatch"
    | "explicit-promotion-required"
    | "invalid-evidence"
    | "invalid-target"
    | "provenance-required";
  targetBank?: string;
  targetKind?: MemoryKind;
  targetScope?: "global" | "project" | "session";
}

function expectedEvidenceType(
  sourceLayer: PromotionRequest["sourceLayer"],
): EvidenceRecord["type"] {
  return sourceLayer === "L0" ? "l0-conclusion" : "t2-handoff";
}

function hasValidEvidence(evidence: EvidenceRecord): boolean {
  return (
    evidence.source.trim().length > 0 &&
    evidence.provenance.trim().length > 0 &&
    Number.isFinite(evidence.confidence) &&
    evidence.confidence >= 0 &&
    evidence.confidence <= 1 &&
    !Number.isNaN(Date.parse(evidence.timestamp))
  );
}

export function validatePromotion(request: PromotionRequest): PromotionResult {
  if (
    !request.explicitPromotion ||
    !request.reviewedConclusion ||
    !request.userConfirmed
  ) {
    return {
      accepted: false,
      reason: "explicit-promotion-required",
    };
  }
  if (request.targetLayer !== "T1") {
    return {
      accepted: false,
      reason: "invalid-target",
    };
  }
  if (!hasValidEvidence(request.evidence)) {
    return {
      accepted: false,
      reason: "invalid-evidence",
    };
  }
  if (request.evidence.type !== expectedEvidenceType(request.sourceLayer)) {
    return {
      accepted: false,
      reason: "evidence-source-mismatch",
    };
  }
  if (
    classifyProhibitedContent({
      content: request.content,
    }) !== null
  ) {
    return {
      accepted: false,
      reason: "content-not-concise",
    };
  }
  let route: ReturnType<typeof routeMemoryKind>;
  try {
    route = routeMemoryKind(request.kind, request.context);
  } catch {
    return {
      accepted: false,
      reason: "invalid-target",
    };
  }
  if (route.scope !== request.targetScope) {
    return {
      accepted: false,
      reason: "invalid-target",
    };
  }
  return {
    accepted: true,
    targetBank: route.bank,
    targetKind: request.kind,
    targetScope: route.scope,
  };
}
