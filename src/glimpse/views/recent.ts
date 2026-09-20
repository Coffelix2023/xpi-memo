import type { AuditMetadata } from "../../audit.js";
import { describeMemoryKindOrNull } from "../../kinds.js";
import type { PanelLanguage } from "../../panel-text.js";
import type { MemoryStatus } from "../../status.js";
import { clockTime } from "../format.js";
import { el, textEl } from "../html.js";
import { RECENT_SHORT } from "../short-codes.js";
import { fillTemplate, glimpseText } from "../text.js";

/**
 * The recent view: what happened lately, one row per audit entry.
 *
 * Reads `status.recentEntries` — the same array the terminal panel's Recent tab
 * renders — so the two surfaces can never disagree about what happened.
 *
 * The columns are the ones a reviewer can act on. `kind` and `bank` used to hold
 * a column each, which left most rows a line of dashes: the audit log writes
 * different metadata per action, and `feedback` — by far the most frequent entry
 * — carries neither. They are folded into one summary cell now.
 */
export interface RecentViewInput {
  language: PanelLanguage;
  status: MemoryStatus;
}

/** One row of the activity table. */
type RecentEntry = NonNullable<MemoryStatus["recentEntries"]>[number];

/**
 * How one status reads: the leading symbol, that symbol's colour class, and the
 * pill around the word.
 *
 * One table rather than three parallel ones — a status needs all three at the
 * same time, and three maps would be three places to forget. The vocabulary is
 * the one the audit log actually writes, not a hand-invented set.
 */
const STATUS_STYLE: Readonly<
  Record<
    string,
    {
      pill: string;
      symbol: string;
      tint: string;
    }
  >
> = {
  "budget-exhausted": {
    pill: "pill-warn",
    symbol: "⚠",
    tint: "t-warn",
  },
  conflict: {
    pill: "pill-warn",
    symbol: "⚠",
    tint: "t-warn",
  },
  degraded: {
    pill: "pill-warn",
    symbol: "⚠",
    tint: "t-warn",
  },
  deleted: {
    pill: "pill-dim",
    symbol: "○",
    tint: "t-dim",
  },
  executed: {
    pill: "pill-ok",
    symbol: "✓",
    tint: "t-ok",
  },
  failed: {
    pill: "pill-danger",
    symbol: "✗",
    tint: "t-danger",
  },
  "no-backend": {
    pill: "pill-warn",
    symbol: "⚠",
    tint: "t-warn",
  },
  pending: {
    pill: "pill-dim",
    symbol: "○",
    tint: "t-dim",
  },
  recalled: {
    pill: "pill-ok",
    symbol: "✓",
    tint: "t-ok",
  },
  rejected: {
    pill: "pill-danger",
    symbol: "✗",
    tint: "t-danger",
  },
  routing_rejected: {
    pill: "pill-danger",
    symbol: "✗",
    tint: "t-danger",
  },
  skipped: {
    pill: "pill-dim",
    symbol: "○",
    tint: "t-dim",
  },
  stored: {
    pill: "pill-ok",
    symbol: "✓",
    tint: "t-ok",
  },
  "timed-out": {
    pill: "pill-warn",
    symbol: "⚠",
    tint: "t-warn",
  },
  unresolved: {
    pill: "pill-dim",
    symbol: "○",
    tint: "t-dim",
  },
};

/**
 * The fallback for a status this build does not know.
 *
 * A status with no entry still renders: a neutral dot and the muted pill class.
 * An unknown status is a future enum value, not a reason to drop the row.
 */
const NEUTRAL_STATUS = {
  pill: "pill-dim",
  symbol: "·",
  tint: "t-dim",
} as const;

/** The four columns, in display order. */
const COLUMN_KEYS = [
  "",
  "recent.action",
  "recent.detail",
  "recent.status",
  "recent.time",
] as const;

function headerRow(language: PanelLanguage): string {
  const cells = COLUMN_KEYS.map((key) =>
    textEl(
      "span",
      {
        class: "td",
      },
      key ? glimpseText(key, language) : "",
    ),
  ).join("");

  return (
    el(
      "div",
      {
        class: "tr tr-head",
        role: "row",
      },
      cells,
    ) +
    el(
      "div",
      {
        class: "tr tr-divider",
      },
      "<span></span>",
    )
  );
}

/**
 * One labelled value from the audit log: dictionary first, raw code otherwise.
 *
 * An action or status added upstream after this build renders as its own code
 * rather than as a dictionary key — a new event kind must never blank a row, and
 * the code is still the truth about what happened.
 */
function labelled(
  prefix: string,
  value: string | undefined,
  language: PanelLanguage,
): string {
  if (!value) return "—";
  const key = `${prefix}.${value}`;
  const text = glimpseText(key, language);
  return text === key ? value : text;
}

