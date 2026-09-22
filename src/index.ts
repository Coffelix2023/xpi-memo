import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type Static, type TSchema, Type } from "typebox";
import { type AuditEntry, type AuditLog, createAuditLog } from "./audit.ts";
import {
  bankDbPath,
  bankExists,
  ensureProjectBank,
  GLOBAL_BANK,
  probeExactIdReadCapability,
  type RoutingContext,
} from "./banks.ts";
import { buildCandidateDigest, renderCandidateDigest } from "./candidate-digest.ts";
import { type CandidateStore, createCandidateStore } from "./candidate-lifecycle.ts";
import { l0Status } from "./cli/l0.js";
import { loadConfig, mnemosyneEnvironment, saveUserConfig } from "./config.ts";
import { type CandidateDecision, type ConsoleActions, openConsole } from "./console.ts";
import { classifyProhibitedContent } from "./content-policy.ts";
import { runT1Delete } from "./deletion-lifecycle.js";
import { upsertDnaEntry } from "./dna/ingest.ts";
import { buildDnaInjection } from "./dna/inject.ts";
import {
  DNA_CONFIDENCE,
  DNA_DOMAINS,
  DNA_ID_PATTERN,
  DNA_SOURCES,
} from "./dna/schema.ts";
import {
  buildMemoryDoctorReport,
  detectMemoryRootSurfaces,
  type MemoryDoctorReport,
} from "./doctor.ts";
import {
  defaultMemoryEventBus,
  type MemoryEvent,
  toMemoryEvent,
} from "./event-stream.ts";
import { createEvidenceRecord } from "./evidence.ts";
import {
  createExtractionBudgetLedger,
  type ExtractionBudgetLimits,
  extractionBudgetPath,
  readExtractionLastOutcome,
} from "./extraction-budget.ts";
import {
  applyFeedbackToRecall,
  canRecordPassiveFeedback,
  isExplicitFeedback,
  summarizeFeedback,
} from "./feedback.ts";
import { clearFooterStatus, setFooterEventStatus, setFooterStatus } from "./footer.ts";
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
  revokeLocalProject,
} from "./local-identity.ts";
import { createCliBankStateReader } from "./markdown-export/bank-state.js";
import {
  exportMarkdown,
  memoryProjectionStatusFor,
  validateExport,
} from "./markdown-export/exporter.js";
import {
  activateExplicitMemoryIntent,
  type MemoryActivationProvenance,
} from "./memory-activation.ts";
import {
  contentFingerprint,
  createMemoryIdempotencyStore,
  type MemoryIdempotencyStore,
} from "./memory-idempotency.ts";
import {
  filterRecallEntries,
  MAX_MEMORY_SAFETY_COUNT,
  MEMORY_SAFETY_POLICY_VERSION,
} from "./memory-safety.js";
import {
  isMentalModelDefinitionEnabled,
  MENTAL_MODEL_DEFINITIONS,
  mentalModelDefinition,
  mentalModelDefinitionIds,
} from "./mental-model/definitions.js";
import {
  deliverMentalModels,
  type MentalModelDelivery,
} from "./mental-model/delivery.js";
import {
  evaluateMentalModels,
  type MentalModelStateCounts,
  summarizeMentalModelStates,
} from "./mental-model/evaluate.js";
import {
  createMentalModelSourceMemo,
  type MentalModelSourceMemo,
} from "./mental-model/memo.js";
import {
  mentalModelInjectedRecord,
  mentalModelRefreshRecord,
  summarizeMentalModelAudit,
} from "./mental-model/observability.js";
import { refreshMentalModels } from "./mental-model/refresh.js";
import {
  createMentalModelRefreshLedger,
  DEFAULT_MENTAL_MODEL_REFRESH_LIMITS,
} from "./mental-model/refresh-ledger.js";
import {
  formatMentalModelTrace,
  traceMentalModelProjection,
} from "./mental-model/trace.js";
import { DEFAULT_MENTAL_MODEL_TIMEOUT_MS } from "./mental-model/types.js";
import {
  createMentalModelSessionRunner,
  resolveMentalModelSynthesisModel,
} from "./mental-model-runner.ts";
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
  offlineExtractionOutcome,
  runOfflineExtraction,
} from "./offline-extraction.ts";
import {
  createSessionModelRunner,
  matchOfflineExtractionModel,
} from "./offline-extraction-runner.ts";
import {
  createExactIdReader,
  createMnemosyneAdapter,
  type ExactMemoryReader,
  findMemoryByIdFromRecall,
  type MnemosyneRunner,
  type T1MemoryOperation,
} from "./operations.ts";
import {
  generatePendingCandidate,
  type PendingCandidate,
  type PendingCandidateReason,
  RATIONALE_T1_GOVERNANCE,
} from "./pending-candidate.ts";
import {
  formatRescanPreview,
  previewRescan,
  rescanPendingCandidates,
} from "./pending-rescan.ts";
import { projectProfile, renderProfileInjection } from "./profile.ts";
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
  formatStatusText,
  type MemoryStatus,
  renderStatus,
  todayStored,
  visibleBankDiskBytes,
} from "./status.ts";
import {
  createMemorySurface,
  type ExtractionStage,
  extractionProgressText,
  successText,
} from "./surface.ts";
import { lifecycleDiagnostics, runT1Write } from "./t1-lifecycle.ts";
import { renderCallLine, renderToolLine } from "./tool-rendering.ts";

const SLEEP_COMMAND_PATTERN = /^\s*sleep\s+/m;
type ToolStatus =
  | "candidate"
  | "deleted"
  | "error"
  | "feedback"
  | "executed"
  | "recalled"
  | "rejected"
  | "revoked"
  | "routing_rejected"
  | "skipped"
  | "stored";
interface FeedbackParams {
  feedback: "helpful" | "wrong" | "irrelevant";
  memoryId: string;
}

