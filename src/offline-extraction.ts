import type { AuditLog } from "./audit.js";
import { ensureProjectBank, GLOBAL_BANK, type RoutingContext } from "./banks.js";
import type { CandidateStore } from "./candidate-lifecycle.js";
import { classifyProhibitedContent } from "./content-policy.js";
import { createEvidenceRecord, type EvidenceType } from "./evidence.js";
import type {
  ExtractionBudgetLedger,
  ExtractionBudgetLimits,
} from "./extraction-budget.js";
import { isMemoryKind, type MemoryKind } from "./kinds.js";
import type { L0Coordinator } from "./l0/l0-runtime.js";
import type { L0Event } from "./l0/types.js";
import type {
  MnemosyneAdapter,
  MnemosyneRunner,
  T1MemoryOperation,
} from "./operations.js";
import {
  generatePendingCandidate,
  type PendingCandidateReason,
} from "./pending-candidate.js";
import { routeMemoryKind } from "./routing.js";

/**
 * Gated offline extraction boundary (task 3.1).
 *
 * Provider-neutral: the runner is injected by the host (index.ts), so no
 * LLM/model dependency lives in this module. The boundary is disabled by
 * default, runs only at a bounded lifecycle point (session shutdown), and
 * never blocks or throws into the active coding path — every failure mode
 * returns a diagnostic result instead.
 */

export const DEFAULT_OFFLINE_EXTRACTION_MAX_EVENTS = 200;
export const DEFAULT_OFFLINE_EXTRACTION_MAX_INPUT_CHARS = 60_000;
export const DEFAULT_OFFLINE_EXTRACTION_TIMEOUT_MS = 15_000;
export const DEFAULT_OFFLINE_EXTRACTION_MAX_EXECUTIONS_PER_SESSION = 1;
export const DEFAULT_OFFLINE_EXTRACTION_MAX_PROPOSALS_PER_SESSION = 20;
export const DEFAULT_OFFLINE_EXTRACTION_MAX_CHARS_PER_SESSION = 5_000;

export interface OfflineExtractionRunnerInput {
  events: readonly L0Event[];
  maxInputChars: number;
  sessionId: string;
}

/**
 * Provider-neutral extraction runner. May be absent (feature unavailable) and
 * may throw or hang — the boundary converts both into diagnostics.
 */
export type OfflineExtractionRunner = (
  input: OfflineExtractionRunnerInput,
) => Promise<unknown>;

export interface OfflineExtractionOptions {
  enabled: boolean;
  events: readonly L0Event[];
  /** Per-session budget ledger; when absent, per-session budgets are not enforced. */
  ledger?: ExtractionBudgetLedger;
  limits?: ExtractionBudgetLimits;
  maxEvents: number;
  maxInputChars: number;
  runner?: OfflineExtractionRunner;
  sessionId: string;
  timeoutMs: number;
}

export type OfflineExtractionStatus =
  | "budget-exhausted"
  | "completed"
  | "disabled"
  | "failed"
  | "timed-out"
  | "unavailable";
export interface OfflineExtractionDiagnostics {
  /** Current per-session budget consumption; present when a ledger is wired. */
  budgetChars?: number;
  budgetExecutions?: number;
  budgetProposals?: number;
  events: number;
  inputChars: number;
  maxEvents: number;
  maxInputChars: number;
  status: OfflineExtractionStatus;
  timeoutMs?: number;
}

export type OfflineExtractionResult =
  | {
      diagnostics: OfflineExtractionDiagnostics;
      output: unknown;
      status: "completed";
    }
  | {
      diagnostics: OfflineExtractionDiagnostics;
      status: Exclude<OfflineExtractionStatus, "completed">;
    };

function boundedEvents(
  events: readonly L0Event[],
  maxEvents: number,
  maxInputChars: number,
): readonly L0Event[] {
  const count = Number.isInteger(maxEvents) && maxEvents > 0 ? maxEvents : 0;
  const limited = events.slice(-count);
  const limit =
    Number.isInteger(maxInputChars) && maxInputChars > 0 ? maxInputChars : 0;
  let chars = 0;
  const selected: L0Event[] = [];
  for (let index = limited.length - 1; index >= 0; index -= 1) {
    const event = limited[index] as L0Event;
    const size = Object.values(event.payload).reduce<number>(
      (total, value) => total + (typeof value === "string" ? value.length : 0),
      0,
    );
    if (chars + size > limit) break;
    selected.push(event);
    chars += size;
  }
  return selected.reverse();
}

function boundedInputChars(events: readonly L0Event[]): number {
  let chars = 0;
  for (const event of events) {
    for (const value of Object.values(event.payload)) {
      if (typeof value === "string") chars += value.length;
    }
  }
  return chars;
}

