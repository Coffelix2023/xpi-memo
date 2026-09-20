import type { PanelLanguage } from "../../panel-text.js";
import type { MemoryStatus } from "../../status.js";
import {
  dailyBuckets,
  litSegments,
  METER_SEGMENTS,
  sparkHeights,
  TREND_DAYS,
  todayShare,
} from "../charts.js";
import { el, esc, textEl } from "../html.js";
import { STATUS_SHORT } from "../short-codes.js";
import { glimpseText, recallLine } from "../text.js";

/**
 * The status view: four KPI cards, an occupancy bar, a seven-day sparkline, and
 * the scrollable JSON snapshot.
 *
 * The snapshot keeps its own scrolling, matching the shipped
 * the retired `buildGlimpseHtml`: the raw payload is the diagnostic surface of last resort,
 * so it is bounded by a scroll region rather than truncated.
 *
 * Charts are normalised against the busiest day **in the window**, not against
 * a fixed daily budget. A budget would be a number nobody could justify; the
 * busiest day is a fact the data already carries. The cost is that the bar is
 * relative — a quiet week still fills it — so the percent is printed beside it.
 */
export interface StatusViewInput {
  language: PanelLanguage;
  /** Injected so the view is deterministic in tests. */
  now: number;
  status: MemoryStatus;
  /** The formatted status payload shown verbatim in the snapshot. */
  statusJson: string;
}

/** The four cards, in the order the terminal panel shows them. */
function kpiCards(
  status: MemoryStatus,
  language: PanelLanguage,
): ReadonlyArray<{
  label: string;
  short: string;
  value: string;
}> {
  return [
    {
      label: glimpseText("status.bank", language),
      short: STATUS_SHORT.cardBank,
      value: status.currentProject?.label ?? "global",
    },
    {
      label: glimpseText("status.records", language),
      short: STATUS_SHORT.cardRecords,
      value: String(status.counts.project ?? status.counts.global ?? "—"),
    },
    {
      label: glimpseText("status.disk", language),
      short: STATUS_SHORT.cardDisk,
      value: status.diskBytes === null ? "—" : humanBytes(status.diskBytes),
    },
    {
      label: glimpseText("status.today", language),
      short: STATUS_SHORT.cardToday,
      value: `+${status.todayStored}`,
    },
  ];
}

/** Byte count in the unit a reader expects, matching the terminal panel. */
function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function card(label: string, value: string, short: string): string {
  return el(
    "div",
    {
      class: "kpi-card",
      id: short,
    },
    textEl(
      "span",
      {
        class: "kpi-label",
      },
      label,
    ) +
      textEl(
        "span",
        {
          class: "kpi-value",
        },
        value,
      ),
  );
}

export function renderStatusView(input: StatusViewInput): string {
  const { language, now, status, statusJson } = input;

  const cards = el(
    "div",
    {
      class: "kpi-grid",
      id: STATUS_SHORT.cards,
    },
    kpiCards(status, language)
      .map((entry) => card(entry.label, entry.value, entry.short))
      .join(""),
  );

  // Only `recentEntries` carries a timestamp, so that is the trend source.
  const buckets = dailyBuckets(
    (status.recentEntries ?? []).map((entry) => entry.timestamp),
    now,
    TREND_DAYS,
  );
  const lit = litSegments(buckets);
  const percent = todayShare(buckets);

  const usageRow = el(
    "div",
    {
      class: "meter-row",
    },
    textEl(
      "span",
      {
        class: "meter-label",
      },
      glimpseText("status.usage", language),
    ) +
      el(
        "div",
        {
          "aria-label": glimpseText("status.usage", language),
          class: "meter-track",
          id: STATUS_SHORT.usageBar,
          role: "img",
        },
        Array.from(
          {
            length: METER_SEGMENTS,
          },
          (_, index) =>
            el(
              "span",
              {
                class: `meter-seg${index < lit ? " is-on" : ""}`,
              },
              "",
            ),
        ).join(""),
      ) +
      textEl(
        "span",
        {
          class: "meter-value",
        },
        `${percent}%`,
      ),
  );

  // Height is data, not styling, so it stays inline; the colour comes from CSS.
  const trendRow = el(
    "div",
    {
      class: "meter-row",
    },
    textEl(
      "span",
      {
        class: "meter-label",
      },
      glimpseText("status.trend", language),
    ) +
      el(
        "div",
        {
          "aria-label": glimpseText("status.trend", language),
          class: "spark",
          id: STATUS_SHORT.sparkline,
          role: "img",
        },
        sparkHeights(buckets)
          .map((height) =>
            el(
              "div",
              {
                class: "spark-bar",
                style: `height: ${height}px`,
              },
              "",
            ),
          )
          .join(""),
      ),
  );

  const meta = textEl(
    "p",
    {
      class: "status-meta",
    },
    recallLine(
      status.retrieval.mode,
      status.search?.active ?? "auto",
      status.retrieval.embeddingAvailable === true,
      language,
    ),
  );

  const snapshotHead = textEl(
    "div",
    {
      class: "snapshot-head",
    },
    glimpseText("status.snapshot", language),
  );

  const snapshot = el(
    "pre",
    {
      "aria-label": glimpseText("status.snapshot", language),
      class: "snapshot",
      id: STATUS_SHORT.snapshot,
      role: "region",
      tabindex: "0",
    },
    esc(statusJson),
  );

  return cards + usageRow + trendRow + meta + snapshotHead + snapshot;
}