const feedbackParameters = Type.Object({
  feedback: Type.Union([
    Type.Literal("helpful"),
    Type.Literal("wrong"),
    Type.Literal("irrelevant"),
  ]),
  memoryId: Type.String({
    description: "T1 memory identifier",
  }),
});

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
  memoryProjection?: "complete" | "failed" | "pending" | "unchanged";
  /** Actual sleep execution mode (task 3.4). */
  mode?: string;
  operationId?: string;
  queriedBanks?: string[];
  reason?: string;
  recovery?: {
    agent: string;
    cli: string;
    tui: string;
  };
  recoveryId?: string;
  /** Whether a deletion wrote a recovery snapshot before deleting (task 3.1). */
  recoverySnapshot?: "none" | "written";
  resultCount?: number;
  safety?: {
    blocked: number;
    omitted: number;
    policyVersion: string;
    reasons: string[];
  };
  scope?: "global" | "project" | "session";
  status: ToolStatus;
  /** Agent-visible, provenance-safe memory state summary (task 2.3).
   * Counts, scopes and state labels only; pending candidates and
   * model-derived content are labeled as such — never presented as
   * confirmed facts. */
  statusSummary?: {
    candidatePending: number;
    injectedLast: number;
    recalledLast: number;
    scope: string;
  };
}
export interface XpiMemoDependencies {
  env?: NodeJS.ProcessEnv;
  exactMemoryReader?: ExactMemoryReader;
  /**
   * Test injection point for the Pi project-trust verdict. Production
   * resolves it from `ctx.isProjectTrusted()`; defaults to false.
   */
  isProjectTrusted?: () => boolean;
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
async function executeFeedback(
  params: FeedbackParams,
  ctx: ExtensionContext,
  dependencies: XpiMemoDependencies,
  l0?: L0Coordinator,
  passive = false,
): Promise<ReturnType<typeof toolResult>> {
  const runtime = createRuntime(ctx.cwd, dependencies, trustFor(ctx, dependencies), l0);
  const feedback = params.feedback;
  if (!isExplicitFeedback(feedback))
    return toolResult(
      {
        id: params.memoryId,
        reason: "unsupported-feedback",
        status: "error",
      },
      "Memory feedback was not accepted.",
    );
  runtime.audit.record("feedback", {
    feedback,
    feedbackMode: passive ? "passive" : "explicit",
    targetMemoryId: params.memoryId.trim(),
    usage: passive ? "recalled" : undefined,
  });
  return toolResult(
    {
      id: params.memoryId,
      status: "feedback",
    },
    `Memory feedback recorded: ${feedback}.`,
  );
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
function deletionMessage(result: {
  operationId: string;
  reason?: string;
  status: string;
}): string {
  if (result.status === "unresolved")
    return `Memory deletion unresolved for operation ${result.operationId}; deletion outcome requires diagnosis.`;
  return "Memory deletion failed; the memory was not confirmed deleted.";
}
function deletionSuccessMessage(
  memoryId: string,
  result: {
    recovery: "none" | "written";
    recoveryId?: string;
  },
  projection: {
    memoryProjection: string;
  } | null,
): string {
  const recovery =
    result.recovery === "written"
      ? ` Recovery: ${result.recoveryId}.`
      : " No recovery snapshot was written.";
  const projectionNote =
    projection?.memoryProjection === "failed"
      ? " MEMORY.md projection failed and remains retryable."
      : "";
  return `Memory ${memoryId} deleted.${recovery}${projectionNote}`;
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

/** Bounded DNA context for the current prompt; any failure fails open to null. */
function dnaContextFor(
  ctx: ExtensionContext,
  dependencies: XpiMemoDependencies,
  prompt: string,
): string | null {
  try {
    return buildDnaInjection({
      cwd: ctx.cwd,
      prompt,
      trusted: trustFor(ctx, dependencies),
    });
  } catch {
    return null;
  }
}

const dnaWriteParameters = Type.Object({
  confidence: Type.Union(
    DNA_CONFIDENCE.map((level) => Type.Literal(level)),
    {
      description: "Entry confidence tier (required, closed enum)",
    },
  ),
  domain: Type.Union(
    DNA_DOMAINS.map((domain) => Type.Literal(domain)),
    {
      description: "DNA domain (required, closed enum: art | write)",
    },
  ),
  id: Type.String({
    description: "Entry id (kebab-case, unique within the domain)",
    maxLength: 64,
    pattern: DNA_ID_PATTERN,
  }),
  params: Type.Optional(
    Type.Record(
      Type.String({
        maxLength: 64,
      }),
      Type.Union([
        Type.String({
          maxLength: 300,
        }),
        Type.Number(),
        Type.Boolean(),
      ]),
    ),
  ),
  semantic: Type.String({
    description: "Semantic description of the rule",
    maxLength: 4000,
    minLength: 1,
  }),
  source: Type.Union(
    DNA_SOURCES.map((source) => Type.Literal(source)),
    {
      description: "Provenance label (required, closed enum)",
    },
  ),
});
type DnaWriteParams = Static<typeof dnaWriteParameters>;

async function executeDnaWrite(
  params: DnaWriteParams,
  ctx: ExtensionContext,
  dependencies: XpiMemoDependencies,
) {
  const result = upsertDnaEntry({
    cwd: ctx.cwd,
    domain: params.domain,
    trusted: trustFor(ctx, dependencies),
    entry: {
      confidence: params.confidence,
      id: params.id,
      ...(params.params
        ? {
            params: params.params,
          }
        : {}),
      semantic: params.semantic,
      source: params.source,
    },
  });
  if (result.status === "stored")
    return toolResult(
      {
        bank: ".pi/DNA.yaml",
        id: result.id,
        scope: "project",
        status: "stored",
      },
      `stored ${result.domain}/${result.id} in .pi/DNA.yaml`,
    );
  const issues = (result.issues ?? [])
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join("; ");
  const status = result.reason === "io" ? "error" : "rejected";
  return toolResult(
    {
      reason: result.reason,
      status,
    },
    `DNA write rejected (${result.reason})${result.detail ? `: ${result.detail}` : ""}${issues ? ` — ${issues}` : ""}`,
  );
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

/**
 * Project-trust verdict for the current session context. Tests inject an
 * explicit dependency; production reads Pi's `ctx.isProjectTrusted()`. Falls
 * back to false (conservative) when neither source is available.
 */
function trustFor(ctx: ExtensionContext, dependencies: XpiMemoDependencies): boolean {
  return dependencies.isProjectTrusted?.() ?? ctx.isProjectTrusted?.() ?? false;
}

/**
 * Delete archived candidates whose retention window has passed.
 *
 * Deliberately not the rescan (design Decision 4): this decides no
 * admission, so it is cheap, idempotent and safe to run while the extension
 * loads. Without it, an install that never rescans would keep expired
 * archives forever, which is the opposite of the queue not growing.
 */
function sweepExpiredCandidates(dependencies: XpiMemoDependencies): number {
  try {
    const { config } = loadConfig({
      env: dependencies.env,
    });
    const store = createCandidateStore({
      statePath: join(config.dataDir, "candidates.json"),
      // Cleanup only rewrites the candidate state file; this adapter is never
      // reached.
      adapter: {
        async store() {
          throw new Error("archive cleanup never writes to T1");
        },
      },
    });
    return store.purgeExpired().length;
  } catch {
    // Fail-open: a broken cleanup must never block extension load.
    return 0;
  }
}

function createRuntime(
  cwd: string,
  dependencies: XpiMemoDependencies,
  trusted: boolean,
  l0Override?: L0Coordinator,
  idempotencyOverride?: MemoryIdempotencyStore,
): Runtime {
  const configResult = loadConfig({
    env: dependencies.env,
  });
  const gitProject = (dependencies.resolveProjectIdentity ?? resolveProjectIdentity)(
    cwd,
  );
  const localProject = gitProject ? null : resolveLocalProjectIdentity(cwd, trusted);
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
      return runMnemosyne(args, {
        ...options,
        env: mnemosyneEnvironment(configResult.config, options?.env),
      });
    });
  const adapter = createMnemosyneAdapter(run, dependencies.exactMemoryReader);
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
    auditLog: audit,
    config: configResult.config,
    env: dependencies.env,
    l0,
    statePath: join(configResult.config.dataDir, "candidates.json"),
    async commit(operation) {
      const result = await runT1Write({
        adapter,
        l0,
        operation,
      });
      if (result.status === "stored")
        scheduleAutoExport(configResult.config, dependencies.env);
      return result;
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

/**
 * Default extraction runner (tasks 2.1–2.3): the fallback used only when no
 * runner was injected. The model comes from `offlineExtractionModel` — the
 * `"session-model"` sentinel keeps using the session's chat model — and the
 * runner is undefined whenever that resolves to nothing, which keeps "no model"
 * a bounded `unavailable` diagnostic instead of a failed model call.
 */
/**
 * The model offline extraction will use, as `provider/id`, or undefined when
 * no registry entry matches.
 *
 * Separate from `sessionModelRunnerFor` because it answers a different
 * question: that one builds a runner, this one names the choice so the status
 * surface can show it. Both go through `matchOfflineExtractionModel` so the
 * name cannot describe a model the runner would not pick.
 */
function extractionModelName(
  ctx: ExtensionContext,
  env: NodeJS.ProcessEnv | undefined,
): string | undefined {
  if (!ctx.modelRegistry) return undefined;
  const model = matchOfflineExtractionModel(
    loadConfig({
      env,
    }).config.offlineExtractionModel,
    ctx.model,
    () => ctx.modelRegistry?.getAll() ?? [],
  );
  return model ? `${model.provider}/${model.id}` : undefined;
}

function sessionModelRunnerFor(
  ctx: ExtensionContext,
  config: ReturnType<typeof loadConfig>["config"],
): OfflineExtractionRunner | undefined {
  if (!ctx.modelRegistry) return undefined;
  const model = matchOfflineExtractionModel(
    config.offlineExtractionModel,
    ctx.model,
    () => ctx.modelRegistry.getAll(),
  );
  if (!model) return undefined;
  return createSessionModelRunner({
    client: ctx.modelRegistry,
    model,
    timeoutMs: DEFAULT_OFFLINE_EXTRACTION_TIMEOUT_MS,
  });
}

/**
 * Default mental-model synthesis runner (add-mental-model-projections, 3.5).
 * Uses the same `offlineExtractionModel` value and model-resolution rules as
 * offline extraction, so one model setting drives both optional model paths.
 */
function mentalModelSynthesisFor(
  ctx: ExtensionContext,
  config: ReturnType<typeof loadConfig>["config"],
): {
  generator?: {
    model?: string;
    provider?: string;
  };
  runner?: import("./mental-model/synthesis.js").MentalModelSynthesisRunner;
} {
  if (!ctx.modelRegistry) return {};
  const model = resolveMentalModelSynthesisModel(
    config.offlineExtractionModel,
    ctx.model,
    () => ctx.modelRegistry.getAll(),
  );
  if (!model) return {};
  return {
    runner: createMentalModelSessionRunner({
      client: ctx.modelRegistry,
      model,
      timeoutMs: DEFAULT_MENTAL_MODEL_TIMEOUT_MS,
    }),
    generator: {
      model: model.id,
      provider: model.provider,
    },
  };
}

/**
 * Best-effort mental-model refresh at an offline lifecycle point
 * (add-mental-model-projections, task 3.5). Fire-and-forget by design: a
 * bank read or model call must never block compact or session completion.
 * The per-session refresh ledger makes compact + shutdown run without
 * refreshing the same unchanged definition twice.
 *
 * Task 5.1: every returned result becomes one bounded, body-free audit + L0
 * lifecycle record, so status can distinguish "no refresh needed" from
 * "synthesis disabled" from "refused" without reading a single body.
 */
function scheduleMentalModelRefresh(options: {
  audit: AuditLog;
  config: ReturnType<typeof loadConfig>["config"];
  ctx: ExtensionContext;
  dependencies: XpiMemoDependencies;
  l0: L0Coordinator;
  memo: ReturnType<typeof createMentalModelSourceMemo>;
  trigger: "session_before_compact" | "session_shutdown";
}): void {
  const { config, l0 } = options;
  const sessionId = l0.sessionId();
  if (!sessionId) return;
  const synthesis = mentalModelSynthesisFor(options.ctx, config);
  void refreshMentalModels({
    dataDir: config.dataDir,
    definitions: MENTAL_MODEL_DEFINITIONS,
    ledger: createMentalModelRefreshLedger({
      sessionId,
      statePath: join(config.dataDir, "mental-models", "refresh-ledger.json"),
    }),
    limits: DEFAULT_MENTAL_MODEL_REFRESH_LIMITS,
    memo: options.memo,
    projectBank: projectBankFor(options.ctx, options.dependencies),
    read: createCliBankStateReader(options.dependencies.run),
    runner: synthesis.runner,
    isDefinitionEnabled: (definitionId) =>
      isMentalModelDefinitionEnabled(config.mentalModelDefinitions, definitionId),
    sessionId,
    generator: synthesis.generator,
    synthesisEnabled: config.mentalModelSynthesisEnabled,
  })
    .then((results) => {
      for (const result of results) {
        const record = mentalModelRefreshRecord(result, options.trigger);
        // Task 5.1 boundary: with synthesis off, "synthesis disabled" is the
        // expected default rather than an event — status already reports
        // `enabled: false`. Failures are still recorded, because a freshness
        // verdict that could not be computed is exactly what an operator needs
        // to see.
        if (!config.mentalModelSynthesisEnabled && record.status !== "failed") continue;
        options.audit.record("mental-model", {
          ...record,
        });
        l0.recordSafe("mental_model_refresh", {
          ...record,
        });
      }
    })
    .catch(() => {
      // A refresh failure must never block the lifecycle point.
    });
}

/**
 * Canonical project bank for the current context, or null when no project
 * identity is recognized. Mirrors `createRuntime`'s resolution exactly so a
 * projection owner can never disagree with routing.
 */
function projectBankFor(
  ctx: ExtensionContext,
  dependencies: XpiMemoDependencies,
): string | null {
  const trusted = trustFor(ctx, dependencies);
  const gitProject = (dependencies.resolveProjectIdentity ?? resolveProjectIdentity)(
    ctx.cwd,
  );
  const localProject = gitProject
    ? null
    : resolveLocalProjectIdentity(ctx.cwd, trusted);
  const project = gitProject ?? localProject;
  return project ? `project-${project.id}` : null;
}

/**
 * Projection states for status output (task 5.2).
 *
 * Bounded and fail-soft: a bank read or projection read problem is reported as
 * the fail-closed state by `evaluateMentalModels` itself, so status never
 * claims a projection is fresh when it could not be checked. A thrown error
 * degrades to "everything skipped" rather than failing the status command.
 */
async function mentalModelStatesFor(options: {
  config: ReturnType<typeof loadConfig>["config"];
  projectBank: string | null;
  run: MnemosyneRunner;
}): Promise<MentalModelStateCounts> {
  const summarize = (evaluations: Awaited<ReturnType<typeof evaluateMentalModels>>) =>
    summarizeMentalModelStates(evaluations, {
      definitions: MENTAL_MODEL_DEFINITIONS,
    });
  try {
    return summarize(
      await evaluateMentalModels({
        dataDir: options.config.dataDir,
        definitions: MENTAL_MODEL_DEFINITIONS,
        memo: createMentalModelSourceMemo(),
        projectBank: options.projectBank,
        read: createCliBankStateReader(options.run),
        sessionId: "",
        isDefinitionEnabled: (definitionId) =>
          isMentalModelDefinitionEnabled(
            options.config.mentalModelDefinitions,
            definitionId,
          ),
      }),
    );
  } catch {
    return summarize([]);
  }
}

async function runOfflineExtractionForLifecycle(
  ctx: ExtensionContext,
  config: ReturnType<typeof loadConfig>["config"],
  dependencies: XpiMemoDependencies,
  l0: L0Coordinator,
  audit: AuditLog,
  trigger: "session_shutdown" | "session_before_compact",
  surface: ReturnType<typeof createMemorySurface> | undefined,
): Promise<void> {
  // Shimmer above the editor for the whole attempt (design Decision 1);
  // every exit path — completed, failed, budget-exhausted — clears it.
  // Shutdown passes no surface: the widget would be set on a context that is
  // already tearing down, and nobody is looking at it any more.
  surface?.begin("extract");
  try {
    await extractOfflineMemories(ctx, config, dependencies, l0, audit, {
      // Four stages, so a compact that takes seconds shows where it is
      // instead of an unchanging shimmer (task 4.2).
      ...(surface
        ? {
            onStage: (stage: ExtractionStage) =>
              surface.progress(extractionProgressText(stage)),
          }
        : {}),
      trigger,
    });
  } finally {
    surface?.clear();
  }
}

async function extractOfflineMemories(
  ctx: ExtensionContext,
  config: ReturnType<typeof loadConfig>["config"],
  dependencies: XpiMemoDependencies,
  l0: L0Coordinator,
  audit: AuditLog,
  options: {
    /** Called once per stage reached, in order; omitted when nothing watches. */
    onStage?: (stage: ExtractionStage) => void;
    trigger: "session_shutdown" | "session_before_compact";
  },
): Promise<void> {
  const { onStage, trigger } = options;
  const cwd = ctx.cwd;
  const sessionId = l0.sessionId();
  if (!sessionId) return;

  const ledger = createExtractionBudgetLedger({
    sessionId,
    statePath: extractionBudgetPath(config.dataDir),
  });
  const limits: ExtractionBudgetLimits = {
    maxCharsPerSession: DEFAULT_OFFLINE_EXTRACTION_MAX_CHARS_PER_SESSION,
    maxExecutionsPerSession: DEFAULT_OFFLINE_EXTRACTION_MAX_EXECUTIONS_PER_SESSION,
    maxProposalsPerSession: DEFAULT_OFFLINE_EXTRACTION_MAX_PROPOSALS_PER_SESSION,
  };
  if (!ledger.executionAllowed(limits)) {
    // A terminal path like any other: record before the audit write, because
    // the ledger is the copy that outlives the audit window.
    ledger.recordOutcome(
      offlineExtractionOutcome("budget-exhausted", 0),
      "budget-exhausted",
    );
    audit.record("extraction", {
      budgetRejectedCount: 1,
      candidateCount: 0,
      invalidProposals: 0,
      outcome: offlineExtractionOutcome("budget-exhausted", 0),
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
  onStage?.("read");
  const events = (await reader.readAfter(from)).slice(
    -DEFAULT_OFFLINE_EXTRACTION_MAX_EVENTS,
  );
  if (events.length === 0) {
    ledger.recordConsumedThrough(current);
    return;
  }
  onStage?.("model");
  const result = await runOfflineExtraction({
    enabled: true,
    events,
    ledger,
    limits,
    maxEvents: DEFAULT_OFFLINE_EXTRACTION_MAX_EVENTS,
    maxInputChars: DEFAULT_OFFLINE_EXTRACTION_MAX_INPUT_CHARS,
    runner: dependencies.offlineExtractionRunner ?? sessionModelRunnerFor(ctx, config),
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
    onStage?.("parse");
    const normalized = normalizeOfflineExtractionOutput(result.output);
    extractionCounts.proposalsTotal = normalized.proposalsTotal;
    extractionCounts.validProposals = normalized.proposals.length;
    extractionCounts.invalidProposals = normalized.invalid;
    const runtime = createRuntime(cwd, dependencies, trustFor(ctx, dependencies), l0);
    onStage?.("govern");
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
  const outcome = offlineExtractionOutcome(
    result.status,
    extractionCounts.validProposals,
  );
  ledger.recordOutcome(outcome, result.status);
  audit.record("extraction", {
    ...extractionCounts,
    ...(result.status === "budget-exhausted"
      ? {
          budgetRejectedCount: 1,
        }
      : {}),
    // Task 3.3: the outcome names the three states the diagnosis needs, so
    // "no usable runner" is never read as "ran and found nothing".
    outcome,
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

/**
 * Record that a write replaces an earlier memory.
 *
 * One `feedback` entry has to carry both ids: `applyFeedbackToRecall` reads the
 * pair to mark the replaced memory `supersededBy` and lower its score, and
 * `summarizeFeedback` counts the same pair as a supersession. A memory admitted
 * automatically is as much a replacement as one a user confirmed, so both write
 * paths in `executeRemember` call this — the admitted path used to return before
 * recording it, which left the old memory live and unmarked (2026-09-21).
 */
function recordSupersession(
  audit: AuditLog,
  oldMemoryId: string | undefined,
  newMemoryId: string | undefined,
): void {
  if (!oldMemoryId || !newMemoryId) return;
  audit.record("feedback", {
    feedback: "correction",
    feedbackMode: "explicit",
    replacementMemoryId: newMemoryId,
    supersedes: oldMemoryId,
    targetMemoryId: oldMemoryId,
  });
}

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
    ...(params.supersedes?.trim()
      ? {
          supersedes: params.supersedes.trim(),
        }
      : {}),
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
  supersedes: Type.Optional(
    Type.String({
      description: "Existing memory ID replaced by this correction",
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
    runtime = createRuntime(
      ctx.cwd,
      dependencies,
      trustFor(ctx, dependencies),
      l0Override,
      idempotencyOverride,
    );
    const operation = operationFor(params, runtime, provenance);
    // Task 1.3: one bounded correlation id per remember operation, shared by
    // audit events so each started operation reaches a diagnosable terminal.
    const operationId = randomUUID();
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
        operationId,
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
        operationId,
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
      rationale: RATIONALE_T1_GOVERNANCE,
      reason: pendingReasonFor(operation.kind),
      evidence,
    });
    if (!candidate && runtime.config.paused) {
      const reason = "paused";
      runtime.audit.record("rejection", {
        operationId,
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
        operationId,
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
      // Single admission decision (stabilize 2.3): remember candidates carry
      // no repository-fact declaration, so this resolves to pending — but
      // every entry path must obtain exactly one decision from the store.
      const admitted = await runtime.candidates.admit(candidate.id);
      if (admitted.status === "stored") {
        recordSupersession(runtime.audit, params.supersedes, admitted.memoryId);
        return toolResult(
          {
            bank: candidate.targetBank,
            candidateId: candidate.id,
            // The id the other two write paths already return: without it a
            // caller cannot name the memory it just stored, superseded or not.
            ...(admitted.memoryId
              ? {
                  id: admitted.memoryId,
                }
              : {}),
            kind: candidate.kind,
            scope: candidate.targetScope,
            status: "stored",
          },
          "Memory stored in the project bank after repository-fact verification.",
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
          operationId,
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
      if (stored.status === "stored") {
        runtime.l0.recordSafe("candidate_confirmed", {
          bank: candidate.targetBank,
          evidenceType,
          candidateId: candidate.id,
          kind: candidate.kind,
          scope: candidate.targetScope,
        });
      }
      runtime.audit.record("confirmation", {
        operationId,
        bank: candidate.targetBank,
        evidenceType,
        ...(stored.memoryId
          ? {
              memoryId: stored.memoryId,
            }
          : {}),
        ...(params.supersedes
          ? {
              supersedes: params.supersedes,
            }
          : {}),
        kind: candidate.kind,
        reason: stored.reason,
        scope: candidate.targetScope,
        status: stored.status,
      });
      recordSupersession(runtime.audit, params.supersedes, stored.memoryId);
      return toolResult(
        {
          bank: candidate.targetBank,
          candidateId: candidate.id,
          ...(stored.memoryId
            ? {
                id: stored.memoryId,
              }
            : {}),
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
        operationId,
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

    const lifecycle = await runT1Write({
      adapter: runtime.adapter,
      l0: runtime.l0,
      operation,
      requestPayload: {
        identity: runtime.context.identity,
        outcome: "degraded",
        phase: "backend",
      },
    });
    if (lifecycle.status !== "stored") {
      recordMemoryFailure(runtime, {
        bank: operation.targetBank,
        kind: operation.kind,
        outcome: "degraded",
        phase: "backend",
        reason: lifecycle.reason ?? lifecycle.status,
        scope: operation.scope,
      });
      return toolResult(
        {
          bank: operation.targetBank,
          kind: operation.kind,
          reason: lifecycle.reason ?? lifecycle.status,
          scope: operation.scope,
          status: "error",
        },
        `Memory write ${lifecycle.status}: ${lifecycle.reason ?? lifecycle.operationId}. Check the T1 backend (mnemosyne) or xpi_memo configuration.`,
      );
    }
    scheduleAutoExport(runtime.config, dependencies.env);
    runtime.audit.record("write", {
      operationId,
      ...(lifecycle.memoryId
        ? {
            memoryId: lifecycle.memoryId,
          }
        : {}),
      ...(operation.supersedes
        ? {
            supersedes: operation.supersedes,
          }
        : {}),
      bank: operation.targetBank,
      confidence: operation.confidence,
      evidenceType,
      kind: operation.kind,
      scope: operation.scope,
      status: "stored",
    });
    if (operation.supersedes && lifecycle.memoryId)
      runtime.audit.record("feedback", {
        feedback: "correction",
        feedbackMode: "explicit",
        replacementMemoryId: lifecycle.memoryId,
        supersedes: operation.supersedes,
        targetMemoryId: operation.supersedes,
      });
    return toolResult(
      {
        bank: operation.targetBank,
        id: lifecycle.memoryId,
        kind: operation.kind,
        scope: operation.scope,
        status: "stored",
      },
      JSON.stringify({
        bank: operation.targetBank,
        id: lifecycle.memoryId,
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
  offset: Type.Optional(
    Type.Integer({
      description: "Skip this many results when listing memories",
      minimum: 0,
    }),
  ),
  query: Type.Optional(
    Type.String({
      description: "Recall query; omit to list memories",
    }),
  ),
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

/**
 * Agent-visible, provenance-safe memory state summary (task 2.3).
 * Bounded counts + scope labels derived from the audit trail; never memory
 * bodies. Pending candidates are reported as pending, never as facts.
 */
function statusSummaryFor(
  runtime: Runtime,
  recalledLast = 0,
): ToolDetails["statusSummary"] {
  const auditEntries = runtime.audit.list();
  const lastRecall = [
    ...auditEntries,
  ]
    .reverse()
    .find((entry) => entry.action === "recall");
  const lastInjected = [
    ...auditEntries,
  ]
    .reverse()
    .find((entry) => entry.metadata.injectedCount !== undefined);
  return {
    candidatePending: runtime.candidates.list().length,
    injectedLast: lastInjected?.metadata.injectedCount ?? 0,
    recalledLast:
      recalledLast > 0 ? recalledLast : (lastRecall?.metadata.resultCount ?? 0),
    scope: runtime.context.projectBank ? "project+global" : "global",
  };
}

async function executeRecall(
  params: RecallParams,
  ctx: ExtensionContext,
  dependencies: XpiMemoDependencies,
  l0?: L0Coordinator,
) {
  try {
    const runtime = createRuntime(ctx.cwd, dependencies, trustFor(ctx, dependencies));
    // Task 1.3: recall operation correlation across its audit events.
    const operationId = randomUUID();
    const limit = params.limit ?? runtime.config.limit;
    // Phase 4: search backend chain (configured → mnemosyne → ripgrep → qmd).
    const outcome = await runtime.search.runSearch({
      limit,
      offset: params.offset ?? 0,
      query: params.query ?? "",
      scope: runtime.context.projectBank ? "project" : "global",
      sessionId: l0?.sessionId() ?? undefined,
    });
    if (outcome.backendName === null) {
      // Spec: no backend available → empty results + warning, session continues.
      // Distinguish backend-not-run from backend-queried-no-hits (task 3.3).
      runtime.audit.record("recall", {
        backend: "none",
        operationId,
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
          statusSummary: statusSummaryFor(runtime),
        },
        JSON.stringify({
          ...empty,
          warning: outcome.warning,
        }),
      );
    }
    const response = toRecallResponse(outcome);
    response.results = applyFeedbackToRecall(response.results, runtime.audit.list());
    const safety = filterRecallEntries(response.results);
    let recallStatus = "no-hits";
    if (safety.items.length > 0) recallStatus = "recalled";
    else if (safety.counts.blocked > 0) recallStatus = "security-blocked";
    runtime.audit.record("recall", {
      backend: outcome.backendName,
      blockedCount: safety.counts.blocked,
      fallback: outcome.backendName !== "mnemosyne",
      omittedCount: safety.counts.omitted,
      operationId,
      policyVersion: safety.policyVersion,
      reason: params.query,
      resultCount: safety.items.length,
      safetyReasons: safety.reasons,
      status: recallStatus,
    });
    for (const item of safety.items) {
      if (
        runtime.config.passiveFeedback &&
        item.id &&
        canRecordPassiveFeedback(runtime.audit.list(), item.id)
      )
        runtime.audit.record("feedback", {
          feedback: "used",
          feedbackMode: "passive",
          targetMemoryId: item.id,
          usage: "recalled",
        });
    }
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
        resultCount: safety.items.length,
        status: "recalled",
        statusSummary: statusSummaryFor(runtime, safety.items.length),
        safety: {
          blocked: safety.counts.blocked,
          omitted: safety.counts.omitted,
          policyVersion: safety.policyVersion,
          reasons: safety.reasons,
        },
      },
      JSON.stringify({
        ...response,
        results: safety.items,
        searchBackend: outcome.backendName,
        untrusted: true,
        safety: {
          blocked: safety.counts.blocked,
          omitted: safety.counts.omitted,
          policyVersion: safety.policyVersion,
          reasons: safety.reasons,
        },
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
    const runtime = createRuntime(ctx.cwd, dependencies, trustFor(ctx, dependencies));
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

/** Read bounded lifecycle diagnostics without exposing event bodies. */
async function lifecycleStatusFor(
  dataDir: string,
): Promise<NonNullable<MemoryStatus["consistency"]>["lifecycle"]> {
  const sessionsRoot = sessionsDirFor(dataDir);
  let entries: string[] = [];
  try {
    entries = readdirSync(sessionsRoot);
  } catch {
    return {
      entries: [],
      total: 0,
    };
  }
  const perSession = await Promise.all(
    entries.map(async (entry) => {
      try {
        const reader = createEventLogReader({
          sessionDir: join(sessionsRoot, entry),
        });
        return lifecycleDiagnostics(await reader.readAll());
      } catch {
        return {
          entries: [],
          total: 0,
        };
      }
    }),
  );
  return {
    entries: perSession.flatMap(({ entries: diagnostics }) => diagnostics).slice(0, 20),
    total: perSession.reduce((total, result) => total + result.total, 0),
  };
}

function securityForAudit(entries: readonly AuditEntry[]): MemoryStatus["security"] {
  let recallBlocked = 0;
  let recallOmitted = 0;
  let backendNoHitCount = 0;
  let backendNotRunCount = 0;
  let routingRejectionCount = 0;
  let storageFailureCount = 0;
  let policyVersion: string | undefined;
  const count = (value: number | undefined): number =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
  for (const entry of entries) {
    const metadata = entry.metadata;
    recallBlocked += count(metadata.blockedCount);
    recallOmitted += count(metadata.omittedCount);
    if (
      entry.action === "recall" &&
      metadata.status === "no-hits" &&
      !metadata.blockedCount
    )
      backendNoHitCount += 1;
    if (entry.action === "recall" && metadata.status === "no-backend")
      backendNotRunCount += 1;
    if (entry.action === "rejection" && metadata.status === "routing_rejected")
      routingRejectionCount += 1;
    if (entry.action === "fallback" && metadata.status === "degraded")
      storageFailureCount += 1;
    if (metadata.policyVersion) policyVersion = metadata.policyVersion;
  }
  return {
    backendNoHitCount: Math.min(MAX_MEMORY_SAFETY_COUNT, backendNoHitCount),
    backendNotRunCount: Math.min(MAX_MEMORY_SAFETY_COUNT, backendNotRunCount),
    ...(policyVersion
      ? {
          policyVersion,
        }
      : {}),
    recallBlocked: Math.min(MAX_MEMORY_SAFETY_COUNT, recallBlocked),
    recallOmitted: Math.min(MAX_MEMORY_SAFETY_COUNT, recallOmitted),
    routingRejectionCount: Math.min(MAX_MEMORY_SAFETY_COUNT, routingRejectionCount),
    storageFailureCount: Math.min(MAX_MEMORY_SAFETY_COUNT, storageFailureCount),
  };
}

async function statusForContext(
  cwd: string,
  dependencies: XpiMemoDependencies = {},
  trusted = false,
  /**
   * The model offline extraction resolves to. Resolved by the caller because
   * only it holds the model registry; absent when there is none.
   */
  extractionModel?: string,
): Promise<MemoryStatus> {
  const config = loadConfig({
    env: dependencies.env,
  }).config;
  const gitProject = (dependencies.resolveProjectIdentity ?? resolveProjectIdentity)(
    cwd,
  );
  const localProject = gitProject ? null : resolveLocalProjectIdentity(cwd, trusted);
  const project = gitProject ?? localProject;
  const run =
    dependencies.run ??
    (async (args, options) => {
      const { runMnemosyne } = await import("./cli.ts");
      return runMnemosyne(args, {
        ...options,
        env: mnemosyneEnvironment(config, options?.env),
      });
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
    // The whole block travels with the entry. Its keys are allow-listed and
    // body-free on write (`safeMetadata`), and the panel's row summary reads
    // per-action fields — feedback's target, recall's hit count — that a fixed
    // list would have to be widened for on every new audit action.
    metadata: entry.metadata,
    scope: entry.metadata.scope,
    status: entry.metadata.status,
    timestamp: entry.timestamp,
  }));
  // Backend execution state from the most recent recall audit entry (task 3.3).
  const lastExtraction = [
    ...auditEntries.filter((entry) => entry.action === "extraction"),
  ].at(-1);
  // The audit window rotates at 200 entries, so the last extraction entry can
  // already be gone by the time anyone asks how it went. The budget ledger
  // carries the same two codes and is rewritten at the end of every attempt,
  // so it wins where the two disagree; the audit tail stays the fallback for a
  // ledger written before the codes existed.
  const persistedExtraction = readExtractionLastOutcome(
    extractionBudgetPath(config.dataDir),
  );
  const lastExtractionOutcome =
    persistedExtraction?.lastOutcome ?? lastExtraction?.metadata.outcome;
  const lastExtractionStatus =
    persistedExtraction?.lastStatus ?? lastExtraction?.metadata.status;
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
  const lifecycle = await lifecycleStatusFor(config.dataDir);
  const memoryProjection = memoryProjectionStatusFor(config.dataDir) ?? "unknown";
  // Task 3.3: the forget capability verdict is visible in status. Probing is
  // cached per process, so this stays a single extra CLI call at most.
  const exactIdRead = await probeExactIdReadCapability(run, config.dataDir);
  const security = securityForAudit(auditEntries);
  // Task 5.2: body-free projection states plus bounded lifecycle counters.
  // `summarizeMentalModelAudit` reads only records this extension wrote.
  const mentalModelAudit = summarizeMentalModelAudit(auditEntries);
  const mentalModelStates = await mentalModelStatesFor({
    config,
    projectBank,
    run,
  });
  const feedback = summarizeFeedback(auditEntries);
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
      feedback,
      security,
      mentalModels: {
        counts: mentalModelStates,
        outcomes: mentalModelAudit.outcomes,
      },
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
    diskBytes: visibleBankDiskBytes(config.dataDir, projectBank),
    consistency: {
      lifecycle,
      memoryProjection,
    },
    doctor,
    embedding: {
      mode: config.embeddingMode,
      model: config.embeddingModel || null,
    },
    feedback,
    exactIdRead,
    // Task 2.2: body-free event projection of the audit tail, with backend
    // distinction carried per event.
    events: config.eventPresentation
      ? auditEntries
          .map(toMemoryEvent)
          .filter((event): event is MemoryEvent => event !== null)
          .slice(-10)
      : [],
    fallback: auditEntries.some(
      (entry) => entry.action === "fallback" && entry.metadata.status === "degraded",
    ),
    observability: buildObservabilitySnapshot(auditEntries),
    offlineExtraction: {
      enabled: config.offlineExtractionEnabled,
      ...(extractionModel
        ? {
            model: extractionModel,
          }
        : {}),
      ...(lastExtractionOutcome
        ? {
            lastOutcome: lastExtractionOutcome,
          }
        : {}),
      ...(lastExtractionStatus
        ? {
            lastStatus: lastExtractionStatus,
          }
        : {}),
    },
    security,
    mentalModels: {
      counts: mentalModelStates,
      definitions: config.mentalModelDefinitions,
      enabled: config.mentalModelSynthesisEnabled,
      injectedChars: mentalModelAudit.injectedChars,
      injectedDecisions: mentalModelAudit.injectedDecisions,
      omitted: mentalModelAudit.omitted,
      outcomes: mentalModelAudit.outcomes,
      recent: mentalModelAudit.recent.map((entry) => ({
        definitionId: entry.definitionId,
        outcome: entry.outcome,
        ownerKey: entry.ownerKey,
        scope: entry.scope,
        sourceCount: entry.sourceCount,
        status: entry.status,
      })),
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
  return `<untrusted-memory-data>\n${lines.join("\n")}\n</untrusted-memory-data>`;
}

/** Maximum characters of automatic-injection memory content (task 5.4). */
const AUTO_INJECT_CHAR_BUDGET = 1500;
/** Bounded profile injection budget (task 3.3): hard cap on injected chars. */
const PROFILE_INJECT_CHAR_BUDGET = 700;

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

/**
 * Bounded mental-model delivery for automatic context assembly (task 4.4).
 *
 * Returns null only when delivery is not wired (no memo): the caller then
 * behaves exactly as before. An unwired or unreadable projection layer never
 * removes ordinary recall — failures degrade to "no projection block".
 */
async function mentalModelDeliveryFor(options: {
  config: ReturnType<typeof loadConfig>["config"];
  dependencies: XpiMemoDependencies;
  memo?: MentalModelSourceMemo;
  projectBank: string | null;
  query: string;
  sessionId: string;
}): Promise<MentalModelDelivery | null> {
  const { memo } = options;
  if (!memo) return null;
  try {
    return deliverMentalModels({
      evaluations: await evaluateMentalModels({
        dataDir: options.config.dataDir,
        definitions: MENTAL_MODEL_DEFINITIONS,
        isDefinitionEnabled: (definitionId) =>
          isMentalModelDefinitionEnabled(
            options.config.mentalModelDefinitions,
            definitionId,
          ),
        memo,
        projectBank: options.projectBank,
        read: createCliBankStateReader(options.dependencies.run),
        sessionId: options.sessionId,
      }),
      projectBank: options.projectBank,
      query: options.query,
    });
  } catch {
    return null;
  }
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
  mentalModelMemo?: MentalModelSourceMemo,
): Promise<RecallOutcome> {
  const notRecalled: RecallOutcome = {
    context: null,
    statusLine: "",
  };
  const runtime = createRuntime(ctx.cwd, dependencies, trustFor(ctx, dependencies));
  // Task 1.3: auto-injection correlation across its audit events.
  const operationId = randomUUID();
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
    response.results = applyFeedbackToRecall(response.results, runtime.audit.list());
    // Task 4.4: bounded projection delivery runs before ordinary ranking, and
    // its covered source ids suppress rows the projection already represents.
    const mentalModel = await mentalModelDeliveryFor({
      config: runtime.config,
      dependencies,
      memo: mentalModelMemo,
      projectBank: runtime.context.projectBank ?? null,
      query,
      sessionId: l0?.sessionId() ?? "",
    });
    const coarse = rankRecallResults(response.results, query, {
      charBudget: AUTO_INJECT_CHAR_BUDGET,
      excludeSourceIds: mentalModel?.coveredSourceIds ?? [],
      itemBudget: runtime.config.limit,
    });
    const ranked = coarse;
    const rankedItems = ranked
      ? [
          ...ranked.standing,
          ...ranked.contextual,
        ]
      : [];
    const safety = filterRecallEntries(rankedItems);
    const injected = safety.items;
    const omittedCount = Math.min(
      999,
      Math.max(0, response.results.length - rankedItems.length),
    );
    // "backend queried with no hits" from "no backend executed" and feeds the
    // doctor's recall zero-hit streak.
    for (let index = 0; index < queries.length; index += 1) {
      const single = outcomes[index];
      if (!single) continue;
      runtime.audit.record("recall", {
        backend: single.backendName ?? "none",
        operationId,
        reason: queries[index] as string,
        resultCount: safety.items.length,
        status: single.backendName === null ? "no-backend" : "recalled",
        ...(index === queries.length - 1 &&
        (injected.length > 0 || safety.counts.blocked > 0 || omittedCount > 0)
          ? {
              blockedCount: safety.counts.blocked,
              injectedCount: injected.length,
              omittedCount,
              policyVersion: safety.policyVersion,
              safetyReasons: safety.reasons,
            }
          : {}),
      });
    }
    for (const item of injected) {
      if (
        runtime.config.passiveFeedback &&
        item.id &&
        canRecordPassiveFeedback(runtime.audit.list(), item.id)
      )
        runtime.audit.record("feedback", {
          feedback: "used",
          feedbackMode: "passive",
          targetMemoryId: item.id,
          usage: "injected",
        });
    }
    // Task 3.3: bounded profile injection alongside the recall block.
    // Derived from the same governed recall rows; session-local overrides
    // never overwrite global values because only global-scope kinds project.
    const profileInjection = runtime.config.profileInjection
      ? renderProfileInjection(
          projectProfile(
            response.results.map((item) => ({
              content: item.content,
              id: item.id,
              kind: item.kind,
              scope: item.scope,
              sourceBank: item.bank,
              supersededBy: item.supersededBy,
              timestamp: item.timestamp,
            })),
            "global",
          ),
          PROFILE_INJECT_CHAR_BUDGET,
        )
      : null;
    const context = renderMemoryContext(injected);
    const injectedMemoryIds = injected
      .map((item) => item.id)
      .filter((id): id is string => typeof id === "string");
    if (
      l0 &&
      (injectedMemoryIds.length > 0 || safety.counts.blocked > 0 || omittedCount > 0)
    )
      l0.recordSafe("memory_injected", {
        injectedMemoryIds,
        blockedCount: safety.counts.blocked,
        injectedCount: injected.length,
        omittedCount,
        ...(omittedCount > 0
          ? {
              omissionReasons: [
                "recall-budget-or-filter",
              ],
            }
          : {}),
        lifecycleStage: "automatic-recall",
        policyVersion: safety.policyVersion,
        safetyReasons: safety.reasons,
      });
    // Task 5.1: one bounded, body-free record per automatic delivery decision.
    // It is written only when the decision was notable, so a default
    // installation with no projections writes nothing on the prompt path.
    if (mentalModel?.notable) {
      const record = mentalModelInjectedRecord({
        chars: mentalModel.injected.reduce((total, item) => total + item.chars, 0),
        definitionIds: mentalModel.injected.map((item) => item.definitionId),
        injectedCount: mentalModel.injected.length,
        omittedCount: mentalModel.omitted,
        ownerKeys: mentalModel.injected.map((item) => item.ownerKey),
        policyVersion: MEMORY_SAFETY_POLICY_VERSION,
        reasons: mentalModel.reasons,
      });
      runtime.audit.record("mental-model", {
        ...record,
      });
      l0?.recordSafe("mental_model_injected", {
        ...record,
      });
    }
    // plan-note-03 visibility: one status line shared by the TUI widget and the
    const action = policy === "active" ? "inject" : "recall";
    surface.complete(action, injected.length);
    return {
      // Profile block rides with the recall block; either may be absent.
      context:
        [
          mentalModel?.context ?? null,
          context,
          profileInjection,
        ]
          .filter(Boolean)
          .join("\n\n") || null,
      statusLine: successText(action, injected.length),
    };
  } catch {
    surface.fail();
    return notRecalled;
  }
}

const WS_SPLIT = /\s+/;

/**
 * The action surface both console entry points hand to the panel and the
 * window.
 *
 * Extracted so `/xpi-memo` and `/xpi-memo-status` cannot drift: a decision
 * taken from the window's buttons must reach the same candidate path as one
 * taken from the terminal chooser, in either command.
 */
function consoleActionsFor(
  ctx: ExtensionContext,
  runtime: ReturnType<typeof createRuntime>,
  dependencies: XpiMemoDependencies,
  /**
   * The session's one TUI surface, injected rather than created here.
   * `surface.ts` keys its widget by a module constant, so a second instance
   * would overwrite the extraction progress line instead of coexisting with it.
   */
  getSurface: (ctx: ExtensionContext) => ReturnType<typeof createMemorySurface>,
): ConsoleActions {
  const applyCandidateDecision = async (
    candidate: PendingCandidate,
    decision: CandidateDecision,
  ): Promise<readonly PendingCandidate[]> => {
    // The Glimpse window renders from a snapshot taken when it opened, so every
    // exit hands back the queue as it stands now; that is what lets a rejected
    // row leave the screen without reopening the panel. `later` writes nothing
    // and still returns, because the list is what carries the "kept" label.
    if (decision === "later") return runtime.candidates.list();
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
      return runtime.candidates.list();
    }
    const stored = await runtime.candidates.confirm(candidate.id);
    // Success confirmation event only; unresolved/rejected outcomes are
    // expressed by lifecycle and failure events instead.
    if (stored.status === "stored")
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
    if (stored.status === "stored") setFooterStatus(ctx, runtime.config.paused, true);
    return runtime.candidates.list();
  };

  /**
   * Run a decision with the store shimmer around it.
   *
   * Only `store` waits on a T1 write — it spawns mnemosyne — so only that
   * decision gets the widget. `reject` writes one JSON file and `later` writes
   * nothing; a spinner that lives for a few milliseconds reads as a flicker
   * rather than as progress.
   */
  const decideWithSurface = async (
    candidate: PendingCandidate,
    decision: CandidateDecision,
  ): Promise<readonly PendingCandidate[]> => {
    if (decision !== "store") return applyCandidateDecision(candidate, decision);
    const surface = getSurface(ctx);
    surface.begin("store");
    try {
      const pending = await applyCandidateDecision(candidate, decision);
      surface.complete("store");
      return pending;
    } catch (error) {
      // A failed write must not leave the widget behind; the caller still
      // sees the throw.
      surface.fail();
      throw error;
    }
  };

  return {
    confirm: ctx.ui.confirm.bind(ctx.ui),
    reviewDecision: decideWithSurface,
    async reviewCandidate(candidate) {
      await decideWithSurface(
        candidate,
        await chooseCandidateAction(ctx, candidate, runtime.config, true),
      );
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
  };
}
export default function xpiMemo(
  pi: ExtensionAPI,
  dependencies: XpiMemoDependencies = {},
): void {
  sweepExpiredCandidates(dependencies);

  pi.registerCommand("xpi-memo-rescan", {
    description:
      "Preview a re-judgement of every queued memory candidate; --apply runs it",
    handler: async (args, ctx) => {
      const runtime = createRuntime(ctx.cwd, dependencies, trustFor(ctx, dependencies));
      const parsed = (args ?? "").split(WS_SPLIT);
      // `--current-project` scopes the walk to this session's bank; the panel's
      // admission scope is a different setting and does not apply here.
      const currentProjectOnly = parsed.includes("--current-project");
      // Executing is opt-in: the walk spawns one mnemosyne process per admitted
      // candidate, so a bare invocation only reports what that would cost. An
      // unrecognized argument is read as "no --apply", which is the safe way.
      const apply = parsed.includes("--apply");
      const scopeBank = runtime.context.projectBank;
      if (currentProjectOnly && !scopeBank) {
        ctx.ui.notify("No project bank for this session: nothing to rescan.", "info");
        return;
      }
      // The guard above guarantees a bank is present when scoping.
      const scope = currentProjectOnly ? (scopeBank ?? undefined) : undefined;
      const scopeLabel = currentProjectOnly ? " in this project" : "";
      const scopeOption =
        scope === undefined
          ? {}
          : {
              bank: scope,
            };

      if (!apply) {
        // Same preferences, same `admit()`, no writes: the queue keeps its
        // bytes and the walk never reaches a model.
        const preview = previewRescan(runtime.candidates, scope);
        const projection = await rescanPendingCandidates({
          ...scopeOption,
          candidates: runtime.candidates,
          dryRun: true,
        });
        ctx.ui.notify(
          [
            `Rescan preview: ${projection.total} queued${scopeLabel} — ${formatRescanPreview(preview)}`,
            `Would store ${projection.stored}, archive ${projection.archived}.`,
            "No model calls. Each stored candidate then spawns the mnemosyne CLI once, which computes one local embedding.",
            "Re-run with --apply to execute.",
          ].join("\n"),
          "info",
        );
        return;
      }

      // Expire first: a record past its retention window must not be judged
      // again just because nobody looked at it in time.
      const purged = runtime.candidates.purgeExpired();
      const surface = getSurface(ctx);
      surface.begin("store");
      const outcome = await rescanPendingCandidates({
        ...scopeOption,
        auditLog: runtime.audit,
        candidates: runtime.candidates,
        onProgress: (progress) =>
          surface.progress(
            `${progress.processed}/${progress.total} · ${progress.stored} stored`,
          ),
      }).finally(() => surface.clear());
      const counts = [
        `${outcome.stored} stored`,
        `${outcome.archived} archived`,
      ];
      if (purged.length > 0) counts.push(`${purged.length} expired`);
      const noun = outcome.total === 1 ? "candidate" : "candidates";
      ctx.ui.notify(
        `Rescan over ${outcome.total} queued ${noun}${scopeLabel}: ${counts.join(" · ")}`,
        "info",
      );
    },
  });
  pi.registerCommand("xpi-memo", {
    description: "Open the XpiMemo T1 console",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("Use /xpi-memo-status for JSON status outside the TUI.", "info");
        return;
      }
      const status = await statusForContext(
        ctx.cwd,
        dependencies,
        trustFor(ctx, dependencies),
        extractionModelName(ctx, dependencies.env),
      );
      const runtime = createRuntime(ctx.cwd, dependencies, trustFor(ctx, dependencies));
      await openConsole(
        ctx,
        status,
        runtime.config,
        dependencies.env ?? process.env,
        runtime.candidates.list(),
        {
          actions: consoleActionsFor(ctx, runtime, dependencies, getSurface),
        },
      );
    },
  });

  pi.registerCommand("xpi-memo-status", {
    description:
      "Print a concise status; --json for the full payload (scripts and non-TUI sessions)",
    handler: async (args, ctx) => {
      const status = await statusForContext(
        ctx.cwd,
        dependencies,
        trustFor(ctx, dependencies),
        extractionModelName(ctx, dependencies.env),
      );
      // One surface only: a machine-readable status line, identical in both
      // modes. The scrollable panel this command used to open was a subset of
      // `/xpi-memo`'s status view, so two status surfaces meant one of them
      // would drift; `/xpi-memo` is now the single place to look at status.
      //
      // This stays the only programmatic status read: there is no
      // Two shapes, one source. The JSON stays authoritative for scripts — the
      // reason this command exists — but the payload runs to hundreds of lines,
      // so printing it into a conversation cost the reader the context they
      // wanted it for. The concise shape is therefore the default, and
      // `--json` opts back in.
      //
      // This stays the only programmatic status read: there is no
      // `xpi_memo_status` tool, and `/xpi-memo` delegates here outside the TUI.
      //
      // The scrollable panel this command used to open stays deleted: it was a
      // subset of `/xpi-memo`'s status view, and two status surfaces meant one
      // of them would drift.
      if (!(args ?? "").split(WS_SPLIT).includes("--json")) {
        ctx.ui.notify(
          formatStatusText(
            status,
            loadConfig({
              env: dependencies.env,
            }).config.language,
          ),
          "info",
        );
        return;
      }
      ctx.ui.notify(
        formatStatusJson(
          status,
          l0Status({
            env: dependencies.env ?? process.env,
          }),
        ),
        "info",
      );
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
        "Usage: /xpi-memo-trace --session <id> --position <n> | --candidate <id> | --projection <definitionId>";

      // Projection source trace (task 5.3): derived references, no bodies.
      const projectionFlag = flags.indexOf("--projection");
      if (projectionFlag >= 0) {
        const definitionId = flags[projectionFlag + 1];
        if (!definitionId || definitionId.startsWith("--")) {
          ctx.ui.notify(usage, "warning");
          return;
        }
        const definition = mentalModelDefinition(definitionId);
        if (!definition) {
          ctx.ui.notify(
            `Unknown mental-model definition ${definitionId}. Built-in ids: ${mentalModelDefinitionIds().join(", ")}.`,
            "warning",
          );
          return;
        }
        const capability = await probeExactIdReadCapability(
          dependencies.run,
          config.dataDir,
        );
        const trace = await traceMentalModelProjection({
          dataDir: config.dataDir,
          definition,
          exactIdReadAvailable: capability.available,
          projectBank: projectBankFor(ctx, dependencies),
          read: createCliBankStateReader(dependencies.run),
          readMemoryById: createExactIdReader(dependencies.run),
          isDefinitionEnabled: (id) =>
            isMentalModelDefinitionEnabled(config.mentalModelDefinitions, id),
        });
        // No owner (project scope without identity): nothing safe to trace.
        if (!trace) {
          ctx.ui.notify(
            `No projection for ${definitionId} in this context: a project identity is required and none was recognized.`,
            "warning",
          );
          return;
        }
        ctx.ui.notify(formatMentalModelTrace(trace), "info");
        return;
      }

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
        const runtime = createRuntime(
          ctx.cwd,
          dependencies,
          trustFor(ctx, dependencies),
        );
        const bank = runtime.context.projectBank;
        // Task 6.4: resolve the export target to the current worktree/project
        // root, never to a subdirectory of the session cwd.
        const gitIdentity = resolveProjectIdentity(ctx.cwd);
        const localIdentity = gitIdentity
          ? null
          : resolveLocalProjectIdentity(ctx.cwd, trustFor(ctx, dependencies));
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
      "Initialize or revoke a non-Git project identity. Usage: /xpi-memo-init [--revoke]",
    handler: async (args, ctx) => {
      const flags = args.split(WS_SPLIT).filter(Boolean);
      const revoke = flags.includes("--revoke");
      const env = dependencies.env ?? process.env;
      const config = loadConfig({
        env,
      }).config;
      const gitIdentity = (
        dependencies.resolveProjectIdentity ?? resolveProjectIdentity
      )(ctx.cwd);
      if (gitIdentity) {
        ctx.ui.notify(
          revoke
            ? "Cannot revoke a recognized Git project with xpi_memo_init."
            : `Already inside Git project "${gitIdentity.label}" (${gitIdentity.id}); local initialization not needed.`,
          revoke ? "warning" : "info",
        );
        return;
      }
      const existing = resolveLocalProjectIdentity(
        ctx.cwd,
        trustFor(ctx, dependencies),
      );
      if (revoke) {
        if (!existing) {
          ctx.ui.notify("No local project identity found; nothing to revoke.", "info");
          return;
        }
        const result = revokeLocalProject(existing, config.dataDir);
        if (!result) {
          ctx.ui.notify(
            "Local project metadata is unavailable; nothing to revoke.",
            "info",
          );
          return;
        }
        ctx.ui.notify(
          `Revoked local project "${existing.label}" (${existing.id}).` +
            (result.archivePath
              ? `\nArchived bank: ${result.archivePath}`
              : "\nNo project bank found to archive."),
          "info",
        );
        return;
      }
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
          "\nProject memory is now routed to this project; no SQLite was created in the repository.",
        "info",
      );
    },
  });
  const surfaceByContext = new WeakMap<
    object,
    ReturnType<typeof createMemorySurface>
  >();
  /**
   * Pi builds a fresh ctx object per event, so this cannot be keyed by ctx:
   * `session_start` and `before_agent_start` never see the same object. One
   * slot is enough — a process hosts one session at a time.
   */
  let pendingStartup: Promise<RecallOutcome> | undefined;
  const lastInputByContext = new WeakMap<object, InputProvenance>();
  const toolCallProvenance = new Map<string, MemoryActivationProvenance>();
  // 4.2 session-start reminder cooldown (per extension process).
  const CANDIDATE_REMINDER_MIN_PENDING = 3;
  const CANDIDATE_REMINDER_COOLDOWN_MS = 6 * 60 * 60 * 1000;
  let candidateReminderLastShownAt = 0;
  let footerEventUnsubscribe: (() => void) | undefined;
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

  // Mental-model source memo, shared by every lifecycle refresh. It is
  // invalidated on observed T1 mutations (stored/confirmed/deleted) so changed
  // source state can never be served from a stale evaluation; over-invalidation
  // only costs one re-read.
  const mentalModelMemo = createMentalModelSourceMemo();
  defaultMemoryEventBus().subscribe((event) => {
    if (
      event.kind === "stored" ||
      event.kind === "confirmed" ||
      event.kind === "deleted"
    )
      mentalModelMemo.invalidateAll();
  });

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
    // Task 2.1: throttle-render lifecycle events as a one-line footer status.
    // Fail-open: a render error must never affect memory operations.
    if (ctx.mode === "tui" && startConfig.eventPresentation) {
      footerEventUnsubscribe?.();
      footerEventUnsubscribe = defaultMemoryEventBus().subscribe((event) => {
        try {
          setFooterEventStatus(ctx, startConfig.paused, event);
        } catch {
          // Presentation only; ignore footer failures.
        }
      });
    }
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
    pendingStartup = recallForContext(
      ctx,
      dependencies,
      AUTO_INJECT_QUERY_EN,
      "active",
      getSurface(ctx),
      l0ForHooks(),
      mentalModelMemo,
    );
  });
  pi.on("before_agent_start", async (event, ctx) => {
    const startup = pendingStartup;
    pendingStartup = undefined;
    const startupOutcome = startup ? await startup : null;
    const runtime = createRuntime(
      ctx.cwd,
      dependencies,
      trustFor(ctx, dependencies),
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
          dna: {
            cwd: ctx.cwd,
            trusted: trustFor(ctx, dependencies),
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
          mentalModelMemo,
        )
      : null;
    // plan-note-03: one status line per recall source, shared with the TUI.
    const statusLines = [
      startupOutcome,
      promptOutcome,
    ]
      .map((outcome) => outcome?.statusLine)
      .filter((line): line is string => typeof line === "string" && line.length > 0);
    const dnaContext = dnaContextFor(ctx, dependencies, event.prompt);
    const contexts = [
      startupOutcome?.context,
      promptOutcome?.context,
      dnaContext,
    ].filter((value): value is string => Boolean(value));
    if (statusLines.length === 0 && contexts.length === 0) return;
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
    pendingStartup = recallForContext(
      ctx,
      dependencies,
      AUTO_INJECT_QUERY_EN,
      "active",
      getSurface(ctx),
      l0ForHooks(),
      mentalModelMemo,
    );
    const config = loadConfig({
      env: dependencies.env,
    }).config;
    if (config.offlineExtractionEnabled && config.l0Enabled) {
      try {
        await runOfflineExtractionForLifecycle(
          ctx,
          config,
          dependencies,
          l0ForHooks(),
          auditForHooks(),
          "session_before_compact",
          getSurface(ctx),
        );
      } catch {
        // Extraction failure must not block compact.
      }
    }
    // Mental-model refresh (add-mental-model-projections, 3.5): best-effort,
    // non-blocking, deduplicated against shutdown by the per-session ledger.
    scheduleMentalModelRefresh({
      audit: auditForHooks(),
      config,
      ctx,
      dependencies,
      l0: l0ForHooks(),
      memo: mentalModelMemo,
      trigger: "session_before_compact",
    });
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    const config = loadConfig({
      env: dependencies.env,
    }).config;
    clearAutoExportTimer(config.dataDir);
    pendingStartup = undefined;
    getSurface(ctx).clear();
    clearFooterStatus(ctx);
    // Auto-export on session end (Task 9.3): best-effort, never blocks shutdown.
    if (config.autoExport && config.l0Enabled) {
      // ponytail: fire-and-forget export — shutdown must not wait on a
      // multi-second full projection re-read. Ceiling: process exit mid-export
      // can duplicate daily entries; the next export converges (idempotent).
      void exportMarkdown({
        env: dependencies.env,
        filters: {
          excludeToolResults: config.excludeToolResults,
          privacy: config.privacy,
        },
      }).catch(() => {
        // Export failure must not block session shutdown.
      });
    }
    // Gated offline extraction (task 3.1): best-effort, bounded, never blocks
    // shutdown. Switching sessions must not wait on a model call, so this is
    // fire-and-forget like the export above and carries no surface widget.
    // ponytail: process exit mid-extraction can truncate it; the next session
    // re-reads the same window because the budget ledger only records what
    // completed (`consumedThrough`).
    if (config.offlineExtractionEnabled && config.l0Enabled) {
      void runOfflineExtractionForLifecycle(
        ctx,
        config,
        dependencies,
        l0ForHooks(),
        auditForHooks(),
        "session_shutdown",
        undefined,
      ).catch(() => {
        // Extraction failure must not block session shutdown.
      });
    } else {
      // A missing progress line is a configuration choice, not a failure. Name
      // the closed gate where the user would look for the line (task 4.1).
      const closedGate = config.offlineExtractionEnabled
        ? "l0Enabled is off"
        : "offlineExtractionEnabled is false";
      ctx.ui.notify(
        `Offline extraction is off (${closedGate}): nothing extracts at session end, so no extraction progress line appears. Turn it on in the /xpi-memo console.`,
        "info",
      );
    }
    // Mental-model refresh at shutdown (add-mental-model-projections, 3.5):
    // best-effort and fire-and-forget like extraction. The per-session ledger
    // skips definitions compact already refreshed with unchanged sources.
    scheduleMentalModelRefresh({
      audit: auditForHooks(),
      config,
      ctx,
      dependencies,
      l0: l0ForHooks(),
      memo: mentalModelMemo,
      trigger: "session_shutdown",
    });
  });

  pi.registerTool(
    realTool(
      "xpi_memo_feedback",
      "XpiMemo Feedback",
      "Record explicit helpful, wrong or irrelevant feedback for a governed memory.",
      feedbackParameters,
      (params, ctx) => executeFeedback(params, ctx, dependencies, l0ForHooks()),
    ),
  );
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
      "xpi_memo_dna_write",
      "XpiMemo DNA Write",
      "Write one project domain-memory entry into .pi/DNA.yaml (art or write domain).",
      dnaWriteParameters,
      (params, ctx) => executeDnaWrite(params, ctx, dependencies),
    ),
  );
  pi.registerTool(
    realTool(
      "xpi_memo_show_injected",
      "XpiMemo Show Injected",
      "Show memories injected during the current Pi session.",
      Type.Object({}),
      async (_params, ctx) => {
        try {
          const runtime = createRuntime(
            ctx.cwd,
            dependencies,
            trustFor(ctx, dependencies),
          );
          const sessionId = l0ForHooks().sessionId();
          if (!sessionId)
            return toolResult(
              {
                resultCount: 0,
                status: "recalled",
                safety: {
                  blocked: 0,
                  omitted: 0,
                  policyVersion: "legacy",
                  reasons: [],
                },
              },
              JSON.stringify({
                injected: [],
                warning: "No L0 session is available.",
              }),
            );
          const reader = createEventLogReader({
            sessionDir: sessionDirFor(runtime.config.dataDir, sessionId),
          });
          const events = await reader.readByType("memory_injected");
          const latest = events.at(-1);
          const rawIds = latest?.payload.injectedMemoryIds;
          const ids = Array.isArray(rawIds)
            ? rawIds.filter((id): id is string => typeof id === "string")
            : [];
          const banks = [
            ...(runtime.context.projectBank
              ? [
                  runtime.context.projectBank,
                ]
              : []),
            GLOBAL_BANK,
          ];
          const injected = (
            await Promise.all(
              ids.map(async (id) => {
                const memories = await Promise.all(
                  banks.map(async (bank) => {
                    try {
                      return await findMemoryByIdFromRecall(
                        id,
                        runtime.config.dataDir,
                        bank,
                        runtime.run,
                      );
                    } catch {
                      return null;
                    }
                  }),
                );
                return memories.find((memory) => memory !== null) ?? null;
              }),
            )
          ).filter((memory) => memory !== null);
          const safety = filterRecallEntries(injected);
          const payload = latest?.payload ?? {};
          const boundedPayloadCount = (value: unknown, fallback: number): number =>
            typeof value === "number" && Number.isFinite(value)
              ? Math.min(MAX_MEMORY_SAFETY_COUNT, Math.max(0, Math.floor(value)))
              : fallback;
          const blocked = boundedPayloadCount(
            payload.blockedCount,
            safety.counts.blocked,
          );
          const omitted = boundedPayloadCount(payload.omittedCount, 0);
          const policyVersion =
            typeof payload.policyVersion === "string"
              ? payload.policyVersion
              : "legacy";
          const reasons = Array.isArray(payload.safetyReasons)
            ? payload.safetyReasons
                .filter((reason): reason is string => typeof reason === "string")
                .slice(0, 4)
            : safety.reasons;
          const resultSafety = {
            blocked,
            omitted,
            policyVersion,
            reasons,
          };
          return toolResult(
            {
              resultCount: safety.items.length,
              safety: resultSafety,
              status: "recalled",
            },
            JSON.stringify({
              eventPosition: latest?.position ?? null,
              injected: safety.items,
              safety: resultSafety,
              untrusted: true,
              ...(latest
                ? {}
                : {
                    warning: "No memory injection event found.",
                  }),
            }),
          );
        } catch (error) {
          const reason = boundedFailureReason(error);
          return toolResult(
            {
              reason,
              status: "error",
            },
            `Injected memory lookup failed: ${reason}.`,
          );
        }
      },
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
          const runtime = createRuntime(
            ctx.cwd,
            dependencies,
            trustFor(ctx, dependencies),
          );
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
          const result = await runT1Delete({
            adapter: runtime.adapter,
            audit: runtime.audit,
            banks,
            dataDir: runtime.config.dataDir,
            deleteMemory: runtime.run,
            l0: l0ForHooks(),
            memoryId: params.memoryId,
          });
          const projection =
            result.status === "deleted"
              ? await exportMarkdown({
                  env: dependencies.env,
                  memoryOnly: true,
                }).catch((error: unknown) => ({
                  memoryProjection: "failed" as const,
                  warnings: [
                    boundedFailureReason(error),
                  ],
                }))
              : null;
          return toolResult(
            {
              ...(projection
                ? {
                    memoryProjection: projection.memoryProjection,
                  }
                : {}),
              ...(result.bank
                ? {
                    bank: result.bank,
                  }
                : {}),
              id: result.id,
              operationId: result.operationId,
              ...(result.reason
                ? {
                    reason: result.reason,
                  }
                : {}),
              recoverySnapshot: result.recovery,
              ...(result.recoveryId
                ? {
                    recoveryId: result.recoveryId,
                  }
                : {}),
              status: result.status === "deleted" ? "deleted" : "error",
            },
            result.status === "deleted"
              ? deletionSuccessMessage(params.memoryId, result, projection)
              : deletionMessage(result),
          );
        } catch (error) {
          return toolResult(
            {
              id: params.memoryId,
              reason: boundedFailureReason(error),
              status: "error",
            },
            "Memory deletion failed; the memory was not confirmed deleted.",
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
      "Initialize or revoke a non-Git project identity.",
      Type.Object({
        revoke: Type.Optional(
          Type.Boolean({
            description: "Archive the local bank and remove project.json",
          }),
        ),
      }),
      async (params, ctx) => {
        const gitIdentity = (
          dependencies.resolveProjectIdentity ?? resolveProjectIdentity
        )(ctx.cwd);
        if (gitIdentity) {
          return toolResult(
            {
              id: gitIdentity.id,
              reason: params.revoke
                ? "git-project-cannot-be-revoked"
                : "git-project-already-identified",
              status: "skipped",
            },
            params.revoke
              ? "Cannot revoke a recognized Git project with xpi_memo_init."
              : `Already inside Git project "${gitIdentity.label}" (${gitIdentity.id}); local initialization not needed.`,
          );
        }
        const existing = resolveLocalProjectIdentity(
          ctx.cwd,
          trustFor(ctx, dependencies),
        );
        if (params.revoke) {
          if (!existing)
            return toolResult(
              {
                reason: "local-project-not-found",
                status: "skipped",
              },
              "No local project identity found; nothing to revoke.",
            );
          const config = loadConfig({
            env: dependencies.env,
          }).config;
          const result = revokeLocalProject(existing, config.dataDir);
          if (!result)
            return toolResult(
              {
                reason: "local-project-not-found",
                status: "skipped",
              },
              "Local project metadata is unavailable; nothing to revoke.",
            );
          return toolResult(
            {
              bank: result.bank,
              reason: "revoked",
              status: "revoked",
            },
            `Revoked local project "${existing.label}" (${existing.id}).` +
              (result.archivePath
                ? ` Archived bank: ${result.archivePath}.`
                : " No project bank found to archive."),
          );
        }
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
