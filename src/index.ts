import { existsSync } from "node:fs";
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
import { type CandidateStore, createCandidateStore } from "./candidate-lifecycle.ts";
import { formatL0Status, l0Status, reconcile } from "./cli/l0.js";
import { runMigrateCommand } from "./cli/migrate.ts";
import { legacyDataDirExists, loadConfig, saveUserConfig } from "./config.ts";
import { openConsole } from "./console.ts";
import { classifyProhibitedContent } from "./content-policy.ts";
import { createEvidenceRecord } from "./evidence.ts";
import { clearFooterStatus, setFooterStatus } from "./footer.ts";
import { resolveProjectIdentity } from "./identity.ts";
import { isMemoryKind, type MemoryKind } from "./kinds.ts";
import { createL0Coordinator, type L0Coordinator } from "./l0/l0-runtime.ts";
import { exportMarkdown, validateExport } from "./markdown-export/exporter.js";
import {
  createMnemosyneAdapter,
  type MnemosyneRunner,
  type T1MemoryOperation,
} from "./operations.ts";
import {
  generatePendingCandidate,
  type PendingCandidateReason,
} from "./pending-candidate.ts";
import { type RecallResponse, recall, recallWithPolicy } from "./recall.ts";
import { decideRecall } from "./recall-policy.ts";
import { routeMemoryKind } from "./routing.ts";
import {
  inspectSleepCapability,
  type SleepCapabilityResult,
} from "./sleep-capability.ts";
import { executeSleep } from "./sleep-execution.ts";
import {
  type MemoryStatus,
  renderStatus,
  todayStored,
  visibleBankDiskBytes,
} from "./status.ts";
import { createMemorySurface } from "./surface.ts";
import { renderCallLine, renderToolLine } from "./tool-rendering.ts";

const SLEEP_COMMAND_PATTERN = /^\s*sleep\s+/m;
type ToolStatus =
  | "candidate"
  | "deleted"
  | "error"
  | "executed"
  | "recalled"
  | "rejected"
  | "stored";

interface ToolDetails {
  bank?: string;
  candidateId?: string;
  id?: string | null;
  kind?: MemoryKind;
  queriedBanks?: string[];
  reason?: string;
  resultCount?: number;
  scope?: "global" | "session";
  status: ToolStatus;
}