function diagnostics(
  status: OfflineExtractionStatus,
  events: readonly L0Event[],
  maxEvents: number,
  maxInputChars: number,
  timeoutMs: number,
  ledger?: ExtractionBudgetLedger,
): OfflineExtractionDiagnostics {
  const consumption = ledger?.consumption();
  return {
    ...(consumption
      ? {
          budgetChars: consumption.chars,
          budgetExecutions: consumption.executions,
          budgetProposals: consumption.proposals,
        }
      : {}),
    events: events.length,
    inputChars: boundedInputChars(events),
    maxEvents,
    maxInputChars,
    status,
    ...(timeoutMs > 0
      ? {
          timeoutMs,
        }
      : {}),
  };
}

/**
 * Run the offline extraction boundary. Never throws: disabled, unavailable,
 * timed-out, failed, and completed all return a bounded diagnostic result.
 * Only the last `maxEvents` events within `maxInputChars` are passed, and the runner must be
 * consumed through a timeout so a slow or hanging provider cannot block the
 * lifecycle point indefinitely.
 */
export async function runOfflineExtraction(
  options: OfflineExtractionOptions,
): Promise<OfflineExtractionResult> {
  if (!options.enabled) {
    return {
      diagnostics: diagnostics(
        "disabled",
        options.events,
        options.maxEvents,
        options.maxInputChars,
        options.timeoutMs,
        options.ledger,
      ),
      status: "disabled",
    };
  }

  const events = boundedEvents(
    options.events,
    options.maxEvents,
    options.maxInputChars,
  );

  if (options.ledger) {
    const limits = options.limits;
    if (
      !options.ledger.executionAllowed(
        limits ?? {
          maxCharsPerSession: DEFAULT_OFFLINE_EXTRACTION_MAX_CHARS_PER_SESSION,
          maxExecutionsPerSession:
            DEFAULT_OFFLINE_EXTRACTION_MAX_EXECUTIONS_PER_SESSION,
          maxProposalsPerSession: DEFAULT_OFFLINE_EXTRACTION_MAX_PROPOSALS_PER_SESSION,
        },
      )
    ) {
      return {
        diagnostics: diagnostics(
          "budget-exhausted",
          events,
          options.maxEvents,
          options.maxInputChars,
          options.timeoutMs,
          options.ledger,
        ),
        status: "budget-exhausted",
      };
    }
  }

  if (!options.runner) {
    return {
      diagnostics: diagnostics(
        "unavailable",
        events,
        options.maxEvents,
        options.maxInputChars,
        options.timeoutMs,
        options.ledger,
      ),
      status: "unavailable",
    };
  }

  options.ledger?.recordExecution();

  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(
      () => reject(new Error("offline-extraction-timeout")),
      options.timeoutMs,
    );
  });

  try {
    const output = await Promise.race([
      options.runner({
        events,
        maxInputChars: options.maxInputChars,
        sessionId: options.sessionId,
      }),
      timeout,
    ]);
    return {
      diagnostics: diagnostics(
        "completed",
        events,
        options.maxEvents,
        options.maxInputChars,
        options.timeoutMs,
        options.ledger,
      ),
      output,
      status: "completed",
    };
  } catch (error) {
    const timedOut =
      error instanceof Error && error.message === "offline-extraction-timeout";
    return {
      diagnostics: diagnostics(
        timedOut ? "timed-out" : "failed",
        events,
        options.maxEvents,
        options.maxInputChars,
        options.timeoutMs,
        options.ledger,
      ),
      status: timedOut ? "timed-out" : "failed",
    };
  }
}

/**
 * Normalized offline extraction proposal (task 3.2).
 *
 * Extracted content never receives `explicit-user-statement` evidence:
 * every proposal is normalized to `l0-conclusion`, the only evidence type
 * a model-derived proposal may carry. The raw runner output may claim any
 * evidence type, but that claim is discarded at the boundary.
 */
export interface OfflineExtractionProposal {
  confidence: number;
  content: string;
  evidenceType: EvidenceType;
  kind: MemoryKind;
  sourceReference: string;
}

const MAX_DIRECT_STORE_CHARS = 500;
const DIRECT_STORE_CONFIDENCE = 0.9;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteConfidence(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
  );
}

function proposalFromEntry(entry: unknown): OfflineExtractionProposal | null {
  if (!isRecord(entry)) return null;
  const content = typeof entry.content === "string" ? entry.content.trim() : "";
  const sourceReference =
    typeof entry.sourceReference === "string" ? entry.sourceReference.trim() : "";
  const kind = typeof entry.kind === "string" ? entry.kind : "";
  if (!content || !sourceReference || !isMemoryKind(kind)) return null;
  if (!isFiniteConfidence(entry.confidence)) return null;
  return {
    confidence: entry.confidence,
    content,
    // Forced: model-derived proposals can never be explicit user statements.
    evidenceType: "l0-conclusion",
    kind,
    sourceReference,
  };
}

