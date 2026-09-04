import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type Static, type TSchema, Type } from "typebox";
import { type AuditLog, createAuditLog } from "./audit.ts";
import {
  bankDbPath,
  bankExists,
  ensureProjectBank,
  GLOBAL_BANK,
  type RoutingContext,
} from "./banks.ts";
import { buildCandidateDigest, renderCandidateDigest } from "./candidate-digest.ts";
import { type CandidateStore, createCandidateStore } from "./candidate-lifecycle.ts";
import { l0Status } from "./cli/l0.js";
import { loadConfig, saveUserConfig } from "./config.ts";
import { openConsole } from "./console.ts";
import { classifyProhibitedContent } from "./content-policy.ts";
import {
  buildMemoryDoctorReport,
  detectMemoryRootSurfaces,
  type MemoryDoctorReport,
} from "./doctor.ts";
import { createEvidenceRecord } from "./evidence.ts";
import {
  createExtractionBudgetLedger,
  type ExtractionBudgetLimits,
} from "./extraction-budget.ts";
import { clearFooterStatus, setFooterStatus } from "./footer.ts";
import { resolveProjectIdentity } from "./identity.ts";
import { isMemoryKind, MEMORY_KINDS, type MemoryKind } from "./kinds.ts";
import { createEventLogReader } from "./l0/event-log-reader.js";
import { sessionsDirFor } from "./l0/l0-runtime.js";
import { createL0Coordinator, type L0Coordinator } from "./l0/l0-runtime.ts";
import { sessionDirFor } from "./l0/session-manager.js";
import type { L0Event } from "./l0/types.js";
import {
  initializeLocalProject,
  LOCAL_PROJECT_METADATA_DIR,
  resolveLocalProjectIdentity,
} from "./local-identity.ts";
import { exportMarkdown, validateExport } from "./markdown-export/exporter.js";
import {
  activateExplicitMemoryIntent,
  type MemoryActivationProvenance,
} from "./memory-activation.ts";
import {
  contentFingerprint,
  createMemoryIdempotencyStore,
  type MemoryIdempotencyStore,
} from "./memory-idempotency.ts";
import { buildObservabilitySnapshot } from "./observability.ts";
import {
  DEFAULT_OFFLINE_EXTRACTION_MAX_CHARS_PER_SESSION,
  DEFAULT_OFFLINE_EXTRACTION_MAX_EVENTS,
  DEFAULT_OFFLINE_EXTRACTION_MAX_EXECUTIONS_PER_SESSION,
  DEFAULT_OFFLINE_EXTRACTION_MAX_INPUT_CHARS,
  DEFAULT_OFFLINE_EXTRACTION_MAX_PROPOSALS_PER_SESSION,
  DEFAULT_OFFLINE_EXTRACTION_TIMEOUT_MS,
  governOfflineExtractionOutput,
  normalizeOfflineExtractionOutput,
  type OfflineExtractionRunner,
  runOfflineExtraction,
} from "./offline-extraction.ts";
import {
  createMnemosyneAdapter,
  type MnemosyneRunner,
  type T1MemoryOperation,
} from "./operations.ts";
import {
  generatePendingCandidate,
  type PendingCandidate,
  type PendingCandidateReason,
} from "./pending-candidate.ts";
import type { RecallItem, RecallResponse } from "./recall.ts";
import { decideRecall, type RecallPolicy } from "./recall-policy.ts";
import { rankRecallResults } from "./recall-ranking.ts";
import { loadRegistry, registryPath } from "./registry.ts";
import {
  detectOrphanBanks,
  discoverRepoExport,
  exportProjectMemory,
  reimportRepoExport,
  repoMemoryDir,
} from "./repo-export.ts";
import { RoutingRejectionError, routeMemoryKind } from "./routing.ts";
import { createSearchRuntime } from "./search/runtime.ts";
import type { SearchOutcome } from "./search/selector.ts";
import {
  inspectSleepCapability,
  type SleepCapabilityResult,
} from "./sleep-capability.ts";
import { executeSleep } from "./sleep-execution.ts";
import { formatSourceTrace, traceCandidate, traceMemoryEvent } from "./source-trace.ts";
import {
  formatStatusJson,
  type MemoryStatus,
  renderStatus,
  todayStored,
  visibleBankDiskBytes,
} from "./status.ts";
import { openStatusPanel } from "./status-panel.ts";
import { createMemorySurface, successText } from "./surface.ts";
import { renderCallLine, renderToolLine } from "./tool-rendering.ts";

const SLEEP_COMMAND_PATTERN = /^\s*sleep\s+/m;
type ToolStatus =
  | "candidate"
  | "deleted"
  | "error"
  | "executed"
  | "recalled"
  | "rejected"
  | "routing_rejected"
  | "skipped"
  | "stored";

interface ToolDetails {
  /** Backend execution state for recall (task 3.3):
   * backend-not-run vs backend-queried-no-hits vs backend-queried-with-hits. */
  backendState?:
    | "backend-not-run"
    | "backend-queried-no-hits"
    | "backend-queried-with-hits";
  bank?: string;
  candidateId?: string;
  id?: string | null;
  kind?: MemoryKind;
  /** Actual sleep execution mode (task 3.4). */
  mode?: string;
  queriedBanks?: string[];
  reason?: string;
  recovery?: {
    agent: string;
    cli: string;
    tui: string;
  };
  resultCount?: number;
  scope?: "global" | "project" | "session";
  status: ToolStatus;
}
export interface XpiMemoDependencies {
  env?: NodeJS.ProcessEnv;
  offlineExtractionRunner?: OfflineExtractionRunner;
  resolveProjectIdentity?: (
    cwd: string,
  ) => Pick<
    NonNullable<ReturnType<typeof resolveProjectIdentity>>,
    "id" | "label"
  > | null;
  run?: MnemosyneRunner;
}

interface Runtime {
  adapter: ReturnType<typeof createMnemosyneAdapter>;
  audit: AuditLog;
  candidates: CandidateStore;
  config: ReturnType<typeof loadConfig>["config"];
  context: RoutingContext;
  idempotency: MemoryIdempotencyStore;
  l0: L0Coordinator;
  run: MnemosyneRunner;
  search: ReturnType<typeof createSearchRuntime>;
}

const AUTO_EXPORT_DEBOUNCE_MS = 500;
const autoExportTimers = new Map<string, NodeJS.Timeout>();

function scheduleAutoExport(
  config: ReturnType<typeof loadConfig>["config"],
  env: NodeJS.ProcessEnv | undefined,
): void {
  if (!config.autoExport || !config.l0Enabled) return;
  const existing = autoExportTimers.get(config.dataDir);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    autoExportTimers.delete(config.dataDir);
    void exportMarkdown({
      env,
      filters: {
        excludeToolResults: config.excludeToolResults,
        privacy: config.privacy,
      },
    }).catch(() => {
      // Auto-export is best effort and must not block memory writes.
    });
  }, AUTO_EXPORT_DEBOUNCE_MS);
  timer.unref?.();
  autoExportTimers.set(config.dataDir, timer);
}

function clearAutoExportTimer(dataDir: string): void {
  const timer = autoExportTimers.get(dataDir);
  if (!timer) return;
  clearTimeout(timer);
  autoExportTimers.delete(dataDir);
}

interface InputProvenance extends MemoryActivationProvenance {
  text: string;
}

function toolResult(details: ToolDetails, text: string) {
  return {
    content: [
      {
        text,
        type: "text" as const,
      },
    ],
    details,
  };
}

/**
 * Bounded failure reason: one line, control chars stripped, capped length.
 * Never includes memory bodies, tokens, or credentials (task 3.1/3.2).
 */
function boundedFailureReason(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : String(error ?? "memory-write-failed");
  const singleLine = raw.replace(/[\r\n\t]+/g, " ").trim();
  return singleLine.slice(0, 120) || "memory-write-failed";
}

/**
 * Record a pre-candidate routing rejection in audit + L0 (task 3.1).
 * Body-free: kind, scope, reason code, identity state, outcome only.
 */
function recordRoutingRejection(
  runtime: Runtime,
  kind: MemoryKind | undefined,
  scope: "global" | "project" | "session" | undefined,
  reason: string,
): void {
  runtime.audit.record("rejection", {
    ...(kind
      ? {
          kind,
        }
      : {}),
    ...(scope
      ? {
          scope,
        }
      : {}),
    reason,
    identity: runtime.context.identity,
    status: "routing_rejected",
  });
  runtime.l0.recordSafe("routing_rejected", {
    ...(kind
      ? {
          kind,
        }
      : {}),
    ...(scope
      ? {
          scope,
        }
      : {}),
    reason,
    identity: runtime.context.identity,
    outcome: "routing_rejected",
  });
}

/**
 * Record a governed failure (policy rejection / degraded / storage failure).
 * Body-free; outcome picks the audit action (rejection / fallback).
 */
function recordMemoryFailure(
  runtime: Runtime,
  fields: {
    bank?: string;
    kind?: MemoryKind;
    outcome: "rejected" | "degraded";
    phase: "policy" | "candidate" | "backend" | "storage";
    reason: string;
    scope?: "global" | "project" | "session";
  },
): void {
  const action = fields.outcome === "degraded" ? "fallback" : "rejection";
  runtime.audit.record(action, {
    ...(fields.kind
      ? {
          kind: fields.kind,
        }
      : {}),
    ...(fields.scope
      ? {
          scope: fields.scope,
        }
      : {}),
    ...(fields.bank
      ? {
          bank: fields.bank,
        }
      : {}),
    identity: runtime.context.identity,
    outcome: fields.outcome,
    reason: fields.reason,
    status: fields.outcome,
  });
  runtime.l0.recordSafe("memory_failed", {
    ...(fields.kind
      ? {
          kind: fields.kind,
        }
      : {}),
    ...(fields.scope
      ? {
          scope: fields.scope,
        }
      : {}),
    identity: runtime.context.identity,
    outcome: fields.outcome,
    phase: fields.phase,
    reason: fields.reason,
  });
}

