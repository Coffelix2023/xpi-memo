import { type PanelLanguage, panelText } from "../../panel-text.js";
import type { StatusSummary } from "../../status-summary.js";
import type { ViewId } from "../document.js";
import { el, textEl } from "../html.js";
import { SHELL_SHORT } from "../short-codes.js";
import { glimpseText } from "../text.js";
import { THEME_PRINCIPLES, type ThemePrinciple } from "../tokens.js";

/**
 * The three parts of the window that are always on screen: header, sidebar, and
 * footer.
 *
 * They are rendered from the same `StatusSummary` the terminal panel's info bar
 * uses, so the two surfaces cannot disagree about the counts. The sidebar shows
 * the pending count on its Pending entry, which is the one number a reviewer
 * needs without switching views.
 */

export interface ChromeInput {
  /** The view the window opens on; drives the active nav item. */
  activeView: ViewId;
  language: PanelLanguage;
  /** Which token set the header's picker is on. */
  principle: ThemePrinciple;
  summary: StatusSummary;
  theme: "dark" | "light";
}

/** Nav entries in sidebar order, with the dictionary key for each label. */
const NAV: ReadonlyArray<{
  id: ViewId;
  short: string;
}> = [
  {
    id: "pending",
    short: SHELL_SHORT.navPending,
  },
  {
    id: "recent",
    short: SHELL_SHORT.navRecent,
  },
  {
    id: "settings",
    short: SHELL_SHORT.navSettings,
  },
  {
    id: "status",
    short: SHELL_SHORT.navStatus,
  },
  {
    id: "triggers",
    short: SHELL_SHORT.navTriggers,
  },
];

export function renderHeader(input: ChromeInput): string {
  const { activeView, language, principle, summary, theme } = input;

  const badge = textEl(
    "span",
    {
      class: `badge ${summary.paused ? "badge-dim" : "badge-ok"}`,
      id: SHELL_SHORT.badge,
    },
    `${summary.paused ? "○" : "●"} ${glimpseText(summary.paused ? "app.paused" : "app.running", language)}`,
  );

  const actions = el(
    "div",
    {
      class: "app-header-actions",
    },
    el(
      "select",
      {
        "aria-label": glimpseText("toggle.principle", language),
        class: "theme-select",
        id: SHELL_SHORT.principle,
      },
      THEME_PRINCIPLES.map((value) =>
        textEl(
          "option",
          {
            selected: value === principle,
            value,
          },
          glimpseText(`principle.${value}`, language),
        ),
      ).join(""),
    ) +
      textEl(
        "button",
        {
          "aria-label": glimpseText("toggle.theme", language),
          class: "icon-btn",
          id: SHELL_SHORT.theme,
          type: "button",
        },
        theme === "dark" ? "◐" : "◑",
      ) +
      textEl(
        "button",
        {
          "aria-label": glimpseText("toggle.lang", language),
          class: "icon-btn",
          id: SHELL_SHORT.language,
          type: "button",
        },
        language === "zh" ? "文" : "EN",
      ),
  );

  return `${el(
    "header",
    {
      class: "app-header",
      id: SHELL_SHORT.header,
    },
    el(
      "div",
      {
        class: "app-title",
      },
      textEl(
        "span",
        {
          class: "app-name",
        },
        glimpseText("app.name", language),
      ) + badge,
    ) + actions,
  )}<!-- active view: ${activeView} -->`;
}

export function renderSidebar(input: ChromeInput): string {
  const { activeView, language, summary } = input;

  const items = NAV.map(({ id, short }) => {
    const active = id === activeView;
    const count =
      id === "pending" && summary.pending > 0
        ? textEl(
            "span",
            {
              class: "nav-count",
            },
            summary.pending,
          )
        : "";

    return el(
      "button",
      {
        "aria-current": active ? "page" : undefined,
        class: `nav-item${active ? " is-active" : ""}`,
        "data-tab": id,
        id: short,
        type: "button",
      },
      textEl("span", {}, panelText(`tab.${id}`, language)) + count,
    );
  }).join("");

  return el(
    "nav",
    {
      "aria-label": glimpseText("app.name", language),
      class: "app-sidebar",
      id: SHELL_SHORT.sidebar,
    },
    items,
  );
}

export function renderFooter(input: ChromeInput): string {
  const { language, summary } = input;

  const segments: ReadonlyArray<
    readonly [
      string,
      string,
    ]
  > = [
    [
      "info.bank",
      summary.projectLabel ?? "global",
    ],
    [
      "info.total",
      summary.project === null ? "—" : String(summary.project),
    ],
    [
      "info.today",
      `+${summary.today}`,
    ],
    [
      "info.pending",
      String(summary.pending),
    ],
    [
      "info.disk",
      summary.disk,
    ],
    [
      "info.pause",
      glimpseText(summary.paused ? "info.on" : "info.off", language),
    ],
  ];

  const infoBar = el(
    "div",
    {
      class: "info-bar",
      id: SHELL_SHORT.infoBar,
    },
    segments
      .map(
        ([key, value], index) =>
          (index > 0
            ? textEl(
                "span",
                {
                  class: "info-sep",
                },
                "·",
              )
            : "") +
          textEl(
            "span",
            {
              class: "info-key",
            },
            panelText(key, language),
          ) +
          textEl(
            "span",
            {
              class: "info-val",
            },
            value,
          ),
      )
      .join(""),
  );

  const close = textEl(
    "button",
    {
      class: "btn btn-secondary",
      id: SHELL_SHORT.close,
      type: "button",
    },
    glimpseText("close", language),
  );

  return el(
    "footer",
    {
      class: "app-footer",
      id: SHELL_SHORT.footer,
    },
    infoBar + close,
  );
}