function proposalsFromOutput(output: unknown): unknown[] {
  if (Array.isArray(output)) return output;
  if (isRecord(output) && Array.isArray(output.proposals)) return output.proposals;
  return [];
}

export interface NormalizedExtractionOutput {
  invalid: number;
  proposals: OfflineExtractionProposal[];
  proposalsTotal: number;
}

/**
 * Validate and normalize raw runner output before governance. Invalid
 * entries are skipped with a bounded count; their content never enters
 * diagnostics or audit records.
 */
export function normalizeOfflineExtractionOutput(
  output: unknown,
): NormalizedExtractionOutput {
  const rawProposals = proposalsFromOutput(output);
  const proposals: OfflineExtractionProposal[] = [];
  let invalid = 0;
  for (const entry of rawProposals) {
    const proposal = proposalFromEntry(entry);
    if (proposal) proposals.push(proposal);
    else invalid += 1;
  }
  return {
    invalid,
    proposals,
    proposalsTotal: rawProposals.length,
  };
}

export interface OfflineExtractionGovernanceRuntime {
  adapter: MnemosyneAdapter;
  audit: AuditLog;
  candidates: CandidateStore;
  config: {
    dataDir: string;
    paused: boolean;
  };
  context: RoutingContext;
  l0: L0Coordinator;
  /** Per-session budget ledger; when absent, proposal/char budgets are not enforced. */
  ledger?: ExtractionBudgetLedger;
  /** Budget limits; defaults to the module constants when omitted. */
  limits?: ExtractionBudgetLimits;
  run: MnemosyneRunner;
}

export type OfflineExtractionGovernanceResult =
  | {
      kind: MemoryKind;
      status: "stored";
      targetBank: string;
    }
  | {
      candidateId: string;
      kind: MemoryKind;
      status: "candidate";
      targetBank: string;
    }
  | {
      kind?: MemoryKind;
      reason: string;
      status: "rejected";
    };

function evidenceRecordFor(
  proposal: OfflineExtractionProposal,
): ReturnType<typeof createEvidenceRecord> {
  return createEvidenceRecord({
    confidence: proposal.confidence,
    provenance: "activation:offline-extraction",
    source: proposal.sourceReference,
    type: "l0-conclusion",
  });
}

function operationFor(
  proposal: OfflineExtractionProposal,
  runtime: OfflineExtractionGovernanceRuntime,
  evidence: ReturnType<typeof createEvidenceRecord>,
): T1MemoryOperation {
  const route = routeMemoryKind(proposal.kind, runtime.context);
  return {
    confidence: evidence.confidence,
    content: proposal.content,
    dataDir: runtime.config.dataDir,
    kind: proposal.kind,
    provenance: evidence.provenance,
    scope: route.scope,
    targetBank: route.bank,
    source: {
      evidenceType: evidence.type,
      // Session-scoped rows carry the L0 session discriminator so recall can
      // isolate current-session context from unrelated sessions (task 2.3).
      ...(proposal.kind === "session_context"
        ? {
            sessionId: runtime.l0.sessionId() ?? undefined,
          }
        : {}),
      source: evidence.source,
      timestamp: evidence.timestamp,
    },
  };
}

function shouldDirectStore(
  proposal: OfflineExtractionProposal,
  runtime: OfflineExtractionGovernanceRuntime,
): boolean {
  if (runtime.config.paused) return false;
  if (proposal.kind !== "session_context") return false;
  return (
    proposal.confidence >= DIRECT_STORE_CONFIDENCE &&
    proposal.content.length <= MAX_DIRECT_STORE_CHARS
  );
}

function pendingReasonFor(kind: MemoryKind): PendingCandidateReason {
  if (kind === "project_decision") return "project-decision";
  if (kind === "project_gotcha") return "broad-gotcha";
  return "high-impact-durable";
}