function realTool<TParams extends TSchema>(
  name: string,
  label: string,
  description: string,
  parameters: TParams,
  execute: (
    params: Static<TParams>,
    ctx: ExtensionContext,
    toolCallId: string,
  ) => Promise<ReturnType<typeof toolResult>>,
): ToolDefinition<TParams, ToolDetails> {
  return {
    name,
    label,
    description,
    parameters,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const surface = createMemorySurface(ctx);
      let action: "store" | "recall" | undefined;
      if (name === "xpi_memo_remember") action = "store";
      else if (name === "xpi_memo_recall") action = "recall";
      if (action) surface.begin(action);
      try {
        const result = await execute(params, ctx, _toolCallId);
        if (action) {
          if (
            result.details.status === "stored" ||
            result.details.status === "recalled"
          )
            surface.complete(action, result.details.resultCount);
          else if (result.details.status === "error") surface.fail();
          else surface.clear();
        }
        if (result.details.status === "stored" || result.details.status === "recalled")
          setFooterStatus(ctx, loadConfig().config.paused, true);
        return result;
      } catch (error) {
        if (action) surface.fail();
        throw error;
      }
    },
    renderCall(_args, theme) {
      return renderCallLine(name, theme);
    },
    renderResult(result, _options, theme) {
      return renderToolLine(result.details as ToolDetails, theme);
    },
  };
}

function createRuntime(
  cwd: string,
  dependencies: XpiMemoDependencies,
  l0Override?: L0Coordinator,
  idempotencyOverride?: MemoryIdempotencyStore,
): Runtime {
  const configResult = loadConfig({
    env: dependencies.env,
  });
  const gitProject = (dependencies.resolveProjectIdentity ?? resolveProjectIdentity)(
    cwd,
  );
  const localProject = gitProject ? null : resolveLocalProjectIdentity(cwd);
  const project = gitProject ?? localProject;
  let identity: "git" | "local" | "none";
  if (gitProject) identity = "git";
  else if (localProject) identity = "local";
  else identity = "none";
  const context: RoutingContext = {
    dataDir: configResult.config.dataDir,
    identity,
    projectBank: project ? `project-${project.id}` : null,
  };
  const run =
    dependencies.run ??
    (async (args, options) => {
      const { runMnemosyne } = await import("./cli.ts");
      return runMnemosyne(args, options);
    });
  const adapter = createMnemosyneAdapter(run);
  const audit = createAuditLog({
    statePath: join(configResult.config.dataDir, "audit.json"),
  });
  const l0 =
    l0Override ??
    createL0Coordinator({
      dataDir: configResult.config.dataDir,
      enabled: configResult.config.l0Enabled,
    });
  const candidates = createCandidateStore({
    adapter,
    statePath: join(configResult.config.dataDir, "candidates.json"),
    afterStore() {
      scheduleAutoExport(configResult.config, dependencies.env);
    },
    beforeStore(operation) {
      l0.record("t1_memory_write", {
        bank: operation.targetBank,
        confidence: operation.confidence,
        content: operation.content,
        evidenceType: operation.source.evidenceType,
        fingerprint: contentFingerprint(operation.content),
        kind: operation.kind,
        scope: operation.scope,
      });
    },
  });
  const idempotency =
    idempotencyOverride ??
    createMemoryIdempotencyStore({
      statePath: join(configResult.config.dataDir, "idempotency.json"),
    });
  const search = createSearchRuntime(context, configResult.config.searchBackend, run);
  return {
    adapter,
    audit,
    candidates,
    config: configResult.config,
    context,
    idempotency,
    l0,
    run,
    search,
  };
}

async function runOfflineExtractionForLifecycle(
  cwd: string,
  config: ReturnType<typeof loadConfig>["config"],
  dependencies: XpiMemoDependencies,
  l0: L0Coordinator,
  audit: AuditLog,
  trigger: "session_shutdown" | "session_before_compact",
): Promise<void> {
  const sessionId = l0.sessionId();
  if (!sessionId) return;
  const ledger = createExtractionBudgetLedger({
    sessionId,
    statePath: join(config.dataDir, "extraction-budget.json"),
  });
  const limits: ExtractionBudgetLimits = {
    maxCharsPerSession: DEFAULT_OFFLINE_EXTRACTION_MAX_CHARS_PER_SESSION,
    maxExecutionsPerSession: DEFAULT_OFFLINE_EXTRACTION_MAX_EXECUTIONS_PER_SESSION,
    maxProposalsPerSession: DEFAULT_OFFLINE_EXTRACTION_MAX_PROPOSALS_PER_SESSION,
  };
  if (!ledger.executionAllowed(limits)) {
    audit.record("extraction", {
      budgetRejectedCount: 1,
      candidateCount: 0,
      invalidProposals: 0,
      proposalsTotal: 0,
      reason: "budget-exhausted",
      rejectedCount: 0,
      status: "budget-exhausted",
      storedCount: 0,
      trigger,
    });
    return;
  }
  const current = l0.currentPosition();
  const consumedThrough = ledger.consumedThrough();
  if (current <= consumedThrough) return;
  const from = Math.max(
    consumedThrough,
    current - DEFAULT_OFFLINE_EXTRACTION_MAX_EVENTS,
  );
  const reader = createEventLogReader({
    sessionDir: sessionDirFor(config.dataDir, sessionId),
  });
  const events = (await reader.readAfter(from)).slice(
    -DEFAULT_OFFLINE_EXTRACTION_MAX_EVENTS,
  );
  if (events.length === 0) {
    ledger.recordConsumedThrough(current);
    return;
  }
  const result = await runOfflineExtraction({
    enabled: true,
    events,
    ledger,
    limits,
    maxEvents: DEFAULT_OFFLINE_EXTRACTION_MAX_EVENTS,
    maxInputChars: DEFAULT_OFFLINE_EXTRACTION_MAX_INPUT_CHARS,
    runner: dependencies.offlineExtractionRunner,
    sessionId,
    timeoutMs: DEFAULT_OFFLINE_EXTRACTION_TIMEOUT_MS,
  });
  const extractionCounts = {
    budgetRejectedCount: 0,
    candidateCount: 0,
    invalidProposals: 0,
    proposalsTotal: 0,
    rejectedCount: 0,
    storedCount: 0,
    validProposals: 0,
  };
  if (result.status === "completed") {
    const normalized = normalizeOfflineExtractionOutput(result.output);
    extractionCounts.proposalsTotal = normalized.proposalsTotal;
    extractionCounts.validProposals = normalized.proposals.length;
    extractionCounts.invalidProposals = normalized.invalid;
    const runtime = createRuntime(cwd, dependencies, l0);
    const governed = await governOfflineExtractionOutput(result.output, {
      adapter: runtime.adapter,
      audit,
      candidates: runtime.candidates,
      context: runtime.context,
      config: {
        dataDir: runtime.config.dataDir,
        paused: runtime.config.paused,
      },
      l0,
      ledger,
      limits,
      run: runtime.run,
    });
    for (const outcome of governed) {
      if (outcome.status === "stored") extractionCounts.storedCount += 1;
      else if (outcome.status === "candidate") extractionCounts.candidateCount += 1;
      else if (outcome.reason === "budget-exhausted")
        extractionCounts.budgetRejectedCount += 1;
      else extractionCounts.rejectedCount += 1;
    }
  }
  const lastEvent = events.at(-1);
  if (lastEvent) ledger.recordConsumedThrough(lastEvent.position);
  audit.record("extraction", {
    ...extractionCounts,
    ...(result.status === "budget-exhausted"
      ? {
          budgetRejectedCount: 1,
        }
      : {}),
    reason: result.status,
    status: result.status,
    trigger,
  });
}

function pendingReasonFor(kind: MemoryKind): PendingCandidateReason {
  if (kind === "project_decision") return "project-decision";
  if (kind === "project_gotcha") return "broad-gotcha";
  return "high-impact-durable";
}

type CandidateDecision = "store" | "later" | "reject";

const CANDIDATE_COPY = {
  en: {
    later: "Later",
    reject: "Reject",
    store: "Store",
    title: (kind: string, bank: string) => `Store ${kind} in ${bank}?`,
  },
  zh: {
    later: "稍后",
    reject: "拒绝",
    store: "存储",
    title: (kind: string, bank: string) => `将 ${kind} 存入 ${bank}?`,
  },
} as const;

/**
 * Three-way candidate confirmation (Design Decision 3): Store / Later / Reject.
 * Non-TUI modes queue the candidate and never block on a dialog.
 * `force` is for the Pending-tab review path, which always shows the panel.
 */
async function chooseCandidateAction(
  ctx: ExtensionContext,
  candidate: PendingCandidate,
  config: Runtime["config"],
  force = false,
): Promise<CandidateDecision> {
  if (ctx.mode !== "tui") return "later";
  if (!force && !config.confirmStore) return "store";
  const copy = CANDIDATE_COPY[config.language];
  const title = [
    copy.title(candidate.kind, candidate.targetBank),
    candidate.evidenceSummary,
  ].join("\n");
  const choice = await ctx.ui.select(title, [
    copy.store,
    copy.later,
    copy.reject,
  ]);
  if (choice === copy.store) return "store";
  if (choice === copy.reject) return "reject";
  return "later";
}

function operationFor(
  params: RememberParams,
  runtime: Runtime,
  provenance?: MemoryActivationProvenance,
): T1MemoryOperation {
  const kindValue = params.kind;
  if (!isMemoryKind(kindValue)) {
    throw new Error(`Unsupported memory kind: ${kindValue}`);
  }
  const evidence = createEvidenceRecord({
    confidence: 1,
    provenance: "pi:xpi_memo_remember",
    source: params.source?.trim() || "xpi_memo_remember",
    // Agent tool input: model-constructed content never counts as a user
    // statement, even when the provenance points at a user event.
    type: "verified-tool-result",
  });
  const route = routeMemoryKind(kindValue, runtime.context);
  return {
    confidence: evidence.confidence,
    content: params.content,
    dataDir: runtime.config.dataDir,
    kind: kindValue,
    provenance: evidence.provenance,
    scope: route.scope,
    targetBank: route.bank,
    source: {
      evidenceType: evidence.type,
      // Session-scoped rows carry the L0 session discriminator so recall can
      // isolate current-session context from unrelated sessions (task 2.3).
      ...(kindValue === "session_context" && provenance?.sessionId
        ? {
            sessionId: provenance.sessionId,
          }
        : {}),
      source: evidence.source,
      timestamp: evidence.timestamp,
    },
  };
}

