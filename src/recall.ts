import { bankExists, GLOBAL_BANK, type RoutingContext } from "./banks.ts";
import { type CliOptions, runMnemosyne } from "./cli.ts";
import type { MemoryKind } from "./kinds.js";
import { decodeSourceMetadata } from "./operations.js";

import {
  decideRecall,
  type RecallDecision,
  type RecallPolicy,
} from "./recall-policy.js";

interface RawRecallRow {
  content?: unknown;
  id?: unknown;
  scope?: unknown;
  score?: unknown;
  source?: unknown;
}

interface RawRecallPayload {
  engine?: unknown;
  explain?: {
    embedding?: {
      available?: unknown;
    };
    stages?: Array<{
      fallback_used?: unknown;
      name?: unknown;
    }>;
  };
  results?: unknown;
}
export type RecallRunner = (args: string[], options?: CliOptions) => Promise<string>;

export interface RecallRequest {
  context: RoutingContext;
  globalLimit?: number;
  limit?: number;
  projectLimit?: number;
  query: string;
}

export interface RecallProvenance {
  bank: string;
  layer: "T1";
  source: "mnemosyne";
}

export interface RecallItem {
  bank: string;
  content: string;
  id: string | null;
  kind: MemoryKind | null;
  provenance: RecallProvenance;
  scope: string;
  score: number;
  source?: string;
}

export interface RecallResponse {
  queriedBanks: string[];
  results: RecallItem[];
  retrieval: {
    embeddingAvailable: boolean;
    fallback: boolean;
    mode: "hybrid";
  };
}

function isRawRecallRow(value: unknown): value is RawRecallRow {
  return typeof value === "object" && value !== null;
}

function parseRecallOutput(output: string): {
  embeddingAvailable: boolean;
  fallback: boolean;
  rows: RawRecallRow[];
} {
  try {
    const parsed = JSON.parse(output) as RawRecallPayload;
    const rows = Array.isArray(parsed.results)
      ? parsed.results.filter(isRawRecallRow)
      : [];
    const embeddingAvailable = parsed.explain?.embedding?.available !== false;
    const fallback =
      parsed.explain?.embedding?.available === false ||
      parsed.explain?.stages?.some(
        (stage) => stage.name === "wm_primary" && stage.fallback_used === true,
      ) === true;
    return {
      embeddingAvailable,
      fallback,
      rows,
    };
  } catch {
    return {
      embeddingAvailable: false,
      fallback: true,
      rows: [],
    };
  }
}

function toRecallItems(bank: string, rows: RawRecallRow[]): RecallItem[] {
  return rows.flatMap((row) => {
    if (typeof row.content !== "string") return [];
    const decoded =
      typeof row.source === "string"
        ? decodeSourceMetadata(row.source)
        : {
            kind: null,
            source: undefined,
          };
    return [
      {
        bank,
        content: row.content,
        id: typeof row.id === "string" ? row.id : null,
        kind: decoded.kind,
        scope: typeof row.scope === "string" ? row.scope : "global",
        score: typeof row.score === "number" ? row.score : 0,
        provenance: {
          bank,
          layer: "T1",
          source: "mnemosyne",
        },
        ...(decoded.source
          ? {
              source: decoded.source,
            }
          : {}),
      },
    ];
  });
}

async function recallBank(
  query: string,
  bank: string,
  limit: number,
  dataDir: string,
  run: RecallRunner,
): Promise<{
  items: RecallItem[];
  embeddingAvailable: boolean;
  fallback: boolean;
}> {
  const options: CliOptions = {
    dataDir,
  };
  if (bank !== GLOBAL_BANK) options.bank = bank;
  const output = await run(
    [
      "recall",
      query,
      String(limit),
      "--explain",
      "--json",
    ],
    options,
  );
  const parsed = parseRecallOutput(output);
  const items = toRecallItems(bank, parsed.rows);
  return {
    embeddingAvailable: parsed.embeddingAvailable,
    fallback: parsed.fallback,
    items:
      bank === GLOBAL_BANK
        ? items.filter(
            (item) =>
              item.kind === "global_preference" || item.kind === "global_workflow",
          )
        : items,
  };
}

const DEFAULT_RECALL_LIMIT = 5;
const MAX_RECALL_LIMIT = 50;

function boundedLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_RECALL_LIMIT, Math.max(1, Math.trunc(value)));
}

export async function recall(
  request: RecallRequest,
  run: RecallRunner = runMnemosyne,
): Promise<RecallResponse> {
  const limit = boundedLimit(request.limit, DEFAULT_RECALL_LIMIT);
  const projectLimit = boundedLimit(request.projectLimit, limit);
  const globalLimit = boundedLimit(request.globalLimit, limit);
  const queriedBanks: string[] = [];
  const batches: Array<
    Promise<{
      items: RecallItem[];
      embeddingAvailable: boolean;
      fallback: boolean;
    }>
  > = [];

  if (
    request.context.projectBank &&
    bankExists(request.context.dataDir, request.context.projectBank)
  ) {
    queriedBanks.push(request.context.projectBank);
    batches.push(
      recallBank(
        request.query,
        request.context.projectBank,
        projectLimit,
        request.context.dataDir,
        run,
      ),
    );
  }

  queriedBanks.push(GLOBAL_BANK);
  batches.push(
    recallBank(request.query, GLOBAL_BANK, globalLimit, request.context.dataDir, run),
  );

  const batchesResult = await Promise.all(batches);
  const seen = new Set<string>();
  const results = batchesResult
    .flatMap((batch) => batch.items)
    .filter((item) => {
      const key = item.id ? `id:${item.id}` : `content:${item.content.trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => ({
      ...item,
      content:
        item.content.length > 500 ? `${item.content.slice(0, 500)}…` : item.content,
    }));
  const retrieval = batchesResult.reduce(
    (state, batch) => ({
      embeddingAvailable: state.embeddingAvailable && batch.embeddingAvailable,
      fallback: state.fallback || batch.fallback,
      mode: "hybrid" as const,
    }),
    {
      embeddingAvailable: true,
      fallback: false,
      mode: "hybrid" as const,
    },
  );

  results.sort((left, right) => right.score - left.score);
  return {
    queriedBanks,
    results: results.slice(0, limit),
    retrieval,
  };
}

export interface PolicyRecallResponse {
  decision: RecallDecision;
  response: RecallResponse | null;
}

export async function recallWithPolicy(
  request: RecallRequest,
  policy: RecallPolicy,
  run: RecallRunner = runMnemosyne,
  paused = false,
): Promise<PolicyRecallResponse> {
  const decision = decideRecall(policy, request.query, paused);
  if (!decision.shouldRecall)
    return {
      decision,
      response: null,
    };
  return {
    decision,
    response: await recall(request, run),
  };
}
