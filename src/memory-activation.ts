import { createHash } from "node:crypto";
import type { AuditLog } from "./audit.js";
import type { RoutingContext } from "./banks.js";
import type { CandidateStore } from "./candidate-lifecycle.js";
import { classifyProhibitedContent } from "./content-policy.js";
import { calibrateEvidenceConfidence } from "./decision/calibration.js";
import type { DecisionLedger } from "./decision/observability.js";
import type { DecisionRunner } from "./decision/types.js";
import { upsertDnaEntry } from "./dna/ingest.ts";
import { detectDnaDomains } from "./dna/inject.ts";
import { DNA_DOMAINS, type DnaDomain } from "./dna/schema.ts";
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
import {
  generatePendingCandidate,
  RATIONALE_T1_GOVERNANCE,
} from "./pending-candidate.js";
import { routeMemoryKind } from "./routing.js";
import { runT1Write } from "./t1-lifecycle.js";

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
      domain: DnaDomain;
      id: string;
      status: "dna";
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
  /**
   * Optional confidence calibration (task 4.x). Absent or
   * `calibrate: false` keeps the extracted confidence untouched.
   */
  decision?: {
    calibrate?: boolean;
    ledger?: DecisionLedger;
    runner?: DecisionRunner;
  };
  /** Project root + trust verdict for the DNA domain split; absent = T1 only. */
  dna?: {
    cwd: string;
    trusted: boolean;
  };
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
function dnaIntentId(content: string): string {
  return `user-${createHash("sha256").update(content).digest("hex").slice(0, 16)}`;
}

/**
 * DNA domain split (change add-dna-project-domain-memory, tasks 5.1/5.2).
 * An explicit, durable statement that lands in exactly one DNA domain is
 * written to .pi/DNA.yaml with user-statement provenance instead of creating
 * a T1 candidate. Every other case — untrusted project, no field wired, no
 * domain hit, both domains, session-scoped content — returns null so the
 * caller falls through to the existing T1 governance path unchanged.
 */
function routeToDna(
  intent: Extract<
    MemoryIntentResult,
    {
      type: "memory";
    }
  >,
  runtime: MemoryActivationRuntime,
): MemoryActivationResult | null {
  if (!runtime.dna?.trusted) return null;
  if (intent.kind === "session_context") return null;
  const domains = detectDnaDomains(intent.content);
  const hits = DNA_DOMAINS.filter((domain) => domains[domain]);
  if (hits.length !== 1) return null;
  const domain = hits[0];
  const write = upsertDnaEntry({
    cwd: runtime.dna.cwd,
    domain,
    trusted: true,
    entry: {
      confidence: "high",
      id: dnaIntentId(intent.content),
      semantic: intent.content.slice(0, 4000),
      source: "user-authored",
    },
  });
  if (write.status === "stored")
    return {
      domain,
      id: write.id,
      status: "dna",
    };
  // In-domain safety/schema rejection is terminal: never double-store to T1.
  return {
    reason: `dna-${write.reason}`,
    status: "rejected",
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
  const dnaOutcome = routeToDna(intent, runtime);
  if (dnaOutcome) return dnaOutcome;
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

  // Task 4.x: calibration may replace only `confidence` and the provenance
  // mark. When it is off or unavailable the record is returned unchanged, so
  // this call cannot alter admission behaviour.
  const evidence = await calibrateEvidenceConfidence(
    createEvidenceRecord({
      confidence: operation.confidence,
      provenance: operation.provenance,
      source: operation.source.source,
      timestamp: operation.source.timestamp,
      type: operation.source.evidenceType,
    }),
    operation.content,
    {
      enabled: runtime.decision?.calibrate === true,
      ...(runtime.decision?.ledger
        ? {
            ledger: runtime.decision.ledger,
          }
        : {}),
      ...(runtime.decision?.runner
        ? {
            runner: runtime.decision.runner,
          }
        : {}),
    },
  );
  const candidate = generatePendingCandidate({
    content: operation.content,
    context: runtime.context,
    evidence,
    explicitStable:
      operation.kind === "global_preference" || operation.kind === "global_workflow",
    kind: operation.kind,
    rationale: RATIONALE_T1_GOVERNANCE,
    reason: pendingReason(operation.kind),
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

  const lifecycle = await runT1Write({
    adapter: runtime.adapter,
    l0: runtime.l0,
    operation,
    requestPayload: {
      ...provenancePayload(provenance),
      evidenceType: operation.source.evidenceType,
      fingerprint: claim.fingerprint,
      projectBank: runtime.context.projectBank,
    },
  });
  if (lifecycle.status !== "stored") {
    return {
      reason: lifecycle.reason ?? lifecycle.status,
      status: "rejected",
    };
  }
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