const rememberParameters = Type.Object({
  content: Type.String({
    description: "Candidate memory content",
  }),
  kind: Type.Union(
    MEMORY_KINDS.map((kind) => Type.Literal(kind)),
    {
      description: "T1 memory kind (required, closed enum)",
    },
  ),
  source: Type.Optional(
    Type.String({
      description: "Evidence source",
    }),
  ),
});
type RememberParams = Static<typeof rememberParameters>;

async function executeRemember(
  params: RememberParams,
  ctx: ExtensionContext,
  dependencies: XpiMemoDependencies,
  l0Override?: L0Coordinator,
  idempotencyOverride?: MemoryIdempotencyStore,
  provenance?: MemoryActivationProvenance,
) {
  let runtime: Runtime | null = null;
  try {
    runtime = createRuntime(ctx.cwd, dependencies, l0Override, idempotencyOverride);
    const operation = operationFor(params, runtime, provenance);
    const evidenceType = operation.source.evidenceType;
    const evidence = {
      confidence: operation.confidence,
      provenance: operation.provenance,
      source: operation.source.source,
      timestamp: operation.source.timestamp,
      type: operation.source.evidenceType,
    };
    const classification = classifyProhibitedContent({
      content: operation.content,
    });
    if (classification) {
      const reason = `prohibited-content:${classification}`;
      runtime.audit.record("rejection", {
        evidenceType,
        kind: operation.kind,
        reason,
        identity: runtime.context.identity,
        scope: operation.scope,
        status: "rejected",
      });
      runtime.l0.recordSafe("memory_failed", {
        kind: operation.kind,
        reason,
        identity: runtime.context.identity,
        outcome: "rejected",
        phase: "policy",
        scope: operation.scope,
      });
      return toolResult(
        {
          kind: operation.kind,
          reason,
          scope: operation.scope,
          status: "rejected",
        },
        `Memory rejected: ${classification}.`,
      );
    }
    if (operation.kind === "session_context" && operation.content.length > 500) {
      const reason = "session-context-too-long";
      runtime.audit.record("rejection", {
        evidenceType,
        kind: operation.kind,
        reason,
        identity: runtime.context.identity,
        scope: operation.scope,
        status: "rejected",
      });
      runtime.l0.recordSafe("memory_failed", {
        kind: operation.kind,
        reason,
        identity: runtime.context.identity,
        outcome: "rejected",
        phase: "policy",
        scope: operation.scope,
      });
      return toolResult(
        {
          kind: operation.kind,
          reason,
          scope: operation.scope,
          status: "rejected",
        },
        "Memory rejected: session context exceeds 500 characters.",
      );
    }

    const fingerprint = contentFingerprint(operation.content);
    const candidate = generatePendingCandidate({
      content: operation.content,
      context: runtime.context,
      explicitStable:
        operation.kind === "global_preference" || operation.kind === "global_workflow",
      kind: operation.kind,
      rationale: "This memory requires T1 write governance before persistence.",
      reason: pendingReasonFor(operation.kind),
      verified: false,
      evidence,
    });
    if (!candidate && runtime.config.paused) {
      const reason = "paused";
      runtime.audit.record("rejection", {
        evidenceType,
        kind: operation.kind,
        reason,
        identity: runtime.context.identity,
        scope: operation.scope,
        status: "rejected",
      });
      runtime.l0.recordSafe("memory_failed", {
        kind: operation.kind,
        reason,
        identity: runtime.context.identity,
        outcome: "rejected",
        phase: "policy",
        scope: operation.scope,
      });
      return toolResult(
        {
          bank: operation.targetBank,
          kind: operation.kind,
          reason,
          scope: operation.scope,
          status: "rejected",
        },
        "Memory rejected: T1 is paused.",
      );
    }

    const claim = provenance
      ? runtime.idempotency.claim({
          content: operation.content,
          eventPosition: provenance.eventPosition,
          kind: operation.kind,
          sessionId: provenance.sessionId,
          source: provenance.source,
        })
      : null;
    if (claim && !claim.claimed) {
      return toolResult(
        {
          kind: operation.kind,
          reason: "duplicate-content",
          scope: operation.scope,
          status: "skipped",
        },
        "Memory already captured for this session.",
      );
    }
    if (candidate) {
      const added = runtime.candidates.add(candidate, operation);
      runtime.l0.recordSafe("candidate_created", {
        ...(provenance
          ? {
              source: provenance.source,
              sourceEventPosition: provenance.eventPosition,
              sourceSessionId: provenance.sessionId,
            }
          : {}),
        fingerprint,
        bank: candidate.targetBank,
        evidenceType,
        candidateId: candidate.id,
        kind: candidate.kind,
        reason: candidate.reason,
        scope: candidate.targetScope,
      });
      runtime.audit.record("candidate", {
        bank: candidate.targetBank,
        evidenceType,
        kind: candidate.kind,
        reason: candidate.reason,
        scope: candidate.targetScope,
        status: added.status,
      });
      if (added.status === "rejected") {
        return toolResult(
          {
            bank: candidate.targetBank,
            kind: candidate.kind,
            reason: added.reason,
            scope: candidate.targetScope,
            status: "rejected",
          },
          "Memory candidate was rejected.",
        );
      }
      if (runtime.config.paused) {
        return toolResult(
          {
            bank: candidate.targetBank,
            candidateId: candidate.id,
            kind: candidate.kind,
            scope: candidate.targetScope,
            status: "candidate",
          },
          "Memory candidate queued while T1 is paused.",
        );
      }
      const decision = await chooseCandidateAction(ctx, candidate, runtime.config);
      if (decision === "later") {
        return toolResult(
          {
            bank: candidate.targetBank,
            candidateId: candidate.id,
            kind: candidate.kind,
            scope: candidate.targetScope,
            status: "candidate",
          },
          JSON.stringify({
            candidateId: candidate.id,
            kind: candidate.kind,
            status: "candidate",
          }),
        );
      }
      if (decision === "reject") {
        const rejected = await runtime.candidates.reject(candidate.id);
        runtime.l0.recordSafe("candidate_rejected", {
          bank: candidate.targetBank,
          candidateId: candidate.id,
          evidenceType,
          kind: candidate.kind,
          reason: rejected.reason,
          scope: candidate.targetScope,
        });
        runtime.audit.record("rejection", {
          bank: candidate.targetBank,
          evidenceType,
          kind: candidate.kind,
          reason: rejected.reason,
          scope: candidate.targetScope,
          status: rejected.status,
        });
        return toolResult(
          {
            bank: candidate.targetBank,
            candidateId: candidate.id,
            kind: candidate.kind,
            reason: rejected.reason,
            scope: candidate.targetScope,
            status: "rejected",
          },
          JSON.stringify({
            candidateId: candidate.id,
            status: "rejected",
          }),
        );
      }
      if (
        operation.targetBank !== GLOBAL_BANK &&
        !(await ensureProjectBank(runtime.context, runtime.run))
      ) {
        recordMemoryFailure(runtime, {
          bank: candidate.targetBank,
          kind: candidate.kind,
          outcome: "degraded",
          phase: "storage",
          reason: "project-bank-unavailable",
          scope: candidate.targetScope,
        });
        return toolResult(
          {
            bank: candidate.targetBank,
            candidateId: candidate.id,
            kind: candidate.kind,
            reason: "project-bank-unavailable",
            scope: candidate.targetScope,
            status: "error",
          },
          "Project bank is unavailable; memory was not stored. Run /xpi-memo-init in a Git project or initialize this directory.",
        );
      }
      const stored = await runtime.candidates.confirm(candidate.id);
      runtime.l0.recordSafe("candidate_confirmed", {
        bank: candidate.targetBank,
        evidenceType,
        candidateId: candidate.id,
        kind: candidate.kind,
        scope: candidate.targetScope,
      });
      runtime.audit.record("confirmation", {
        bank: candidate.targetBank,
        evidenceType,
        kind: candidate.kind,
        reason: stored.reason,
        scope: candidate.targetScope,
        status: stored.status,
      });
      return toolResult(
        {
          bank: candidate.targetBank,
          candidateId: candidate.id,
          kind: candidate.kind,
          reason: stored.reason,
          scope: candidate.targetScope,
          status: stored.status === "stored" ? "stored" : "rejected",
        },
        JSON.stringify({
          candidateId: candidate.id,
          kind: candidate.kind,
          status: stored.status,
        }),
      );
    }

    if (
      operation.targetBank !== GLOBAL_BANK &&
      !(await ensureProjectBank(runtime.context, runtime.run))
    ) {
      runtime.audit.record("fallback", {
        bank: operation.targetBank,
        evidenceType,
        identity: runtime.context.identity,
        kind: operation.kind,
        reason: "project-bank-unavailable",
        scope: operation.scope,
        status: "degraded",
      });
      runtime.l0.recordSafe("memory_failed", {
        bank: operation.targetBank,
        identity: runtime.context.identity,
        kind: operation.kind,
        outcome: "degraded",
        phase: "storage",
        reason: "project-bank-unavailable",
        scope: operation.scope,
      });
      return toolResult(
        {
          bank: operation.targetBank,
          kind: operation.kind,
          reason: "project-bank-unavailable",
          scope: operation.scope,
          status: "error",
        },
        "Project bank is unavailable; memory was not stored.",
      );
    }

    runtime.l0.recordSafe("routing_decision", {
      ...(provenance
        ? {
            source: provenance.source,
            sourceEventPosition: provenance.eventPosition,
            sourceSessionId: provenance.sessionId,
          }
        : {}),
      fingerprint,
      bank: operation.targetBank,
      evidenceType,
      kind: operation.kind,
      projectBank: runtime.context.projectBank,
      scope: operation.scope,
    });
    // Dual-write: L0 first (source of truth); abort the operation if it fails.
    runtime.l0.record("t1_memory_write", {
      ...(provenance
        ? {
            source: provenance.source,
            sourceEventPosition: provenance.eventPosition,
            sourceSessionId: provenance.sessionId,
          }
        : {}),
      fingerprint,
      bank: operation.targetBank,
      evidenceType,
      confidence: operation.confidence,
      content: operation.content,
      kind: operation.kind,
      scope: operation.scope,
    });
    const stored = await runtime.adapter.store(operation);
    scheduleAutoExport(runtime.config, dependencies.env);
    runtime.audit.record("write", {
      bank: operation.targetBank,
      confidence: operation.confidence,
      evidenceType,
      kind: operation.kind,
      scope: operation.scope,
      status: "stored",
    });
    return toolResult(
      {
        bank: operation.targetBank,
        id: stored.id,
        kind: operation.kind,
        scope: operation.scope,
        status: "stored",
      },
      JSON.stringify({
        bank: operation.targetBank,
        id: stored.id,
        kind: operation.kind,
        scope: operation.scope,
        status: "stored",
      }),
    );
  } catch (error) {
    if (error instanceof RoutingRejectionError) {
      if (runtime)
        recordRoutingRejection(runtime, params.kind, error.scope, error.reason);
      return toolResult(
        {
          kind: params.kind,
          reason: error.reason,
          recovery: error.recovery,
          scope: error.scope,
          status: "routing_rejected",
        },
        `Memory could not be routed: ${error.message}`,
      );
    }
    const failureReason = boundedFailureReason(error);
    if (
      runtime &&
      !(error instanceof Error && error.message.startsWith("Unsupported memory kind"))
    )
      recordMemoryFailure(runtime, {
        kind: params.kind,
        outcome: "degraded",
        phase: "backend",
        reason: failureReason,
      });
    return toolResult(
      {
        reason: failureReason,
        status: "error",
      },
      `Memory write failed: ${failureReason}. Check the T1 backend (mnemosyne) or xpi_memo configuration.`,
    );
  }
}