export interface XpiMemoDependencies {
  env?: NodeJS.ProcessEnv;
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
  l0: L0Coordinator;
  run: MnemosyneRunner;
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

function realTool<TParams extends TSchema>(
  name: string,
  label: string,
  description: string,
  parameters: TParams,
  execute: (
    params: Static<TParams>,
    ctx: ExtensionContext,
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
        const result = await execute(params, ctx);
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

function createRuntime(cwd: string, dependencies: XpiMemoDependencies): Runtime {
  const configResult = loadConfig({
    env: dependencies.env,
  });
  const project = (dependencies.resolveProjectIdentity ?? resolveProjectIdentity)(cwd);
  const context: RoutingContext = {
    dataDir: configResult.config.dataDir,
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
  const candidates = createCandidateStore({
    adapter,
    statePath: join(configResult.config.dataDir, "candidates.json"),
  });
  const l0 = createL0Coordinator({
    dataDir: configResult.config.dataDir,
    enabled: configResult.config.l0Enabled,
  });
  return {
    adapter,
    audit,
    candidates,
    config: configResult.config,
    context,
    l0,
    run,
  };
}

function pendingReasonFor(kind: MemoryKind): PendingCandidateReason {
  if (kind === "project_decision") return "project-decision";
  if (kind === "project_gotcha") return "broad-gotcha";
  return "high-impact-durable";
}

function operationFor(params: RememberParams, runtime: Runtime): T1MemoryOperation {
  const kindValue = params.kind ?? "session_context";
  if (!isMemoryKind(kindValue)) {
    throw new Error(`Unsupported memory kind: ${kindValue}`);
  }
  const evidence = createEvidenceRecord({
    confidence: 1,
    provenance: "pi:xpi_memo_remember",
    source: params.source?.trim() || "xpi_memo_remember",
    type: "explicit-user-statement",
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
      source: evidence.source,
      timestamp: evidence.timestamp,
    },
  };
}

const rememberParameters = Type.Object({
  content: Type.String({
    description: "Candidate memory content",
  }),
  kind: Type.Optional(
    Type.String({
      description: "T1 memory kind",
    }),
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
) {
  try {
    const runtime = createRuntime(ctx.cwd, dependencies);
    const operation = operationFor(params, runtime);
    const classification = classifyProhibitedContent({
      content: operation.content,
    });
    if (classification) {
      const reason = `prohibited-content:${classification}`;
      runtime.audit.record("rejection", {
        kind: operation.kind,
        reason,
        scope: operation.scope,
        status: "rejected",
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
        kind: operation.kind,
        reason,
        scope: operation.scope,
        status: "rejected",
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
    const candidate = generatePendingCandidate({
      content: operation.content,
      context: runtime.context,
      explicitStable:
        operation.kind === "global_preference" || operation.kind === "global_workflow",
      kind: operation.kind,
      rationale: "This memory requires T1 write governance before persistence.",
      reason: pendingReasonFor(operation.kind),
      verified: false,
      evidence: {
        confidence: operation.confidence,
        provenance: operation.provenance,
        source: operation.source.source,
        timestamp: operation.source.timestamp,
        type: operation.source.evidenceType,
      },
    });
    if (!candidate && runtime.config.paused) {
      const reason = "paused";
      runtime.audit.record("rejection", {
        kind: operation.kind,
        reason,
        scope: operation.scope,
        status: "rejected",
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
    if (candidate) {
      const added = runtime.candidates.add(candidate, operation);
      runtime.l0.recordSafe("candidate_created", {
        bank: candidate.targetBank,
        candidateId: candidate.id,
        kind: candidate.kind,
        reason: candidate.reason,
        scope: candidate.targetScope,
      });
      runtime.audit.record("candidate", {
        bank: candidate.targetBank,
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
      const confirmed = await ctx.ui.confirm(
        "Confirm T1 memory",
        `Store ${candidate.kind} in ${candidate.targetBank}?\n\n${candidate.content}`,
      );
      if (confirmed) {
        if (
          operation.targetBank !== GLOBAL_BANK &&
          !(await ensureProjectBank(runtime.context, runtime.run))
        ) {
          return toolResult(
            {
              bank: candidate.targetBank,
              candidateId: candidate.id,
              kind: candidate.kind,
              reason: "project-bank-unavailable",
              scope: candidate.targetScope,
              status: "error",
            },
            "Project bank is unavailable; memory was not stored.",
          );
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
      runtime.audit.record("fallback", {
        bank: operation.targetBank,
        kind: operation.kind,
        reason: "project-bank-unavailable",
        scope: operation.scope,
        status: "rejected",
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
      bank: operation.targetBank,
      kind: operation.kind,
      projectBank: runtime.context.projectBank,
      scope: operation.scope,
    });
    // Dual-write: L0 first (source of truth); abort the operation if it fails.
    runtime.l0.record("t1_memory_write", {
      bank: operation.targetBank,
      confidence: operation.confidence,
      content: operation.content,
      kind: operation.kind,
      scope: operation.scope,
    });
    const stored = await runtime.adapter.store(operation);
    runtime.audit.record("write", {
      bank: operation.targetBank,
      confidence: operation.confidence,
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
    return toolResult(
      {
        reason: error instanceof Error ? error.message : "memory-write-failed",
        status: "error",
      },
      "Memory write failed.",
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

async function executeRecall(
  params: RecallParams,
  ctx: ExtensionContext,
  dependencies: XpiMemoDependencies,
) {
  try {
    const runtime = createRuntime(ctx.cwd, dependencies);
    const limit = params.limit ?? runtime.config.limit;
    const response: RecallResponse = await recall(
      {
        context: runtime.context,
        globalLimit: Math.min(runtime.config.globalLimit, limit),
        limit,
        projectLimit: Math.min(runtime.config.projectLimit, limit),
        query: params.query,
      },
      runtime.run,
    );
    runtime.audit.record("recall", {
      fallback: response.retrieval.fallback,
      reason: params.query,
      status: "recalled",
    });
    return toolResult(
      {
        queriedBanks: response.queriedBanks,
        reason: response.retrieval.fallback ? "fts5-fallback" : undefined,
        resultCount: response.results.length,
        status: "recalled",
      },
      JSON.stringify(response),
    );
  } catch (error) {
    return toolResult(
      {
        reason: error instanceof Error ? error.message : "memory-recall-failed",
        status: "error",
      },
      "Memory recall failed.",
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
    const capability = await capabilityForSleep(runtime, params.authorized);
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
      },
      (args) =>
        runtime.run(args, {
          dataDir: runtime.config.dataDir,
        }),
    );
    runtime.audit.record("sleep-authorization", {
      reason: result.reason,
      status: result.executed ? "executed" : "rejected",
      trigger: "explicit-user",
    });
    return toolResult(
      {
        reason: result.reason,
        status: result.executed ? "executed" : "rejected",
      },
      result.executed ? "Sleep completed." : `Sleep not executed: ${result.reason}.`,
    );
  } catch (error) {
    return toolResult(
      {
        reason: error instanceof Error ? error.message : "sleep-failed",
        status: "error",
      },
      "Sleep failed.",
    );
  }
}

async function statusForContext(
  cwd: string,
  dependencies: XpiMemoDependencies = {},
): Promise<MemoryStatus> {
  const config = loadConfig({
    env: dependencies.env,
  }).config;
  const project = (dependencies.resolveProjectIdentity ?? resolveProjectIdentity)(cwd);
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
  let sleepCommandSupported = false;
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
  const pendingCandidates = createCandidateStore({
    adapter: createMnemosyneAdapter(run),
    statePath: join(config.dataDir, "candidates.json"),
  }).list().length;
  const globalDbPath = bankDbPath(config.dataDir, GLOBAL_BANK);
  const projectDbPath = projectBank ? bankDbPath(config.dataDir, projectBank) : null;
  const storage = {
    dataDir: config.dataDir,
    legacyDataDirExists: legacyDataDirExists(),
    files: {
      audit: existsSync(join(config.dataDir, "audit.json")),
      candidates: existsSync(join(config.dataDir, "candidates.json")),
      globalDb: existsSync(globalDbPath),
      projectDb: projectDbPath ? existsSync(projectDbPath) : false,
    },
  };
  return renderStatus({
    currentProject: project
      ? {
          bank: projectBank as string,
          id: project.id,
          label: project.label,
        }
      : null,
    diskBytes: visibleBankDiskBytes(config.dataDir, projectBank),
    fallback: null,
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
    retrieval: {
      embeddingAvailable: null,
      mode: "hybrid",
    },
    sleep: {
      dedicatedModelSupported: false,
      enabled: false,
      sleepCommandSupported,
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
function renderMemoryContext(response: RecallResponse): string | null {
  if (response.results.length === 0) return null;
  const lines = response.results.map((item, index) => {
    const content = item.content.replace(/[\r\n]+/g, " ");
    const kind = item.kind ? ` [${item.kind}]` : "";
    return `${index + 1}. ${content}${kind}`;
  });
  return `<memories>\n${lines.join("\n")}\n</memories>`;
}

async function recallForContext(
  ctx: ExtensionContext,
  dependencies: XpiMemoDependencies,
  query: string,
  policy: "active" | "high-value-auto",
  surface: ReturnType<typeof createMemorySurface>,
): Promise<string | null> {
  const runtime = createRuntime(ctx.cwd, dependencies);
  surface.begin(policy === "active" ? "inject" : "recall");
  try {
    const result = await recallWithPolicy(
      {
        context: runtime.context,
        globalLimit: runtime.config.globalLimit,
        limit: runtime.config.limit,
        projectLimit: runtime.config.projectLimit,
        query,
      },
      policy,
      runtime.run,
      runtime.config.paused,
    );
    const context = result.response ? renderMemoryContext(result.response) : null;
    if (context)
      surface.complete(
        policy === "active" ? "inject" : "recall",
        result.response?.results.length ?? 0,
      );
    else surface.clear();
    return context;
  } catch {
    surface.fail();
    return null;
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
      const runtime = createRuntime(ctx.cwd, dependencies);
      await openConsole(
        ctx,
        await statusForContext(ctx.cwd, dependencies),
        runtime.config,
        dependencies.env ?? process.env,
        runtime.candidates.list(),
        {
          confirm: ctx.ui.confirm.bind(ctx.ui),
          async reviewCandidate(candidate) {
            const confirmed = await ctx.ui.confirm(
              "Confirm T1 memory",
              `Store ${candidate.kind} in ${candidate.targetBank}?\n\n${candidate.content}`,
            );
            if (confirmed) {
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
                scope: candidate.targetScope,
                status: stored.status,
              });
              if (stored.status === "stored")
                setFooterStatus(ctx, runtime.config.paused, true);
            } else {
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
            }
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
    description: "Show the XpiMemo T1 status",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        JSON.stringify(await statusForContext(ctx.cwd, dependencies)),
        "info",
      );
    },
  });

  pi.registerCommand("xpi-memo-l0", {
    description: "L0 session-trace status; pass --reconcile to check divergence",
    handler: async (args, ctx) => {
      const env = dependencies.env ?? process.env;
      if (args.includes("--reconcile")) {
        const report = await reconcile({
          env,
        });
        const lines = [
          `L0 writes: ${report.l0Writes}`,
          `Audit writes: ${report.auditWrites}`,
          ...report.divergences.map((item) => `divergence: ${item}`),
          report.canReplay
            ? "Replay available: L0 is the source of truth; missing audit entries can be regenerated."
            : "No replay needed.",
        ];
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }
      ctx.ui.notify(
        formatL0Status(
          l0Status({
            env,
          }),
        ),
        "info",
      );
    },
  });

  pi.registerCommand("xpi-memo-migrate", {
    description: "Migrate data from memoharness (usage: /xpi-memo-migrate --help)",
    handler: async (args, ctx) => {
      const output = await runMigrateCommand(args.split(WS_SPLIT).filter(Boolean));
      ctx.ui.notify(output, "info");
    },
  });

  pi.registerCommand("xpi-memo-export", {
    description:
      "Export L0 events to Markdown (usage: /xpi-memo-export [--session <id>] [--force] [--validate])",
    handler: async (args, ctx) => {
      const env = dependencies.env ?? process.env;
      const flags = args.split(WS_SPLIT).filter(Boolean);
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
      const config = loadConfig({
        env,
      }).config;
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
  const surfaceByContext = new WeakMap<
    object,
    ReturnType<typeof createMemorySurface>
  >();
  const pendingStartupContext = new WeakMap<object, Promise<string | null>>();
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

  pi.on("input", (event) => {
    // 5.4 user_message capture: best-effort, never blocks the session.
    l0ForHooks().recordSafe("user_message", {
      source: event.source,
      text: event.text,
    });
  });
  pi.on("tool_call", (event) => {
    l0ForHooks().recordSafe("tool_call", {
      arguments: event.input,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
    });
  });
  pi.on("tool_result", (event) => {
    l0ForHooks().recordSafe("tool_result", {
      isError: event.isError,
      toolCallId: event.toolCallId,
    });
  });
  pi.on("session_compact", (event) => {
    l0ForHooks().recordSafe("compaction", {
      reason: event.reason,
      summary: "session context compacted",
    });
  });

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode === "tui")
      setFooterStatus(
        ctx,
        loadConfig({
          env: dependencies.env,
        }).config.paused,
      );
    pendingStartupContext.set(
      ctx,
      recallForContext(
        ctx,
        dependencies,
        "restore project context decisions constraints preferences unfinished work",
        "active",
        getSurface(ctx),
      ),
    );
  });
  pi.on("before_agent_start", async (event, ctx) => {
    const startup = pendingStartupContext.get(ctx);
    pendingStartupContext.delete(ctx);
    const startupContext = startup ? await startup : null;
    const runtime = createRuntime(ctx.cwd, dependencies);
    const decision = decideRecall(
      runtime.config.recallPolicy,
      event.prompt,
      runtime.config.paused,
    );
    const promptContext = decision.shouldRecall
      ? await recallForContext(
          ctx,
          dependencies,
          event.prompt,
          "high-value-auto",
          getSurface(ctx),
        )
      : null;
    const contexts = [
      startupContext,
      promptContext,
    ].filter((value): value is string => Boolean(value));
    if (contexts.length === 0) return;
    const uniqueLines = [
      ...new Set(contexts.join("\n").split("\n")),
    ];
    return {
      message: {
        content: uniqueLines.join("\n"),
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
        "restore project context decisions constraints preferences unfinished work",
        "active",
        getSurface(ctx),
      ),
    );
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    pendingStartupContext.delete(ctx);
    getSurface(ctx).clear();
    clearFooterStatus(ctx);
    // Auto-export on session end (Task 9.3): best-effort, never blocks shutdown.
    const config = loadConfig({
      env: dependencies.env,
    }).config;
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
  });

  pi.registerTool(
    realTool(
      "xpi_memo_remember",
      "XpiMemo Remember",
      "Store a governed T1 memory after routing and evidence validation.",
      rememberParameters,
      (params, ctx) => executeRemember(params, ctx, dependencies),
    ),
  );

  pi.registerTool(
    realTool(
      "xpi_memo_recall",
      "XpiMemo Recall",
      "Recall bounded T1 memory for the current project and global scope.",
      recallParameters,
      (params, ctx) => executeRecall(params, ctx, dependencies),
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
          await runtime.run(
            [
              "delete",
              params.memoryId,
            ],
            {
              dataDir: runtime.config.dataDir,
            },
          );
          runtime.audit.record("rejection", {
            reason: "memory-deleted-by-user",
            status: "deleted",
          });
          return toolResult(
            {
              id: params.memoryId,
              reason: "memory-deleted-by-user",
              status: "deleted",
            },
            `Memory ${params.memoryId} deleted.`,
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
}
