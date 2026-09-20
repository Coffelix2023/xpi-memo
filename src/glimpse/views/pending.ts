import { describeMemoryKindOrNull } from "../../kinds.js";
import type { PanelLanguage } from "../../panel-text.js";
import type { PendingCandidate } from "../../pending-candidate.js";
import { localeFor, relativeAge } from "../format.js";
import { el, esc, textEl } from "../html.js";
import { PENDING_SHORT } from "../short-codes.js";
import { glimpseText } from "../text.js";

/**
 * The pending view: a 240px candidate list beside a 316px detail pane.
 *
 * Every candidate's detail block is rendered up front and the client toggles
 * `hidden` between them. Rendering only the selected one would mean either
 * re-rendering on every arrow key (a round trip to Node per keystroke) or
 * writing text from the in-page script, and the script deliberately owns no
 * copy. The list is short by construction — it is a review queue, not a log.
 */
export interface PendingViewInput {
  candidates: readonly PendingCandidate[];
  language: PanelLanguage;
  /** Injected so the view is deterministic in tests. */
  now: number;
  selectedIndex: number;
}

/** Everything the per-row helpers need; threaded instead of passed one by one. */
interface PendingContext {
  language: PanelLanguage;
  now: number;
}

/** The six detail rows, in the order the terminal panel shows them. */
function detailRows(candidate: PendingCandidate, ctx: PendingContext): string {
  const { language, now } = ctx;
  const rows: ReadonlyArray<
    readonly [
      string,
      string,
    ]
  > = [
    [
      "pending.type",
      describeMemoryKindOrNull(candidate.kind)?.label ?? candidate.kind,
    ],
    [
      "pending.bank",
      candidate.targetBank,
    ],
    [
      "pending.age",
      relativeAge(candidate.createdAt, now, localeFor(language)),
    ],
    [
      "pending.evidence",
      candidate.evidenceSummary,
    ],
    [
      "pending.rationale",
      candidate.rationale,
    ],
    [
      "pending.content",
      candidate.content,
    ],
  ];

  return rows
    .map(([key, value]) =>
      el(
        "div",
        {
          class: "detail-row",
        },
        textEl(
          "span",
          {
            class: "detail-key",
          },
          glimpseText(key, language),
        ) +
          textEl(
            "span",
            {
              class: "detail-val",
            },
            value,
          ),
      ),
    )
    .join("");
}

function candidateRow(
  candidate: PendingCandidate,
  index: number,
  selected: boolean,
  ctx: PendingContext,
): string {
  const { language, now } = ctx;
  const conflict =
    candidate.conflictState === "reported"
      ? textEl(
          "span",
          {
            class: "pill pill-warn",
          },
          `⚠ ${glimpseText("pending.conflict", language)}`,
        )
      : "";

  const inner =
    el(
      "span",
      {
        class: "cand-main",
      },
      textEl(
        "span",
        {
          class: "cand-kind",
        },
        describeMemoryKindOrNull(candidate.kind)?.label ?? candidate.kind,
      ) + conflict,
    ) +
    textEl(
      "span",
      {
        class: "cand-age",
      },
      relativeAge(candidate.createdAt, now, localeFor(language)),
    );

  return el(
    "button",
    {
      "aria-selected": String(selected),
      class: `candidate-item${selected ? " is-selected" : ""}`,
      "data-index": index,
      type: "button",
    },
    inner,
  );
}

function detailPane(
  candidates: readonly PendingCandidate[],
  selectedIndex: number,
  ctx: PendingContext,
): string {
  const { language } = ctx;
  const blocks = candidates
    .map((candidate, index) =>
      el(
        "div",
        {
          class: "detail-block",
          "data-index": index,
          hidden: index !== selectedIndex,
        },
        detailRows(candidate, ctx),
      ),
    )
    .join("");

  const actionBar = el(
    "div",
    {
      class: "action-bar",
      id: PENDING_SHORT.actions,
    },
    textEl(
      "button",
      {
        class: "btn btn-primary",
        "data-decision": "store",
        id: PENDING_SHORT.store,
        type: "button",
      },
      glimpseText("pending.store", language),
    ) +
      textEl(
        "button",
        {
          class: "btn btn-destructive",
          "data-decision": "reject",
          id: PENDING_SHORT.reject,
          type: "button",
        },
        glimpseText("pending.reject", language),
      ) +
      textEl(
        "button",
        {
          class: "btn btn-secondary",
          "data-decision": "later",
          id: PENDING_SHORT.later,
          type: "button",
        },
        glimpseText("pending.later", language),
      ),
  );

  return el(
    "div",
    {
      class: "pane-right",
    },
    el(
      "div",
      {
        class: "detail-body",
        id: PENDING_SHORT.detail,
        role: "region",
      },
      blocks,
    ) + actionBar,
  );
}

export function renderPendingView(input: PendingViewInput): string {
  const { candidates, language, now, selectedIndex } = input;
  const isEmpty = candidates.length === 0;
  const safeIndex = isEmpty
    ? 0
    : Math.max(0, Math.min(selectedIndex, candidates.length - 1));
  const ctx: PendingContext = {
    language,
    now,
  };

  const list = el(
    "div",
    {
      "aria-label": glimpseText("pending.title", language),
      class: "candidate-list",
      "data-selected": safeIndex,
      id: PENDING_SHORT.list,
      role: "listbox",
    },
    candidates
      .map((candidate, index) =>
        candidateRow(candidate, index, index === safeIndex, ctx),
      )
      .join(""),
  );

  const title = textEl(
    "h2",
    {
      class: "pane-title",
    },
    `${glimpseText("pending.title", language)} (${candidates.length})`,
  );

  const split = el(
    "div",
    {
      class: "pane-split",
      hidden: isEmpty,
    },
    el(
      "div",
      {
        class: "pane-left",
      },
      title + list,
    ) + detailPane(candidates, safeIndex, ctx),
  );

  const empty = el(
    "div",
    {
      class: "empty-state",
      hidden: !isEmpty,
      id: PENDING_SHORT.empty,
    },
    esc(glimpseText("pending.empty", language)),
  );

  return split + empty;
}
