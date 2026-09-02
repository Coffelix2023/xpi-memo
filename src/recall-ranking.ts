import { describeMemoryKind, type MemoryKind } from "./kinds.js";
import type { RecallItem } from "./recall.js";

/**
 * Recall ranking for automatic injection (tasks 5.2-5.4).
 *
 * Pure, backend-agnostic post-processing over `RecallItem`s:
 * - query-intent weighting boosts the kinds the prompt asks about,
 * - superseded memories are filtered out,
 * - duplicate content is emitted once,
 * - standing and contextual memories are ranked separately and each role
 *   gets its own item and character budget,
 * - the output keeps a stable two-role injection shape (or null when empty).
 *
 * Explicit `xpi_memo_recall` output is untouched: this module is only wired
 * into automatic injection paths.
 */

export interface RecallRankingOptions {
  /** Per-role character budget (applied before truncation). */
  charBudget: number;
  /** Boost per kind when the query mentions that intent. */
  intentBoost?: number;
  /** Per-role item budget. */
  itemBudget: number;
  /** ISO now; recency decay uses this. */
  now?: Date;
}

export interface RankedRecallOutput {
  contextual: RecallItem[];
  /** Metadata for provenance-safe diagnostics; never carries memory bodies. */
  diagnostics: {
    deduplicated: number;
    items: number;
    roles: Array<{
      role: "contextual" | "standing";
      items: number;
      chars: number;
    }>;
    supersededFiltered: number;
  };
  standing: RecallItem[];
}

const DEFAULT_INTENT_BOOST = 0.25;
const DEFAULT_NOW = new Date();
/** Memories older than this contribute no recency boost. */
const RECENCY_HALF_LIFE_DAYS = 30;

const INTENT_KEYWORDS: ReadonlyArray<{
  kind: MemoryKind;
  keywords: readonly string[];
}> = [
  {
    kind: "project_decision",
    keywords: [
      "decide",
      "decided",
      "decision",
      "chose",
      "choice",
      "决定",
      "决策",
      "选了",
      "选择",
    ],
  },
  {
    kind: "project_constraint",
    keywords: [
      "constraint",
      "must",
      "cannot",
      "must not",
      "限制",
      "约束",
      "必须",
      "不能",
    ],
  },
  {
    kind: "project_gene",
    keywords: [
      "repo",
      "repository",
      "file",
      "module",
      "structure",
      "仓库",
      "文件",
      "模块",
      "结构",
    ],
  },
  {
    kind: "project_gotcha",
    keywords: [
      "gotcha",
      "pitfall",
      "trap",
      "gotcha",
      "坑",
      "陷阱",
      "注意",
    ],
  },
  {
    kind: "global_preference",
    keywords: [
      "prefer",
      "preference",
      "like",
      "style",
      "喜欢",
      "偏好",
      "习惯",
      "风格",
    ],
  },
  {
    kind: "global_workflow",
    keywords: [
      "workflow",
      "process",
      "how to",
      "flow",
      "流程",
      "步骤",
      "工作流",
      "方式",
    ],
  },
];

function normalizedQuery(query: string): string {
  return query.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function detectQueryIntent(query: string): Partial<Record<MemoryKind, number>> {
  const normalized = normalizedQuery(query);
  const intents: Partial<Record<MemoryKind, number>> = {};
  for (const { kind, keywords } of INTENT_KEYWORDS) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      intents[kind] = (intents[kind] ?? 0) + 1;
    }
  }
  return intents;
}

function ageDays(timestamp: string | undefined, now: Date): number | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, (now.getTime() - parsed) / 86_400_000);
}

function recencyBoost(timestamp: string | undefined, now: Date): number {
  const age = ageDays(timestamp, now);
  if (age === null) return 0;
  return Math.max(0, 1 - age / RECENCY_HALF_LIFE_DAYS);
}

function scoreOf(
  item: RecallItem,
  intents: Partial<Record<MemoryKind, number>>,
  boost: number,
  now: Date,
): number {
  const kind = item.kind;
  let score = item.score;
  if (kind && intents[kind]) score += intents[kind] * boost;
  // Project scope is prioritized for project-context prompts; global items
  // still surface for standing role but never outrank a project hit blindly.
  if (item.scope === "session") score -= 0.1;
  // Confidence (task 5.3): memories the backend reports as high-importance
  // rank above equal-scoring noise; absent confidence adds no bias.
  if (item.confidence !== undefined)
    score += Math.max(0, Math.min(1, item.confidence)) * 0.05;
  score += recencyBoost(item.timestamp, now) * 0.1;
  return score;
}

function isSuperseded(item: RecallItem): boolean {
  return typeof item.supersededBy === "string" && item.supersededBy.trim().length > 0;
}

function dedupeKey(item: RecallItem): string {
  // Task 5.3: duplicate content is emitted once regardless of row id, so the
  // same memory surfacing from both the project and global banks collapses.
  return `content:${item.content.trim().toLocaleLowerCase()}`;
}

/**
 * Rank, filter, dedupe, and budget the automatic-injection selection.
 * Returns null when nothing survives, so callers omit the memory block
 * instead of injecting an empty or raw trace block (task 5.4).
 */
export function rankRecallResults(
  items: readonly RecallItem[],
  query: string,
  options: RecallRankingOptions,
): RankedRecallOutput | null {
  const now = options.now ?? DEFAULT_NOW;
  const boost = options.intentBoost ?? DEFAULT_INTENT_BOOST;
  const intents = detectQueryIntent(query);

  let supersededFiltered = 0;
  const seen = new Set<string>();
  let deduplicated = 0;

  const eligible = items.filter((item) => {
    if (isSuperseded(item)) {
      supersededFiltered += 1;
      return false;
    }
    const key = dedupeKey(item);
    if (seen.has(key)) {
      deduplicated += 1;
      return false;
    }
    seen.add(key);
    return true;
  });

  const ranked = [
    ...eligible,
  ].sort(
    (left, right) =>
      scoreOf(right, intents, boost, now) - scoreOf(left, intents, boost, now),
  );

  const standing: RecallItem[] = [];
  const contextual: RecallItem[] = [];
  let standingChars = 0;
  let contextualChars = 0;

  for (const item of ranked) {
    const role = item.kind ? describeMemoryKind(item.kind).role : "standing";
    const bucket = role === "contextual" ? contextual : standing;
    const budget = role === "contextual" ? options.itemBudget : options.itemBudget;
    if (bucket.length >= budget) continue;
    const targetChars = role === "contextual" ? contextualChars : standingChars;
    if (targetChars + item.content.length > options.charBudget) continue;
    bucket.push(item);
    if (role === "contextual") contextualChars += item.content.length;
    else standingChars += item.content.length;
  }
  // Task 5.4: when nothing survives budgets/filters, omit the memory block.
  if (standing.length === 0 && contextual.length === 0) return null;

  return {
    contextual,
    standing,
    diagnostics: {
      deduplicated,
      items: eligible.length,
      roles: [
        {
          chars: contextualChars,
          items: contextual.length,
          role: "contextual",
        },
        {
          chars: standingChars,
          items: standing.length,
          role: "standing",
        },
      ],
      supersededFiltered,
    },
  };
}
