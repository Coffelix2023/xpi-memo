/**
 * Bounded projection source trace (change add-mental-model-projections,
 * task 5.3).
 *
 * Answers "why does this projection exist, and what is it derived from?" without
 * dumping any body. Each source id is resolved through the existing exact-ID T1
 * read path, and only its id, kind, scope, and resolution verdict are reported:
 * never the source content, never the generated body, never the whole bank.
 *
 * A missing exact-ID capability or a failing read degrades to a bounded
 * `unavailable` verdict on that row instead of failing the trace.
 */

import type { BankStateReader } from "../markdown-export/bank-state.js";
import type { ExactMemoryReader } from "../operations.js";
import { evaluateMentalModels } from "./evaluate.js";
import { createMentalModelSourceMemo } from "./memo.js";
import { mentalModelOwnerBank, resolveMentalModelTarget } from "./owner.js";
import {
  digestPrefix,
  type MentalModelDefinition,
  type MentalModelState,
} from "./types.js";

/** Bounded number of source references resolved per trace. */
export const MAX_TRACED_SOURCES = 16;

/** Verdict for one source reference. `unavailable` is never a "missing" claim. */
export type MentalModelTraceResolution = "missing" | "resolved" | "unavailable";

export interface MentalModelTraceSource {
  id: string;
  kind?: string;
  resolution: MentalModelTraceResolution;
  scope?: string;
}

export interface MentalModelTrace {
  /** A projection is derived content; it is never original evidence. */
  classification: "derived";
  definitionId: string;
  digestPrefix: string | null;
  ownerKey: string;
  refreshedAt: string | null;
  scope: "global" | "project";
  sourceBoundary: number | null;
  sourceCount: number;
  sources: MentalModelTraceSource[];
  state: MentalModelState;
  /** True when more source references exist than the trace reports. */
  truncated: boolean;
}

export interface MentalModelTraceOptions {
  dataDir: string;
  definition: MentalModelDefinition;
  /** Injected exact-ID reader; absence means the CLI cannot be probed. */
  exactIdReadAvailable?: boolean;
  isDefinitionEnabled: (definitionId: string) => boolean;
  projectBank: string | null;
  read: BankStateReader;
  readMemoryById?: ExactMemoryReader;
}

async function resolveSource(
  id: string,
  options: MentalModelTraceOptions,
  bank: string,
): Promise<MentalModelTraceSource> {
  if (options.exactIdReadAvailable !== true || !options.readMemoryById)
    return {
      id,
      resolution: "unavailable",
    };
  try {
    const memory = await options.readMemoryById(id, options.dataDir, bank);
    if (!memory)
      return {
        id,
        resolution: "missing",
      };
    return {
      id,
      ...(memory.kind
        ? {
            kind: memory.kind,
          }
        : {}),
      resolution: "resolved",
      ...(memory.scope
        ? {
            scope: memory.scope,
          }
        : {}),
    };
  } catch {
    // A failed read is "could not check", not "the row is gone".
    return {
      id,
      resolution: "unavailable",
    };
  }
}

/**
 * Trace one definition's current projection.
 *
 * Returns `null` when the definition has no resolvable owner (project scope
 * without a recognized project identity): there is nothing safe to trace, and
 * falling back to another bank is exactly what the spec forbids.
 */
export async function traceMentalModelProjection(
  options: MentalModelTraceOptions,
): Promise<MentalModelTrace | null> {
  const target = resolveMentalModelTarget({
    dataDir: options.dataDir,
    definition: options.definition,
    projectBank: options.projectBank,
  });
  if (!target) return null;

  const evaluations = await evaluateMentalModels({
    dataDir: options.dataDir,
    isDefinitionEnabled: options.isDefinitionEnabled,
    memo: createMentalModelSourceMemo(),
    projectBank: options.projectBank,
    read: options.read,
    sessionId: "",
    definitions: [
      options.definition,
    ],
  });
  const evaluation = evaluations[0];
  if (!evaluation) return null;

  const projection = evaluation.projection;
  const sourceIds = projection?.sourceIds ?? [];
  const reported = sourceIds.slice(0, MAX_TRACED_SOURCES);
  const bank = mentalModelOwnerBank(target.owner);
  const sources: MentalModelTraceSource[] = [];
  // biome-ignore lint/performance/noAwaitInLoops: bounded to MAX_TRACED_SOURCES rows, reported in stable order.
  for (const id of reported) sources.push(await resolveSource(id, options, bank));

  return {
    classification: "derived",
    definitionId: options.definition.id,
    digestPrefix: digestPrefix(evaluation.freshness.digestPrefix),
    ownerKey: target.owner.key,
    refreshedAt: projection?.refreshedAt ?? null,
    scope: target.owner.scope,
    sourceBoundary: projection?.sourceBoundary ?? null,
    sourceCount: sourceIds.length,
    sources,
    state: evaluation.freshness.state,
    truncated: sourceIds.length > reported.length,
  };
}

/** Render a trace as bounded, body-free text for a user-visible surface. */
export function formatMentalModelTrace(trace: MentalModelTrace): string {
  const lines = [
    `Mental model (${trace.classification}): ${trace.definitionId}`,
    `state: ${trace.state}  owner: ${trace.ownerKey}  scope: ${trace.scope}`,
    `sources: ${trace.sourceCount}  boundary: ${
      trace.sourceBoundary === null ? "unknown" : String(trace.sourceBoundary)
    }  digest: ${trace.digestPrefix ?? "unknown"}`,
    `refreshed: ${trace.refreshedAt ?? "never"}`,
  ];
  if (trace.sources.length === 0) {
    lines.push("No source references: nothing has been committed for this model.");
    return lines.join("\n");
  }
  lines.push(`Source references (derived; bodies are never shown):`);
  for (const source of trace.sources) {
    const kind = source.kind ?? "unknown-kind";
    const scope = source.scope ? `, ${source.scope}` : "";
    lines.push(`- ${source.id} [${kind}${scope}] ${source.resolution}`);
  }
  if (trace.truncated)
    lines.push(`… ${trace.sourceCount - trace.sources.length} more not shown`);
  return lines.join("\n");
}
