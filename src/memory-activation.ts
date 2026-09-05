import type { AuditLog } from "./audit.js";
import type { RoutingContext } from "./banks.js";
import type { CandidateStore } from "./candidate-lifecycle.js";
import { classifyProhibitedContent } from "./content-policy.js";
import {
  createEvidenceRecord,
  type EvidenceType,
  evidenceTypeForProvenance,
} from "./evidence.js";
import type { L0Coordinator } from "./l0/l0-runtime.js";
import type { MemoryIdempotencyStore } from "./memory-idempotency.js";
import {
  extractExplicitMemoryIntent,
  type MemoryIntentResult,
  type MemoryIntentSkipReason,
} from "./memory-intent.js";
import type { MnemosyneAdapter, T1MemoryOperation } from "./operations.js";
import { generatePendingCandidate } from "./pending-candidate.js";
import { routeMemoryKind } from "./routing.js";

export type MemoryActivationResult =
  | {
      bank: string;
      kind: T1MemoryOperation["kind"];
      scope: T1MemoryOperation["scope"];
      status: "stored";
    }
  | {
      bank: string;
      candidateId: string;
      kind: T1MemoryOperation["kind"];
      scope: T1MemoryOperation["scope"];
      status: "candidate";
    }
  | {
      kind?: T1MemoryOperation["kind"];
      reason: string;
      status: "rejected";
    }
  | {
      reason: MemoryIntentSkipReason | "duplicate-content" | "missing-l0-provenance";
      status: "skipped";
    };

export interface MemoryActivationProvenance {
  eventPosition: number;
  sessionId: string;
  source: string;
}
export interface MemoryActivationRuntime {
  adapter: MnemosyneAdapter;
  audit: AuditLog;
  candidates: CandidateStore;
  config: {
    dataDir: string;
    paused: boolean;
  };
  context: RoutingContext;
  idempotency: MemoryIdempotencyStore;
  l0: L0Coordinator;
  provenance?: MemoryActivationProvenance;
}

function skipResult(
  runtime: MemoryActivationRuntime,
  result: Extract<
    MemoryIntentResult,
    {
      type: "skip";
    }
  >,
): MemoryActivationResult {
  // Task 4.3: a project-kind intent in a directory without project identity
  // must leave bounded routing-rejection evidence instead of a silent skip.
  if (result.reason === "missing-project-context" && result.kind) {
    runtime.audit.record("rejection", {
      identity: runtime.context.identity,
      kind: result.kind,
      reason: result.reason,
      scope: "project",
      status: "routing_rejected",
    });
    runtime.l0.recordSafe("routing_rejected", {
      identity: runtime.context.identity,
      kind: result.kind,
      outcome: "routing_rejected",
      reason: result.reason,
      scope: "project",
    });
  }
  return {
    reason: result.reason,
    status: "skipped",
  };
}

function pendingReason(
  kind: T1MemoryOperation["kind"],
):
  | "ambiguous-preference"
  | "broad-gotcha"
  | "high-impact-durable"
  | "project-decision"
  | "cross-project-relevance" {
  if (kind === "project_decision") return "project-decision";
  if (kind === "project_gotcha") return "broad-gotcha";
  if (kind === "project_constraint") return "cross-project-relevance";
  return "high-impact-durable";
}

function operationFor(
  content: string,
  kind: T1MemoryOperation["kind"],
  runtime: MemoryActivationRuntime,
  provenance: MemoryActivationProvenance | undefined,
): T1MemoryOperation {
  const route = routeMemoryKind(kind, runtime.context);
  const evidenceType = evidenceTypeForProvenance(provenance);
  const evidence = createEvidenceRecord({
    confidence: 1,
    provenance: "activation:explicit-user-intent",
    source: "explicit-user-intent",
    type: evidenceType,
  });
  return {
    confidence: evidence.confidence,
    content,
    dataDir: runtime.config.dataDir,
    kind,
    provenance: evidence.provenance,
    scope: route.scope,
    targetBank: route.bank,
    source: {
      evidenceType: evidence.type,
      // Session-scoped rows carry the L0 session discriminator so recall can
      // isolate current-session context from unrelated sessions (task 2.3).
      ...(kind === "session_context" && provenance?.sessionId
        ? {
            sessionId: provenance.sessionId,
          }
        : {}),
      source: evidence.source,
      timestamp: evidence.timestamp,
    },
  };
}

function rejected(
  runtime: MemoryActivationRuntime,
  kind: T1MemoryOperation["kind"] | undefined,
  reason: string,
  scope: T1MemoryOperation["scope"] | undefined,
  evidenceType?: EvidenceType,
): MemoryActivationResult {
  runtime.audit.record("rejection", {
    ...(evidenceType
      ? {
          evidenceType,
        }
      : {}),
    ...(kind
      ? {
          kind,
        }
      : {}),
    reason,
    ...(scope
      ? {
          scope,
        }
      : {}),
    identity: runtime.context.identity,
    status: "rejected",
  });
  runtime.l0.recordSafe("memory_failed", {
    ...(kind
      ? {
          kind,
        }
      : {}),
    reason,
    ...(scope
      ? {
          scope,
        }
      : {}),
    identity: runtime.context.identity,
    outcome: "rejected",
    phase: "policy",
  });
  return {
    ...(kind
      ? {
          kind,
        }
      : {}),
    reason,
    status: "rejected",
  };
}