function reject(
  runtime: OfflineExtractionGovernanceRuntime,
  kind: MemoryKind | undefined,
  reason: string,
  scope: "global" | "project" | "session" | undefined,
): OfflineExtractionGovernanceResult {
  runtime.audit.record("rejection", {
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

async function directStore(
  runtime: OfflineExtractionGovernanceRuntime,
  operation: T1MemoryOperation,
): Promise<OfflineExtractionGovernanceResult> {
  runtime.l0.recordSafe("routing_decision", {
    bank: operation.targetBank,
    evidenceType: "l0-conclusion",
    kind: operation.kind,
    scope: operation.scope,
  });
  runtime.l0.recordSafe("t1_memory_write", {
    bank: operation.targetBank,
    confidence: operation.confidence,
    content: operation.content,
    evidenceType: "l0-conclusion",
    kind: operation.kind,
    scope: operation.scope,
  });
  await runtime.adapter.store(operation);
  runtime.audit.record("write", {
    bank: operation.targetBank,
    confidence: operation.confidence,
    evidenceType: "l0-conclusion",
    kind: operation.kind,
    scope: operation.scope,
    status: "stored",
  });
  return {
    kind: operation.kind,
    status: "stored",
    targetBank: operation.targetBank,
  };
}

function addCandidate(
  proposal: OfflineExtractionProposal,
  runtime: OfflineExtractionGovernanceRuntime,
  operation: T1MemoryOperation,
): OfflineExtractionGovernanceResult {
  const candidate = generatePendingCandidate({
    allowAutoStore: false,
    content: operation.content,
    context: runtime.context,
    evidence: evidenceRecordFor(proposal),
    kind: operation.kind,
    rationale: "Proposed by offline extraction; requires T1 write governance.",
    reason: pendingReasonFor(operation.kind),
    verified: false,
  });
  if (!candidate) {
    return reject(runtime, operation.kind, "candidate-unavailable", operation.scope);
  }
  const added = runtime.candidates.add(candidate, operation);
  runtime.audit.record("candidate", {
    bank: candidate.targetBank,
    evidenceType: "l0-conclusion",
    kind: candidate.kind,
    reason: candidate.reason,
    scope: candidate.targetScope,
    status: added.status,
  });
  if (added.status === "rejected")
    return reject(
      runtime,
      candidate.kind,
      added.reason ?? "candidate-rejected",
      candidate.targetScope,
    );
  return {
    candidateId: candidate.id,
    kind: candidate.kind,
    status: "candidate",
    targetBank: candidate.targetBank,
  };
}

/**
 * Govern normalized extraction proposals (task 3.2): prohibited content is
 * rejected, everything else routes to direct storage or the candidate
 * lifecycle by confidence and risk. Never blocks and never throws into the
 * caller for a single bad proposal.
 */
export async function governOfflineExtractionOutput(
  output: unknown,
  runtime: OfflineExtractionGovernanceRuntime,
): Promise<OfflineExtractionGovernanceResult[]> {
  const { proposals } = normalizeOfflineExtractionOutput(output);
  const results: OfflineExtractionGovernanceResult[] = [];
  const limits = runtime.limits ?? {
    maxCharsPerSession: DEFAULT_OFFLINE_EXTRACTION_MAX_CHARS_PER_SESSION,
    maxExecutionsPerSession: DEFAULT_OFFLINE_EXTRACTION_MAX_EXECUTIONS_PER_SESSION,
    maxProposalsPerSession: DEFAULT_OFFLINE_EXTRACTION_MAX_PROPOSALS_PER_SESSION,
  };
  for (const proposal of proposals) {
    if (runtime.ledger) {
      const consumption = runtime.ledger.consumption();
      const charsExceeded =
        consumption.chars + proposal.content.length > limits.maxCharsPerSession;
      const proposalsExceeded = consumption.proposals >= limits.maxProposalsPerSession;
      if (charsExceeded || proposalsExceeded) {
        results.push(reject(runtime, proposal.kind, "budget-exhausted", undefined));
        break;
      }
    }
    const classification = classifyProhibitedContent({
      content: proposal.content,
    });
    if (classification) {
      results.push(
        reject(
          runtime,
          proposal.kind,
          `prohibited-content:${classification}`,
          undefined,
        ),
      );
      runtime.ledger?.recordProposals(1, proposal.content.length);
      continue;
    }
    let operation: T1MemoryOperation;
    try {
      const evidence = evidenceRecordFor(proposal);
      operation = operationFor(proposal, runtime, evidence);
    } catch {
      results.push(
        reject(runtime, proposal.kind, "missing-project-context", undefined),
      );
      runtime.ledger?.recordProposals(1, proposal.content.length);
      continue;
    }
    const bankReady =
      operation.targetBank === GLOBAL_BANK ||
      (await ensureProjectBank(runtime.context, runtime.run));
    if (!bankReady) {
      results.push(
        reject(runtime, proposal.kind, "project-bank-unavailable", operation.scope),
      );
      runtime.ledger?.recordProposals(1, proposal.content.length);
      continue;
    }
    if (shouldDirectStore(proposal, runtime)) {
      results.push(await directStore(runtime, operation));
    } else {
      results.push(addCandidate(proposal, runtime, operation));
    }
    runtime.ledger?.recordProposals(1, proposal.content.length);
  }
  return results;
}