const recallParameters = Type.Object({
  limit: Type.Optional(
    Type.Integer({
      maximum: 50,
      minimum: 1,
    }),
  ),
  query: Type.String({
    description: "Recall query",
  }),
});
type RecallParams = Static<typeof recallParameters>;

/**
 * Convert a pluggable-search outcome into the legacy RecallResponse shape so
 * tool output and KV-stable injection stay backend-agnostic (spec).
 */
function toRecallResponse(outcome: SearchOutcome): RecallResponse {
  return {
    queriedBanks: outcome.queriedBanks,
    results: outcome.results.map((result) => ({
      bank: result.source.bank ?? "default",
      content:
        result.content.length > 500
          ? `${result.content.slice(0, 500)}…`
          : result.content,
      id: result.id ?? null,
      kind: result.kind ?? null,
      // Canonical scope from the backend result (task 2.4): session rows are
      // labeled session, project rows project — never a physical bank name.
      scope:
        result.scope ??
        (result.sessionId ? "session" : (result.source.bank ?? "default")),
      score: result.score,
      ...(result.confidence !== undefined
        ? {
            confidence: result.confidence,
          }
        : {}),
      ...(result.timestamp
        ? {
            timestamp: result.timestamp,
          }
        : {}),
      ...(result.supersededBy !== undefined
        ? {
            supersededBy: result.supersededBy,
          }
        : {}),
      provenance: {
        bank: result.source.bank ?? "default",
        layer: "T1",
        source: "mnemosyne",
      },
    })),
    retrieval: {
      embeddingAvailable: outcome.backendName === "mnemosyne",
      fallback: outcome.backendName !== "mnemosyne",
      mode: "hybrid",
    },
  };
}

async function executeRecall(
  params: RecallParams,
  ctx: ExtensionContext,
  dependencies: XpiMemoDependencies,
  l0?: L0Coordinator,
) {
  try {
    const runtime = createRuntime(ctx.cwd, dependencies);
    const limit = params.limit ?? runtime.config.limit;
    // Phase 4: search backend chain (configured → mnemosyne → ripgrep → qmd).
    const outcome = await runtime.search.runSearch({
      limit,
      query: params.query,
      scope: runtime.context.projectBank ? "project" : "global",
      sessionId: l0?.sessionId() ?? undefined,
    });
    if (outcome.backendName === null) {
      // Spec: no backend available → empty results + warning, session continues.
      // Distinguish backend-not-run from backend-queried-no-hits (task 3.3).
      runtime.audit.record("recall", {
        backend: "none",
        reason: "no-search-backend",
        resultCount: 0,
        status: "no-backend",
      });
      const empty: RecallResponse = {
        queriedBanks: [],
        results: [],
        retrieval: {
          embeddingAvailable: false,
          fallback: true,
          mode: "hybrid",
        },
      };
      return toolResult(
        {
          backendState: "backend-not-run",
          reason: "no-search-backend",
          resultCount: 0,
          status: "recalled",
        },
        JSON.stringify({
          ...empty,
          warning: outcome.warning,
        }),
      );
    }
    const response: RecallResponse = toRecallResponse(outcome);
    runtime.audit.record("recall", {
      backend: outcome.backendName,
      fallback: outcome.backendName !== "mnemosyne",
      reason: params.query,
      resultCount: response.results.length,
      status: response.results.length > 0 ? "recalled" : "no-hits",
    });
    return toolResult(
      {
        backendState:
          response.results.length > 0
            ? "backend-queried-with-hits"
            : "backend-queried-no-hits",
        queriedBanks: response.queriedBanks,
        reason:
          outcome.warning ??
          (response.retrieval.fallback ? "fts5-fallback" : undefined),
        resultCount: response.results.length,
        status: "recalled",
      },
      JSON.stringify({
        ...response,
        searchBackend: outcome.backendName,
      }),
    );
  } catch (error) {
    const failureReason = boundedFailureReason(error);
    return toolResult(
      {
        reason: failureReason,
        status: "error",
      },
      `Memory recall failed: ${failureReason}. Check xpi_memo.searchBackend or installed backends.`,
    );
  }
}
const sleepParameters = Type.Object({
  authorized: Type.Boolean({
    description: "Explicit user authorization",
  }),
});
type SleepParams = Static<typeof sleepParameters>;

async function capabilityForSleep(
  runtime: Runtime,
  authorized: boolean,
): Promise<SleepCapabilityResult> {
  if (!authorized) {
    return {
      dedicatedModelSupported: false,
      reason: "upstream-sleep-command-unavailable",
      sleepCommandSupported: false,
    };
  }
  try {
    const help = await runtime.run(
      [
        "--help",
      ],
      {
        dataDir: runtime.config.dataDir,
      },
    );
    return inspectSleepCapability({
      commandHelp: help,
      sourceSummary: "mnemosyne --help",
    });
  } catch {
    return {
      dedicatedModelSupported: false,
      reason: "upstream-sleep-command-unavailable",
      sleepCommandSupported: false,
    };
  }
}

async function executeSleepTool(
  params: SleepParams,
  ctx: ExtensionContext,
  dependencies: XpiMemoDependencies,
) {
  try {
    const runtime = createRuntime(ctx.cwd, dependencies);
    const sleepMode = runtime.config.sleepMode;
    // Fail closed (task 5.1): no configured mode means the CLI is never probed
    // or invoked — the diagnostic names the missing configuration.
    const capability: SleepCapabilityResult =
      sleepMode === undefined || sleepMode === "disabled" || sleepMode === "mechanical"
        ? {
            dedicatedModelSupported: false,
            reason: "upstream-sleep-command-unavailable",
            sleepCommandSupported: false,
          }
        : await capabilityForSleep(runtime, params.authorized);
    const env = dependencies.env ?? process.env;
    const dedicatedModel = env.XPI_MEMO_SLEEP_MODEL?.trim() || undefined;
    const result = await executeSleep(
      {
        authorization: {
          authorized: params.authorized,
          trigger: "explicit-user",
        },
        capability,
        dedicatedModel,
        sleepMode: runtime.config.sleepMode,
      },
      (args) =>
        runtime.run(args, {
          dataDir: runtime.config.dataDir,
        }),
      sleepMode === "mechanical"
        ? async () => {
            const exported = await exportMarkdown({
              env,
              memoryOnly: true,
            });
            const near = exported.duplicates.near;
            if (near > 0)
              runtime.audit.record("extraction", {
                candidateCount: near,
                mode: "mechanical",
                reason: "near-duplicate",
                status: "reported",
              });
          }
        : undefined,
    );
    runtime.audit.record("sleep-authorization", {
      mode: result.mode,
      reason: result.reason,
      status: result.executed ? "executed" : "rejected",
      trigger: "explicit-user",
    });
    let text: string;
    if (result.executed) {
      text = `Sleep completed (mode: ${result.mode}).`;
    } else if (result.mode === "disabled") {
      text = `Sleep not executed: ${result.reason}.`;
    } else {
      text =
        `Sleep not executed: ${result.reason} (mode: ${result.mode}). ` +
        "SLEEP_DISABLED: no dedicated sleep model or fallback is configured.";
    }
    return toolResult(
      {
        mode: result.mode,
        reason: result.reason,
        status: result.executed ? "executed" : "rejected",
      },
      text,
    );
  } catch (error) {
    const failureReason = boundedFailureReason(error);
    return toolResult(
      {
        reason: failureReason,
        status: "error",
      },
      `Sleep failed: ${failureReason}. Check the mnemosyne CLI and xpi_memo sleep configuration.`,
    );
  }
}

