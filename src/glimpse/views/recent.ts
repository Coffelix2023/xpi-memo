import { describeMemoryKindOrNull } from "../../kinds.js";
import type { PanelLanguage } from "../../panel-text.js";
import type { MemoryStatus } from "../../status.js";
import { clockTime } from "../format.js";
import { el, textEl } from "../html.js";
import { RECENT_SHORT } from "../short-codes.js";
import { glimpseText } from "../text.js";

/**
 * The recent view: the six-column activity table.
 *
 * Reads `status.recentEntries` — the same array the terminal panel's Recent tab
 * renders — so the two surfaces can never disagree about what happened.
 *
 * A status with no entry in `STATUS_TINT` still renders: the symbol falls back
 * to a neutral dot and the pill to the muted class. An unknown status is a
 * future enum value, not a reason to drop the row.
 */
const STATUS_SYMBOL: Readonly<Record<string, string>> = {
  degraded: "⚠",
  hit: "✓",
  pending: "○",
  rejected: "✗",
  stored: "✓",
};

/** Colour only, for the leading symbol. */
const STATUS_TINT: Readonly<Record<string, string>> = {
  degraded: "t-warn",
  hit: "t-ok",
  pending: "t-dim",
  rejected: "t-danger",
  stored: "t-ok",
};

/** Rounded background, for the status word itself. */
const STATUS_PILL: Readonly<Record<string, string>> = {
  degraded: "pill-warn",
  hit: "pill-ok",
  pending: "pill-dim",
  rejected: "pill-danger",
  stored: "pill-ok",
};

export interface RecentViewInput {
  language: PanelLanguage;
  status: MemoryStatus;
}

/** The six columns, in the order the terminal panel shows them. */
const COLUMN_KEYS = [
  "",
  "recent.action",
  "recent.kind",
  "recent.bank",
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

export function renderRecentView(input: RecentViewInput): string {
  const { language, status } = input;
  const entries = status.recentEntries ?? [];
  const isEmpty = entries.length === 0;

  const rows = entries
    .map((entry) => {
      const key = entry.status ?? "";
      const symbol = STATUS_SYMBOL[key] ?? "·";
      const tint = STATUS_TINT[key] ?? "t-dim";
      const pill = STATUS_PILL[key] ?? "pill-dim";

      return el(
        "div",
        {
          class: "tr",
          role: "row",
        },
        textEl(
          "span",
          {
            class: `td td-symbol ${tint}`,
          },
          symbol,
        ) +
          textEl(
            "span",
            {
              class: "td",
            },
            entry.action,
          ) +
          textEl(
            "span",
            {
              class: "td td-muted",
            },
            describeMemoryKindOrNull(entry.kind)?.label ?? entry.kind ?? "—",
          ) +
          textEl(
            "span",
            {
              class: "td",
            },
            entry.bank ?? "—",
          ) +
          el(
            "span",
            {
              class: "td",
            },
            textEl(
              "span",
              {
                class: `pill ${pill}`,
              },
              entry.status ?? "—",
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

  return table + empty;
}