function hasValidProvenance(
  provenance: MemoryActivationProvenance | undefined,
): provenance is MemoryActivationProvenance {
  return (
    provenance !== undefined &&
    Number.isInteger(provenance.eventPosition) &&
    provenance.eventPosition > 0 &&
    provenance.sessionId.trim().length > 0 &&
    provenance.source.trim().length > 0
  );
}

function provenancePayload(
  provenance: MemoryActivationProvenance,
): Record<string, unknown> {
  return {
    source: provenance.source,
    sourceEventPosition: provenance.eventPosition,
    sourceSessionId: provenance.sessionId,
  };
}
/** Route explicit user intent through the existing T1 governance path. */
export async function activateExplicitMemoryIntent(
  text: string,
  runtime: MemoryActivationRuntime,
  provenance: MemoryActivationProvenance | undefined = runtime.provenance,
): Promise<MemoryActivationResult> {
  const intent = extractExplicitMemoryIntent(text, runtime.context);
  if (intent.type === "skip") return skipResult(runtime, intent);
  const operation = operationFor(intent.content, intent.kind, runtime, provenance);
  const classification = classifyProhibitedContent({
    content: operation.content,
  });
  if (classification) {
    return rejected(
      runtime,
      operation.kind,
      `prohibited-content:${classification}`,
      operation.scope,
      operation.source.evidenceType,
    );
  }

  const evidence = createEvidenceRecord({
    confidence: operation.confidence,
    provenance: operation.provenance,
    source: operation.source.source,
    timestamp: operation.source.timestamp,
    type: operation.source.evidenceType,
  });
  const candidate = generatePendingCandidate({
    content: operation.content,
    context: runtime.context,
    evidence,
    explicitStable:
      operation.kind === "global_preference" || operation.kind === "global_workflow",
    kind: operation.kind,
    rationale: "This memory requires T1 write governance before persistence.",
    reason: pendingReason(operation.kind),
    verified: false,
  });

  if (!hasValidProvenance(provenance)) {
    return {
      reason: "missing-l0-provenance",
      status: "skipped",
    };
  }
  if (!candidate && runtime.config.paused) {
    return rejected(
      runtime,
      operation.kind,
      "paused",
      operation.scope,
      operation.source.evidenceType,
    );
  }
  const claim = runtime.idempotency.claim({
    content: operation.content,
    eventPosition: provenance.eventPosition,
    kind: operation.kind,
    sessionId: provenance.sessionId,
    source: provenance.source,
  });
  if (!claim.claimed) {
    return {
      reason: "duplicate-content",
      status: "skipped",
    };
  }
  if (candidate) {
    const added = runtime.candidates.add(candidate, operation);
    runtime.l0.recordSafe("candidate_created", {
      ...provenancePayload(provenance),
      bank: candidate.targetBank,
      candidateId: candidate.id,
      evidenceType: operation.source.evidenceType,
      fingerprint: claim.fingerprint,
      kind: candidate.kind,
      reason: candidate.reason,
      scope: candidate.targetScope,
    });
    runtime.audit.record("candidate", {
      bank: candidate.targetBank,
      evidenceType: operation.source.evidenceType,
      kind: candidate.kind,
      reason: candidate.reason,
      scope: candidate.targetScope,
      status: added.status,
    });
    if (added.status === "rejected") {
      return rejected(
        runtime,
        candidate.kind,
        added.reason ?? "candidate-rejected",
        candidate.targetScope,
        operation.source.evidenceType,
      );
    }
    return {
      bank: candidate.targetBank,
      candidateId: candidate.id,
      kind: candidate.kind,
      scope: candidate.targetScope,
      status: "candidate",
    };
  }

  runtime.l0.recordSafe("routing_decision", {
    ...provenancePayload(provenance),
    bank: operation.targetBank,
    evidenceType: operation.source.evidenceType,
    fingerprint: claim.fingerprint,
    kind: operation.kind,
    projectBank: runtime.context.projectBank,
    scope: operation.scope,
  });
  const stored = await runtime.adapter.store(operation);
  runtime.l0.recordSafe("t1_memory_write", {
    ...provenancePayload(provenance),
    bank: operation.targetBank,
    confidence: operation.confidence,
    content: operation.content,
    evidenceType: operation.source.evidenceType,
    fingerprint: claim.fingerprint,
    ...(stored.id
      ? {
          memoryId: stored.id,
        }
      : {}),
    kind: operation.kind,
    scope: operation.scope,
  });
  runtime.audit.record("write", {
    bank: operation.targetBank,
    confidence: operation.confidence,
    evidenceType: operation.source.evidenceType,
    kind: operation.kind,
    scope: operation.scope,
    status: "stored",
  });
  return {
    bank: operation.targetBank,
    kind: operation.kind,
    scope: operation.scope,
    status: "stored",
  };
}