/** Snapshot available backends + configured preference for /xpi-memo-status. */
async function searchStatusFor(
  config: ReturnType<typeof loadConfig>["config"],
): Promise<{
  active: string | null;
  backends: Array<{
    capabilities: {
      fullText: boolean;
      semantic: boolean;
      vector: boolean;
    };
    installed: boolean;
    name: string;
  }>;
}> {
  const { backendNames } = await import("./search/runtime.ts");
  const { createSearchRuntime } = await import("./search/runtime.ts");
  const search = createSearchRuntime(
    {
      dataDir: config.dataDir,
      projectBank: null,
    },
    config.searchBackend,
    async () => "",
  );
  const backends = await Promise.all(
    backendNames(config.searchBackend).map(async (name) => {
      const backend = search.registry.get(name);
      if (!backend)
        return {
          installed: false,
          capabilities: {
            fullText: false,
            semantic: false,
            vector: false,
          },
          name,
        };
      const capabilities = backend.capabilities();
      return {
        installed: capabilities.installed,
        name: backend.name,
        capabilities: {
          fullText: capabilities.fullText,
          semantic: capabilities.semantic,
          vector: capabilities.vector,
        },
      };
    }),
  );
  const availability = await Promise.all(
    search.registry.all().map(async (backend) => ({
      available: await backend.isAvailable(),
      backend,
    })),
  );
  const active = availability.find((entry) => entry.available)?.backend.name ?? null;
  return {
    active,
    backends,
  };
}

/** Count t1_memory_write events across all L0 sessions (read-only). */
async function countL0T1WriteEvents(dataDir: string): Promise<number> {
  const sessionsRoot = sessionsDirFor(dataDir);
  let entries: string[] = [];
  try {
    entries = readdirSync(sessionsRoot);
  } catch {
    return 0;
  }
  const perSession = await Promise.all(
    entries.map(async (entry) => {
      try {
        const reader = createEventLogReader({
          sessionDir: join(sessionsRoot, entry),
        });
        return (await reader.readByType("t1_memory_write")).length;
      } catch {
        // Unreadable session dir contributes zero events (read-only doctor).
        return 0;
      }
    }),
  );
  return perSession.reduce((sum, count) => sum + count, 0);
}

async function statusForContext(
  cwd: string,
  dependencies: XpiMemoDependencies = {},
): Promise<MemoryStatus> {
  const config = loadConfig({
    env: dependencies.env,
  }).config;
  const gitProject = (dependencies.resolveProjectIdentity ?? resolveProjectIdentity)(
    cwd,
  );
  const localProject = gitProject ? null : resolveLocalProjectIdentity(cwd);
  const project = gitProject ?? localProject;
  const run =
    dependencies.run ??
    (async (args, options) => {
      const { runMnemosyne } = await import("./cli.ts");
      return runMnemosyne(args, options);
    });
  const stats = async (bank?: string) => {
    try {
      const output = await run(
        [
          "stats",
        ],
        {
          bank,
          dataDir: config.dataDir,
        },
      );
      const { parseStats } = await import("./cli.ts");
      return parseStats(output);
    } catch {
      return null;
    }
  };
  const globalStats = await stats();
  const projectBank = project ? `project-${project.id}` : null;
  const projectStats =
    projectBank && bankExists(config.dataDir, projectBank)
      ? await stats(projectBank)
      : null;
  // Task 5.1: capability probing happens only when a sleep mode is configured;
  // an unconfigured/disabled mode reports SLEEP_DISABLED without touching the CLI.
  const sleepMode = config.sleepMode;
  let sleepCommandSupported = false;
  if (sleepMode !== "disabled" && sleepMode !== "mechanical") {
    try {
      const help = await run(
        [
          "--help",
        ],
        {
          dataDir: config.dataDir,
        },
      );
      sleepCommandSupported = SLEEP_COMMAND_PATTERN.test(help);
    } catch {
      // Status reports unavailable CLI capability conservatively.
    }
  }
  const audit = createAuditLog({
    statePath: join(config.dataDir, "audit.json"),
  });
  const auditEntries = audit.list();
  const recentEntries = auditEntries.slice(-5).map((entry) => ({
    action: entry.action,
    bank: entry.metadata.bank,
    kind: entry.metadata.kind,
    scope: entry.metadata.scope,
    status: entry.metadata.status,
    timestamp: entry.timestamp,
  }));
  // Backend execution state from the most recent recall audit entry (task 3.3).
  const lastExtraction = [
    ...auditEntries.filter((entry) => entry.action === "extraction"),
  ].at(-1);
  const lastRecall = [
    ...auditEntries.filter((entry) => entry.action === "recall"),
  ].at(-1);
  let backendState:
    | "backend-not-run"
    | "backend-queried-no-hits"
    | "backend-queried-with-hits"
    | undefined;
  if (!lastRecall) {
    backendState = undefined;
  } else if (lastRecall.metadata.status === "no-backend") {
    backendState = "backend-not-run";
  } else if (
    lastRecall.metadata.status === "no-hits" ||
    (lastRecall.metadata.resultCount ?? 0) === 0
  ) {
    backendState = "backend-queried-no-hits";
  } else {
    backendState = "backend-queried-with-hits";
  }
  const pendingCandidates = createCandidateStore({
    adapter: createMnemosyneAdapter(run),
    statePath: join(config.dataDir, "candidates.json"),
  }).list().length;
  const globalDbPath = bankDbPath(config.dataDir, GLOBAL_BANK);
  const projectDbPath = projectBank ? bankDbPath(config.dataDir, projectBank) : null;
  const storage = {
    dataDir: config.dataDir,
    files: {
      audit: existsSync(join(config.dataDir, "audit.json")),
      candidates: existsSync(join(config.dataDir, "candidates.json")),
      globalDb: existsSync(globalDbPath),
      projectDb: projectDbPath ? existsSync(projectDbPath) : false,
    },
  };
  // Task 6.4: read-only orphan bank report. Known banks come from the
  // local project registry (when present) plus the current project.
  const configHome =
    (dependencies.env ?? process.env).XDG_CONFIG_HOME?.trim() ||
    join(homedir(), ".config");
  const knownBanks = [
    ...(projectBank
      ? [
          projectBank,
        ]
      : []),
    ...Object.values(loadRegistry(registryPath(configHome)).projects).map(
      (entry) => entry.bank,
    ),
  ];
  const orphans = detectOrphanBanks({
    currentBank: projectBank,
    dataDir: config.dataDir,
    knownBanks,
  });
  // Doctor (task 4.3): read-only evidence bundle + empty-memory classification.
  const bankRows: Record<string, number | null> = {
    default: globalStats?.total ?? null,
  };
  if (projectBank && bankExists(config.dataDir, projectBank))
    bankRows[projectBank] = projectStats?.working ?? null;
  const l0T1WriteEvents = await countL0T1WriteEvents(config.dataDir);
  const doctor: MemoryDoctorReport = buildMemoryDoctorReport(
    {
      auditActions: auditEntries.map((entry) => entry.action),
      auditEntries: auditEntries.map((entry) => ({
        action: entry.action,
        resultCount: entry.metadata.resultCount,
      })),
      auditStatuses: auditEntries.map((entry) => entry.metadata.status),
      bankRows,
      l0T1WriteEvents,
      pendingCandidates,
    },
    detectMemoryRootSurfaces(config.dataDir),
  );
  return renderStatus({
    currentProject: project
      ? {
          bank: projectBank as string,
          id: project.id,
          label: project.label,
        }
      : null,
    doctor,
    diskBytes: visibleBankDiskBytes(config.dataDir, projectBank),
    fallback: auditEntries.some(
      (entry) => entry.action === "fallback" && entry.metadata.status === "degraded",
    ),
    observability: buildObservabilitySnapshot(auditEntries),
    offlineExtraction: {
      enabled: config.offlineExtractionEnabled,
      ...(lastExtraction?.metadata.status
        ? {
            lastStatus: lastExtraction.metadata.status,
          }
        : {}),
    },
    ...(lastExtraction?.metadata.reason === "near-duplicate"
      ? {
          nearDuplicates: {
            count: lastExtraction.metadata.candidateCount ?? 0,
          },
        }
      : {}),
    ...(orphans.length > 0
      ? {
          orphans,
        }
      : {}),
    paused: config.paused,
    todayStored: todayStored(auditEntries),
    counts: {
      global: globalStats?.total ?? null,
      project: projectStats?.working ?? null,
      session: null,
    },
    pendingCandidates,
    provenance: "evidence-linked",
    recall: {
      ...(backendState
        ? {
            backendState,
          }
        : {}),
      queriedBanks: projectBank
        ? [
            projectBank,
            "default",
          ]
        : [
            "default",
          ],
      scope: project ? "current-project-plus-global" : "global-only",
    },
    recentEntries,
    search: await searchStatusFor(config),
    sleep: (() => {
      // Task 5.1: the status names the actual configured mode and capability.
      if (sleepMode === "disabled" || sleepMode === undefined) {
        return {
          dedicatedModelSupported: false,
          enabled: false,
          mode: "disabled",
          reason: "sleep-mode-not-configured",
          sleepCommandSupported: false,
          state: "SLEEP_DISABLED",
        };
      }
      if (sleepMode === "mechanical") {
        return {
          dedicatedModelSupported: false,
          enabled: true,
          mode: "mechanical",
          sleepCommandSupported: false,
          state: "READY",
        };
      }
      if (!sleepCommandSupported) {
        return {
          dedicatedModelSupported: false,
          enabled: true,
          mode: "none",
          reason: "sleep-command-unavailable",
          sleepCommandSupported: false,
          state: "UNAVAILABLE",
        };
      }
      return {
        dedicatedModelSupported: false,
        enabled: true,
        mode: sleepMode,
        sleepCommandSupported: true,
        state: "READY",
      };
    })(),
    retrieval: {
      embeddingAvailable: null,
      mode: "hybrid",
    },
    storage,
    tiers: {
      L0: "external-session-trace",
      T1: "xpi-memo",
      T2: "deferred-ai-memory",
      T3: "deferred-memvid",
    },
  });
}
function renderMemoryContext(items: readonly RecallItem[]): string | null {
  if (items.length === 0) return null;
  const lines = items.map((item, index) => {
    const content = item.content.replace(/[\r\n]+/g, " ");
    const kind = item.kind ? ` [${item.kind}]` : "";
    return `${index + 1}. ${content}${kind}`;
  });
  return `<memories>\n${lines.join("\n")}\n</memories>`;
}