/**
 * The metadata a reviewer reads, per action, in display order.
 *
 * The audit log writes a different block per action, and most of it is
 * bookkeeping a row has no use for: operation ids, policy versions, proposal
 * counters. Naming the useful fields per action is a table rather than a filter,
 * because "useful" is exactly the claim being made.
 *
 * Deliberately absent: `recall.reason`, which holds the search query — that is
 * the user's own words, and this panel is not the place to reprint them.
 */
const SUMMARY_FIELDS: Readonly<Record<string, readonly (keyof AuditMetadata)[]>> = {
  deletion: [
    "memoryId",
  ],
  extraction: [
    "outcome",
    "candidateCount",
    "storedCount",
  ],
  feedback: [
    "feedbackMode",
    "usage",
    "targetMemoryId",
  ],
  recall: [
    "backend",
    "resultCount",
    "injectedCount",
  ],
};

/**
 * One metadata field, as it should read.
 *
 * Field-name driven, not value-driven: `recalled` is a status on a recall row
 * and a usage on a feedback row, and the two want different words. A field with
 * no rule falls back to its raw value, which is still the truth.
 */
function fieldText(
  field: keyof AuditMetadata,
  value: unknown,
  language: PanelLanguage,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value);

  switch (field) {
    case "candidateCount":
      return fillTemplate(glimpseText("recent.count.candidates", language), {
        count: text,
      });
    case "feedbackMode":
      return labelled("recent.feedbackMode", text, language);
    case "injectedCount":
      return fillTemplate(glimpseText("recent.count.injected", language), {
        count: text,
      });
    case "memoryId":
    case "targetMemoryId":
      return `#${text}`;
    case "outcome":
      return labelled("recent.status", text, language);
    case "resultCount":
      return fillTemplate(glimpseText("recent.count.hits", language), {
        count: text,
      });
    case "storedCount":
      return fillTemplate(glimpseText("recent.count.stored", language), {
        count: text,
      });
    case "usage":
      return labelled("recent.usage", text, language);
    default:
      return text;
  }
}

/** Kind, bank, then whatever this action's own metadata has to say. */
function summaryParts(entry: RecentEntry, language: PanelLanguage): string[] {
  const parts: string[] = [];
  const kind = describeMemoryKindOrNull(entry.kind)?.label ?? entry.kind;
  if (kind) parts.push(kind);
  if (entry.bank) parts.push(entry.bank);

  const metadata: AuditMetadata = entry.metadata ?? {};
  for (const field of SUMMARY_FIELDS[entry.action] ?? []) {
    const text = fieldText(field, metadata[field], language);
    if (text !== undefined) parts.push(text);
  }
  return parts;
}

export function renderRecentView(input: RecentViewInput): string {
  const { language, status } = input;
  const entries = status.recentEntries ?? [];
  const isEmpty = entries.length === 0;

  const rows = entries
    .map((entry) => {
      const style = STATUS_STYLE[entry.status ?? ""] ?? NEUTRAL_STATUS;
      const summary = summaryParts(entry, language).join(" · ");

      return el(
        "div",
        {
          class: "tr",
          role: "row",
        },
        textEl(
          "span",
          {
            class: `td td-symbol ${style.tint}`,
          },
          style.symbol,
        ) +
          textEl(
            "span",
            {
              class: "td",
            },
            labelled("recent.action", entry.action, language),
          ) +
          textEl(
            "span",
            {
              class: "td td-muted",
            },
            summary || "—",
          ) +
          el(
            "span",
            {
              class: "td",
            },
            textEl(
              "span",
              {
                class: `pill ${style.pill}`,
              },
              labelled("recent.status", entry.status, language),
            ),
          ) +
          textEl(
            "span",
            {
              class: "td td-mono td-muted",
            },
            clockTime(entry.timestamp),
          ),
      );
    })
    .join("");

  // The page caption. Without it the table reads as an unfinished table: the
  // columns are audit metadata, and the rows are the last few events only.
  const hint = textEl(
    "p",
    {
      class: "view-hint",
    },
    glimpseText("recent.hint", language),
  );

  const table = el(
    "div",
    {
      // `tab.recent` rather than the `recent.status` column header: the table
      // is named after the view, not after one of its columns.
      "aria-label": glimpseText("tab.recent", language),
      class: "table-wrap",
      hidden: isEmpty,
      id: RECENT_SHORT.table,
      role: "table",
    },
    headerRow(language) + rows,
  );

  const empty = el(
    "div",
    {
      class: "empty-state",
      hidden: !isEmpty,
      id: RECENT_SHORT.empty,
    },
    textEl("strong", {}, glimpseText("recent.empty", language)) +
      textEl("span", {}, glimpseText("recent.emptyHint", language)),
  );

  return hint + table + empty;
}