/** Maximum characters of automatic-injection memory content (task 5.4). */
const AUTO_INJECT_CHAR_BUDGET = 1500;

/**
 * Dual-query auto-injection (plan-note-03): a fixed English template alone
 * structurally misses Chinese memories, so automatic injection also queries a
 * Chinese intent template and fuses the results. Prompt-driven recall keeps
 * the user's own query.
 */
const AUTO_INJECT_QUERY_ZH = "项目 决策 约束 偏好 未完成工作";
const AUTO_INJECT_QUERY_EN =
  "restore project context decisions constraints preferences unfinished work";

/**
 * Merge per-query SearchOutcomes: highest per-backend score wins on the same
 * memory (id, else content signature); a failed query never blocks the other —
 * only total failure yields an outcome with no backend.
 */
export function mergeSearchOutcomes(outcomes: SearchOutcome[]): SearchOutcome {
  const succeeded = outcomes.filter((outcome) => outcome.backendName !== null);
  if (succeeded.length === 0) return outcomes[0] as SearchOutcome;
  const warning = succeeded
    .map((outcome) => outcome.warning)
    .filter((value): value is string => Boolean(value))
    .at(0);
  const best = new Map<string, SearchOutcome["results"][number]>();
  for (const outcome of succeeded) {
    for (const result of outcome.results) {
      const key = result.id ? `id:${result.id}` : `content:${result.content.trim()}`;
      const existing = best.get(key);
      if (!existing || result.score > existing.score) best.set(key, result);
    }
  }
  const first = succeeded[0] as SearchOutcome;
  return {
    attempts: succeeded.flatMap((outcome) => outcome.attempts),
    backendName: first.backendName,
    results: [
      ...best.values(),
    ].sort((left, right) => right.score - left.score),
    queriedBanks: [
      ...new Set(succeeded.flatMap((outcome) => outcome.queriedBanks)),
    ],
    ...(warning
      ? {
          warning,
        }
      : {}),
  };
}

/** Injection result shared by the TUI widget and the RPC message path (plan-note-03). */
interface RecallOutcome {
  /** Memory block for the model; null when nothing was injected. */
  context: string | null;
  /** User-visible status line; shared verbatim with the TUI successText. */
  statusLine: string;
}

async function recallForContext(
  ctx: ExtensionContext,
  dependencies: XpiMemoDependencies,
  query: string,
  policy: RecallPolicy,
  surface: ReturnType<typeof createMemorySurface>,
  l0?: L0Coordinator,
): Promise<RecallOutcome> {
  const notRecalled: RecallOutcome = {
    context: null,
    statusLine: "",
  };
  const runtime = createRuntime(ctx.cwd, dependencies);
  surface.begin(policy === "active" ? "inject" : "recall");
  try {
    const decision = decideRecall(policy, query, runtime.config.paused);
    if (!decision.shouldRecall) {
      surface.clear();
      return notRecalled;
    }
    // Dual-query fusion: fixed auto-injection templates recall in both
    // languages; prompt-driven recall adds the user's own query.
    const queries =
      query === AUTO_INJECT_QUERY_EN
        ? [
            AUTO_INJECT_QUERY_EN,
            AUTO_INJECT_QUERY_ZH,
          ]
        : [
            query,
          ];
    const outcomes = await Promise.all(
      queries.map((single) =>
        runtime.search
          .runSearch({
            limit: runtime.config.limit,
            query: single,
            scope: runtime.context.projectBank ? "project" : "global",
            sessionId: l0?.sessionId() ?? undefined,
          })
          .catch(() => null),
      ),
    );
    const usable = outcomes.filter(
      (outcome): outcome is SearchOutcome => outcome !== null,
    );
    if (usable.length === 0) {
      surface.fail();
      return notRecalled;
    }
    const outcome = mergeSearchOutcomes(usable);
    const response = toRecallResponse(outcome);
    const ranked = rankRecallResults(response.results, query, {
      charBudget: AUTO_INJECT_CHAR_BUDGET,
      itemBudget: runtime.config.limit,
    });
    const injected = ranked
      ? [
          ...ranked.standing,
          ...ranked.contextual,
        ]
      : [];
    // Task 5.6 + plan-note-03: one audit entry per executed query distinguishes
    // "backend queried with no hits" from "no backend executed" and feeds the
    // doctor's recall zero-hit streak.
    for (let index = 0; index < queries.length; index += 1) {
      const single = outcomes[index];
      if (!single) continue;
      runtime.audit.record("recall", {
        backend: single.backendName ?? "none",
        reason: queries[index] as string,
        resultCount: single.results.length,
        status: single.backendName === null ? "no-backend" : "recalled",
        ...(index === queries.length - 1 && injected.length > 0
          ? {
              injectedCount: injected.length,
            }
          : {}),
      });
    }
    const context = renderMemoryContext(injected);
    // plan-note-03 visibility: one status line shared by the TUI widget and the
    const action = policy === "active" ? "inject" : "recall";
    surface.complete(action, injected.length);
    return {
      context,
      statusLine: successText(action, injected.length),
    };
  } catch {
    surface.fail();
    return notRecalled;
  }
}

const WS_SPLIT = /\s+/;

export default function xpiMemo(
  pi: ExtensionAPI,
  dependencies: XpiMemoDependencies = {},
): void {
  pi.registerCommand("xpi-memo", {
    description: "Open the XpiMemo T1 console",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("Use /xpi-memo-status for JSON status outside the TUI.", "info");
        return;
      }
      const status = await statusForContext(ctx.cwd, dependencies);
      const runtime = createRuntime(ctx.cwd, dependencies);
      await openConsole(
        ctx,
        status,
        runtime.config,
        dependencies.env ?? process.env,
        runtime.candidates.list(),
        {
          confirm: ctx.ui.confirm.bind(ctx.ui),
          async reviewCandidate(candidate) {
            const decision = await chooseCandidateAction(
              ctx,
              candidate,
              runtime.config,
              true,
            );
            if (decision === "later") return;
            if (decision === "reject") {
              const rejected = await runtime.candidates.reject(candidate.id);
              runtime.l0.recordSafe("candidate_rejected", {
                bank: candidate.targetBank,
                candidateId: candidate.id,
                kind: candidate.kind,
                reason: rejected.reason,
                scope: candidate.targetScope,
              });
              runtime.audit.record("rejection", {
                bank: candidate.targetBank,
                kind: candidate.kind,
                reason: rejected.reason,
                scope: candidate.targetScope,
                status: rejected.status,
              });
              return;
            }
            const stored = await runtime.candidates.confirm(candidate.id);
            runtime.l0.recordSafe("candidate_confirmed", {
              bank: candidate.targetBank,
              candidateId: candidate.id,
              kind: candidate.kind,
              scope: candidate.targetScope,
            });
            runtime.audit.record("confirmation", {
              bank: candidate.targetBank,
              kind: candidate.kind,
              reason: stored.reason,
              scope: candidate.targetScope,
              status: stored.status,
            });
            if (stored.status === "stored")
              setFooterStatus(ctx, runtime.config.paused, true);
          },
          save(values) {
            saveUserConfig({
              env: dependencies.env,
              values,
            });
            if (values.paused !== undefined) setFooterStatus(ctx, values.paused);
          },
          async sleep() {
            await executeSleepTool(
              {
                authorized: true,
              },
              ctx,
              dependencies,
            );
          },
        },
      );
    },
  });

  pi.registerCommand("xpi-memo-status", {
    description: "Show the XpiMemo T1 status (panel in TUI, JSON elsewhere)",
    handler: async (_args, ctx) => {
      const status = await statusForContext(ctx.cwd, dependencies);
      if (ctx.mode === "tui") {
        await openStatusPanel(
          ctx,
          formatStatusJson(
            status,
            l0Status({
              env: dependencies.env ?? process.env,
            }),
          ),
        );
        return;
      }
      ctx.ui.notify(JSON.stringify(status), "info");
    },
  });

  pi.registerCommand("xpi-memo-trace", {
    description:
      "Trace a memory or candidate back to its L0 source (usage: /xpi-memo-trace --session <id> --position <n> | --candidate <id>)",
    handler: async (args, ctx) => {
      const flags = args.split(WS_SPLIT).filter(Boolean);
      const sessionFlag = flags.indexOf("--session");
      const positionFlag = flags.indexOf("--position");
      const candidateFlag = flags.indexOf("--candidate");
      const config = loadConfig({
        env: dependencies.env ?? process.env,
      }).config;
      const usage =
        "Usage: /xpi-memo-trace --session <id> --position <n> | --candidate <id>";

      // Candidate trace: pending queue + its candidate_created L0 event.
      if (candidateFlag >= 0) {
        const candidateId = flags[candidateFlag + 1];
        if (!candidateId || candidateId.startsWith("--")) {
          ctx.ui.notify(usage, "warning");
          return;
        }
        const store = createCandidateStore({
          // list() never touches the adapter; provide a no-op runner.
          adapter: createMnemosyneAdapter(dependencies.run ?? (async () => "")),
          statePath: join(config.dataDir, "candidates.json"),
        });
        const candidates = store.list();
        if (!candidates.some((entry) => entry.id === candidateId)) {
          ctx.ui.notify(`No pending candidate with id ${candidateId}.`, "warning");
          return;
        }
        // Bounded scan: stop at the first candidate_created event that
        // references the id; never reads full transcripts.
        const sessionsRoot = sessionsDirFor(config.dataDir);
        let creatingEvent: L0Event | undefined;
        try {
          const entries = readdirSync(sessionsRoot);
          const createdPerSession = await Promise.all(
            entries.map(async (entry) => {
              try {
                const reader = createEventLogReader({
                  sessionDir: join(sessionsRoot, entry),
                });
                return await reader.readByType("candidate_created");
              } catch {
                // Unreadable session dirs contribute no events (read-only trace).
                return [];
              }
            }),
          );
          creatingEvent = createdPerSession
            .flat()
            .find((event) => event.payload.candidateId === candidateId);
        } catch {
          // Unreadable session dirs contribute no events (read-only trace).
        }
        const trace = traceCandidate(
          candidates,
          creatingEvent
            ? [
                creatingEvent,
              ]
            : [],
          candidateId,
        );
        if (!trace) {
          ctx.ui.notify(`No trace found for candidate ${candidateId}.`, "warning");
          return;
        }
        ctx.ui.notify(formatSourceTrace(trace), "info");
        return;
      }

      // Memory trace: a confirming L0 event in a named session.
      const sessionId = sessionFlag >= 0 ? flags[sessionFlag + 1] : undefined;
      const positionRaw = positionFlag >= 0 ? flags[positionFlag + 1] : undefined;
      if (!sessionId || sessionId.startsWith("--") || !positionRaw) {
        ctx.ui.notify(usage, "warning");
        return;
      }
      const position = Number(positionRaw);
      if (!Number.isInteger(position) || position < 1) {
        ctx.ui.notify(usage, "warning");
        return;
      }
      const reader = createEventLogReader({
        sessionDir: sessionDirFor(config.dataDir, sessionId),
      });
      const events = await reader.readRange(position, position);
      const trace = traceMemoryEvent(events, sessionId, position);
      if (!trace) {
        ctx.ui.notify(
          `No L0 event at session ${sessionId} position ${position}.`,
          "warning",
        );
        return;
      }
      ctx.ui.notify(formatSourceTrace(trace), "info");
    },
  });

  pi.registerCommand("xpi-memo-export", {
    description:
      "Export L0 events to Markdown (usage: /xpi-memo-export [--session <id>] [--force] [--validate])",
    handler: async (args, ctx) => {
      const env = dependencies.env ?? process.env;
      const flags = args.split(WS_SPLIT).filter(Boolean);
      const config = loadConfig({
        env,
      }).config;
      // Task 6.1/6.3: project Markdown export / governed re-import.
      if (flags.includes("--repo")) {
        const runtime = createRuntime(ctx.cwd, dependencies);
        const bank = runtime.context.projectBank;
        // Task 6.4: resolve the export target to the current worktree/project
        // root, never to a subdirectory of the session cwd.
        const gitIdentity = resolveProjectIdentity(ctx.cwd);
        const localIdentity = gitIdentity ? null : resolveLocalProjectIdentity(ctx.cwd);
        const projectRoot = gitIdentity?.root ?? localIdentity?.root ?? ctx.cwd;
        if (!bank) {
          ctx.ui.notify(
            "No project identity in this directory. Run /xpi-memo-init or switch to a Git repository.",
            "warning",
          );
          return;
        }
        if (flags.includes("--reimport")) {
          const entries = discoverRepoExport(projectRoot);
          if (entries.length === 0) {
            ctx.ui.notify(
              `No repo-export entries found in ${repoMemoryDir(projectRoot)}.`,
              "info",
            );
            return;
          }
          const result = await reimportRepoExport(entries, {
            audit: runtime.audit,
            candidates: runtime.candidates,
            context: runtime.context,
            dataDir: runtime.config.dataDir,
            l0: runtime.l0,
          });
          ctx.ui.notify(
            `Re-imported ${result.imported} candidate(s), ${result.duplicates} duplicate(s), ${result.rejected} rejected from ${repoMemoryDir(projectRoot)}.` +
              " Candidates require review before any T1 write.",
            result.rejected > 0 ? "warning" : "info",
          );
          return;
        }
        const result = await exportProjectMemory({
          dataDir: runtime.config.dataDir,
          privacy: config.privacy,
          projectBank: bank,
          projectRoot,
          run: runtime.run,
        });
        ctx.ui.notify(
          `Exported ${result.files.length} file(s) to ${repoMemoryDir(projectRoot)}` +
            (result.rejected > 0
              ? ` (${result.rejected} row(s) blocked by content policy).`
              : "."),
          result.rejected > 0 ? "warning" : "info",
        );
        return;
      }
      if (flags.includes("--validate")) {
        const validation = await validateExport(
          loadConfig({
            env,
          }).config.dataDir,
        );
        ctx.ui.notify(
          validation.ok
            ? `Export validation OK: all ${validation.sessions} session(s) exported.`
            : `Export validation: ${validation.missing} event(s) not yet exported across ${validation.sessions} session(s). Re-run export.`,
          validation.ok ? "info" : "warning",
        );
        return;
      }
      const sessionFlag = flags.indexOf("--session");
      const result = await exportMarkdown({
        env,
        force: flags.includes("--force"),
        sessionId: sessionFlag >= 0 ? flags[sessionFlag + 1] : undefined,
        filters: {
          excludeToolResults: config.excludeToolResults,
          privacy: config.privacy,
        },
      });
      const exported = result.sessions.reduce(
        (sum, session) => sum + session.exportedEvents,
        0,
      );
      const errors = result.sessions.filter((session) => session.error);
      const lines = [
        `Exported ${exported} event(s) from ${result.sessions.length} session(s).`,
        `Daily files written: ${result.dailyFiles}. MEMORY.md: ${result.memoryMd ? "updated" : "unchanged"}.`,
        `Output: ${result.markdownDir}`,
        ...result.warnings.map((warning) => `warning: ${warning}`),
        ...errors.map(
          (session) => `error: session ${session.sessionId}: ${session.error}`,
        ),
      ];
      ctx.ui.notify(lines.join("\n"), errors.length > 0 ? "warning" : "info");
    },
  });

  pi.registerCommand("xpi-memo-init", {
    description:
      "Initialize a non-Git project identity (writes .pi/xpi-memo/project.json; no SQLite in the repo). Usage: /xpi-memo-init",
    handler: async (_args, ctx) => {
      const gitIdentity = (
        dependencies.resolveProjectIdentity ?? resolveProjectIdentity
      )(ctx.cwd);
      if (gitIdentity) {
        ctx.ui.notify(
          `Already inside Git project "${gitIdentity.label}" (${gitIdentity.id}); local initialization not needed.`,
          "info",
        );
        return;
      }
      const existing = resolveLocalProjectIdentity(ctx.cwd);
      if (existing) {
        ctx.ui.notify(
          `Already initialized as "${existing.label}" (${existing.id}) at ${existing.root}; nothing changed.`,
          "info",
        );
        return;
      }
      const identity = initializeLocalProject(ctx.cwd);
      ctx.ui.notify(
        `Initialized non-Git project identity "${identity.label}" (${identity.id}) at ${identity.root}.` +
          `\nMetadata: ${join(identity.root, LOCAL_PROJECT_METADATA_DIR, "project.json")}` +
          `\nProject memory is now routed to this project; no SQLite was created in the repository.`,
        "info",
      );
    },
  });
  const surfaceByContext = new WeakMap<
    object,
    ReturnType<typeof createMemorySurface>
  >();
  const pendingStartupContext = new WeakMap<object, Promise<RecallOutcome>>();
  const lastInputByContext = new WeakMap<object, InputProvenance>();
  const toolCallProvenance = new Map<string, MemoryActivationProvenance>();
  // 4.2 session-start reminder cooldown (per extension process).
  const CANDIDATE_REMINDER_MIN_PENDING = 3;
  const CANDIDATE_REMINDER_COOLDOWN_MS = 6 * 60 * 60 * 1000;
  let candidateReminderLastShownAt = 0;
  const getSurface = (ctx: ExtensionContext) => {
    let surface = surfaceByContext.get(ctx);
    if (!surface) {
      surface = createMemorySurface(ctx);
      surfaceByContext.set(ctx, surface);
    }
    return surface;
  };
  // One L0 session per extension process, shared by all hooks.
  const l0HookCoordinator = (): L0Coordinator => {
    const config = loadConfig({
      env: dependencies.env,
    });
    return createL0Coordinator({
      dataDir: config.config.dataDir,
      enabled: config.config.l0Enabled,
    });
  };
  let l0Shared: L0Coordinator | null = null;
  const l0ForHooks = (): L0Coordinator => (l0Shared ??= l0HookCoordinator());
  let idempotencyShared: MemoryIdempotencyStore | null = null;
  const idempotencyForHooks = (): MemoryIdempotencyStore => {
    const config = loadConfig({
      env: dependencies.env,
    });
    if (!idempotencyShared)
      idempotencyShared = createMemoryIdempotencyStore({
        statePath: join(config.config.dataDir, "idempotency.json"),
      });
    return idempotencyShared;
  };
  let auditShared: AuditLog | null = null;
  const auditForHooks = (): AuditLog => {
    const config = loadConfig({
      env: dependencies.env,
    });
    if (!auditShared)
      auditShared = createAuditLog({
        statePath: join(config.config.dataDir, "audit.json"),
      });
    return auditShared;
  };

  pi.on("input", (event, ctx) => {
    // 5.4 user_message capture: best-effort, never blocks the session.
    const l0 = l0ForHooks();
    const recorded = l0.recordSafe("user_message", {
      source: event.source,
      text: event.text,
    });
    const sessionId = l0.sessionId();
    if (recorded && sessionId)
      lastInputByContext.set(ctx, {
        eventPosition: recorded.position,
        sessionId,
        source: `input:${event.source}`,
        text: event.text,
      });
  });
  pi.on("tool_call", (event) => {
    const l0 = l0ForHooks();
    const recorded = l0.recordSafe("tool_call", {
      arguments: event.input,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
    });
    const sessionId = l0.sessionId();
    if (recorded && sessionId)
      toolCallProvenance.set(event.toolCallId, {
        eventPosition: recorded.position,
        sessionId,
        source: "tool_call",
      });
  });
  pi.on("tool_result", (event) => {
    l0ForHooks().recordSafe("tool_result", {
      isError: event.isError,
      toolCallId: event.toolCallId,
    });
    toolCallProvenance.delete(event.toolCallId);
  });
  const rememberProvenanceFor = (
    ctx: ExtensionContext,
    toolCallId: string,
  ): MemoryActivationProvenance | undefined => {
    const input = lastInputByContext.get(ctx);
    if (input) return input;
    const toolCall = toolCallProvenance.get(toolCallId);
    if (toolCall) return toolCall;

    const l0 = l0ForHooks();
    const recorded = l0.recordSafe("tool_call", {
      source: "direct-tool-execution",
      toolCallId,
      toolName: "xpi_memo_remember",
    });
    const sessionId = l0.sessionId();
    return recorded && sessionId
      ? {
          eventPosition: recorded.position,
          sessionId,
          source: "direct-tool-execution",
        }
      : undefined;
  };
  pi.on("session_compact", (event) => {
    l0ForHooks().recordSafe("compaction", {
      reason: event.reason,
      summary: "session context compacted",
    });
  });

  pi.on("session_start", async (_event, ctx) => {
    const startConfig = loadConfig({
      env: dependencies.env,
    }).config;
    if (ctx.mode === "tui") setFooterStatus(ctx, startConfig.paused);
    // 4.2 low-noise session-start backlog reminder: non-blocking, throttled.
    const store = createCandidateStore({
      adapter: createMnemosyneAdapter(dependencies.run ?? (async () => "")),
      statePath: join(startConfig.dataDir, "candidates.json"),
    });
    const digest = buildCandidateDigest(store.list());
    const now = Date.now();
    if (
      digest.pending >= CANDIDATE_REMINDER_MIN_PENDING &&
      now - candidateReminderLastShownAt >= CANDIDATE_REMINDER_COOLDOWN_MS
    ) {
      candidateReminderLastShownAt = now;
      ctx.ui.notify(renderCandidateDigest(digest), "info");
    }
    pendingStartupContext.set(
      ctx,
      recallForContext(
        ctx,
        dependencies,
        AUTO_INJECT_QUERY_EN,
        "active",
        getSurface(ctx),
        l0ForHooks(),
      ),
    );
  });
  pi.on("before_agent_start", async (event, ctx) => {
    const startup = pendingStartupContext.get(ctx);
    pendingStartupContext.delete(ctx);
    const startupOutcome = startup ? await startup : null;
    const runtime = createRuntime(
      ctx.cwd,
      dependencies,
      l0ForHooks(),
      idempotencyForHooks(),
    );
    const input = lastInputByContext.get(ctx);
    if (input?.text === event.prompt)
      await activateExplicitMemoryIntent(
        event.prompt,
        {
          adapter: runtime.adapter,
          audit: runtime.audit,
          candidates: runtime.candidates,
          context: runtime.context,
          idempotency: runtime.idempotency,
          l0: runtime.l0,
          config: {
            dataDir: runtime.config.dataDir,
            paused: runtime.config.paused,
          },
        },
        input,
      );
    const decision = decideRecall(
      runtime.config.recallPolicy,
      event.prompt,
      runtime.config.paused,
    );
    const promptOutcome = decision.shouldRecall
      ? await recallForContext(
          ctx,
          dependencies,
          event.prompt,
          runtime.config.recallPolicy,
          getSurface(ctx),
          l0ForHooks(),
        )
      : null;
    // plan-note-03: one status line per recall source, shared with the TUI.
    const statusLines = [
      startupOutcome,
      promptOutcome,
    ]
      .map((outcome) => outcome?.statusLine)
      .filter((line): line is string => typeof line === "string" && line.length > 0);
    const contexts = [
      startupOutcome?.context,
      promptOutcome?.context,
    ].filter((value): value is string => Boolean(value));
    if (statusLines.length === 0) return;
    const contextLines =
      contexts.length === 0
        ? []
        : [
            ...new Set(contexts.join("\n").split("\n")),
          ];
    const content = [
      ...statusLines,
      ...contextLines,
    ].join("\n");
    return {
      message: {
        content,
        customType: "xpi-memo-memory",
        display: false,
      },
    };
  });
  pi.on("session_before_compact", async (_event, ctx) => {
    pendingStartupContext.set(
      ctx,
      recallForContext(
        ctx,
        dependencies,
        AUTO_INJECT_QUERY_EN,
        "active",
        getSurface(ctx),
        l0ForHooks(),
      ),
    );
    const config = loadConfig({
      env: dependencies.env,
    }).config;
    if (config.offlineExtractionEnabled && config.l0Enabled) {
      try {
        await runOfflineExtractionForLifecycle(
          ctx.cwd,
          config,
          dependencies,
          l0ForHooks(),
          auditForHooks(),
          "session_before_compact",
        );
      } catch {
        // Extraction failure must not block compact.
      }
    }
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    const config = loadConfig({
      env: dependencies.env,
    }).config;
    clearAutoExportTimer(config.dataDir);
    pendingStartupContext.delete(ctx);
    getSurface(ctx).clear();
    clearFooterStatus(ctx);
    // Auto-export on session end (Task 9.3): best-effort, never blocks shutdown.
    if (config.autoExport && config.l0Enabled) {
      try {
        await exportMarkdown({
          env: dependencies.env,
          filters: {
            excludeToolResults: config.excludeToolResults,
            privacy: config.privacy,
          },
        });
      } catch {
        // Export failure must not block session shutdown.
      }
    }
    // Gated offline extraction (task 3.1): best-effort, bounded, never blocks shutdown.
    if (config.offlineExtractionEnabled && config.l0Enabled) {
      try {
        await runOfflineExtractionForLifecycle(
          ctx.cwd,
          config,
          dependencies,
          l0ForHooks(),
          auditForHooks(),
          "session_shutdown",
        );
      } catch {}
    }
  });

  pi.registerTool(
    realTool(
      "xpi_memo_remember",
      "XpiMemo Remember",
      "Store a governed T1 memory after routing and evidence validation.",
      rememberParameters,
      (params, ctx, toolCallId) =>
        executeRemember(
          params,
          ctx,
          dependencies,
          l0ForHooks(),
          idempotencyForHooks(),
          rememberProvenanceFor(ctx, toolCallId),
        ),
    ),
  );

  pi.registerTool(
    realTool(
      "xpi_memo_recall",
      "XpiMemo Recall",
      "Recall bounded T1 memory for the current project and global scope.",
      recallParameters,
      (params, ctx) => executeRecall(params, ctx, dependencies, l0ForHooks()),
    ),
  );

  pi.registerTool(
    realTool(
      "xpi_memo_forget",
      "XpiMemo Forget",
      "Request governed removal or supersession of a T1 memory.",
      Type.Object({
        memoryId: Type.String({
          description: "T1 memory identifier",
        }),
      }),
      async (params, ctx) => {
        try {
          const runtime = createRuntime(ctx.cwd, dependencies);
          const banks = [
            ...new Set([
              ...(runtime.context.projectBank
                ? [
                    runtime.context.projectBank,
                  ]
                : []),
              GLOBAL_BANK,
            ]),
          ];
          let lastError: unknown;
          for (const bank of banks) {
            try {
              // biome-ignore lint/performance/noAwaitInLoops: bank probing must remain ordered and stop after first success.
              await runtime.run(
                [
                  "delete",
                  params.memoryId,
                ],
                {
                  bank: bank === GLOBAL_BANK ? undefined : bank,
                  dataDir: runtime.config.dataDir,
                },
              );
              runtime.audit.record("rejection", {
                bank,
                reason: "memory-deleted-by-user",
                status: "deleted",
              });
              return toolResult(
                {
                  bank,
                  id: params.memoryId,
                  reason: "memory-deleted-by-user",
                  status: "deleted",
                },
                `Memory ${params.memoryId} deleted.`,
              );
            } catch (error) {
              lastError = error;
            }
          }
          const reason = boundedFailureReason(lastError ?? "memory-delete-failed");
          return toolResult(
            {
              id: params.memoryId,
              reason,
              status: "error",
            },
            "Memory deletion failed.",
          );
        } catch (error) {
          return toolResult(
            {
              id: params.memoryId,
              reason: error instanceof Error ? error.message : "memory-delete-failed",
              status: "error",
            },
            "Memory deletion failed.",
          );
        }
      },
    ),
  );
  pi.registerTool(
    realTool(
      "xpi_memo_sleep",
      "XpiMemo Sleep",
      "Run explicitly authorized T1 consolidation; disabled by default.",
      sleepParameters,
      (params, ctx) => executeSleepTool(params, ctx, dependencies),
    ),
  );
  pi.registerTool(
    realTool(
      "xpi_memo_init",
      "XpiMemo Init",
      "Initialize a non-Git project identity by writing .pi/xpi-memo/project.json.",
      Type.Object({}),
      async (_params, ctx) => {
        const gitIdentity = (
          dependencies.resolveProjectIdentity ?? resolveProjectIdentity
        )(ctx.cwd);
        if (gitIdentity) {
          return toolResult(
            {
              id: gitIdentity.id,
              reason: "git-project-already-identified",
              status: "skipped",
            },
            `Already inside Git project "${gitIdentity.label}" (${gitIdentity.id}); local initialization not needed.`,
          );
        }
        const existing = resolveLocalProjectIdentity(ctx.cwd);
        if (existing) {
          return toolResult(
            {
              id: existing.id,
              reason: "already-initialized",
              status: "skipped",
            },
            `Already initialized as "${existing.label}" (${existing.id}) at ${existing.root}; nothing changed.`,
          );
        }
        const identity = initializeLocalProject(ctx.cwd);
        return toolResult(
          {
            id: identity.id,
            reason: "initialized",
            status: "stored",
          },
          `Initialized non-Git project identity "${identity.label}" (${identity.id}). Retry xpi_memo_remember after init.`,
        );
      },
    ),
  );
}
