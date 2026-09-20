import { type PanelLanguage, panelText } from "../../panel-text.js";
import { SETTINGS_GROUPS } from "../../settings-groups.js";
import { el, esc, textEl } from "../html.js";
import { FIELD_SHORT, GROUP_SHORT, SETTINGS_SHORT } from "../short-codes.js";
import { glimpseText } from "../text.js";

/**
 * The settings view: six accordion groups over a pinned detail panel.
 *
 * The group layout comes from `SETTINGS_GROUPS` and the rows from
 * `ConsoleViewModel.rows`, which is the same pair the terminal panel renders.
 * That is what makes "the window must not omit a field the panel exposes"
 * structural rather than a promise: adding a config field widens the row list,
 * and the window picks it up without an edit here.
 *
 * `rows` is flat and in group order, so the i-th row is the i-th field of the
 * flattened groups. `console.test.ts` already pins `SETTINGS_GROUPS` to the
 * field table; `views/settings.test.ts` pins the flat row order to it too.
 *
 * **Detail panel**: shows the focused field's `detail.*` and `choice.*`. With no
 * focus it explains the first field of the first group. The prototype showed a
 * per-group summary line instead; that needed twelve dictionary keys the shared
 * table does not have, and the panel's job (per `tui-console-panel`) is to
 * explain the field — so the group summary was dropped rather than duplicated.
 */
export interface SettingsRowLike {
  currentValue: string;
  /** Set only when an environment variable pins the field. */
  description?: string;
  id: string;
  text?: true;
  values?: readonly string[];
}

export interface SettingsViewInput {
  language: PanelLanguage;
  /** The panel's field rows, in `SETTINGS_GROUPS` order. */
  rows: readonly SettingsRowLike[];
}

/** Whether an environment variable pins this row. */
function isLocked(row: SettingsRowLike): boolean {
  return row.description !== undefined;
}

/** The one-shot consolidation row, which writes no configuration. */
function isAction(row: SettingsRowLike): boolean {
  return row.id === "sleep";
}

function fieldRow(
  row: SettingsRowLike,
  language: PanelLanguage,
  short: string,
): string {
  const classes = [
    "field-row",
    isLocked(row) ? "is-locked" : "",
    isAction(row) ? "is-action" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const note = row.description ?? panelText(`note.${row.id}`, language);

  return el(
    "div",
    {
      class: classes,
      "data-field": row.id,
      id: short,
      tabindex: "0",
    },
    textEl(
      "span",
      {
        class: "f-label",
      },
      panelText(`field.${row.id}`, language),
    ) +
      textEl(
        "span",
        {
          class: "f-value",
        },
        row.currentValue,
      ) +
      textEl(
        "span",
        {
          class: "f-note",
        },
        note,
      ),
  );
}

function groupSection(
  group: {
    fields: readonly string[];
    id: string;
  },
  rowsByField: ReadonlyMap<string, SettingsRowLike>,
  language: PanelLanguage,
  open: boolean,
): string {
  const head = el(
    "button",
    {
      "aria-expanded": String(open),
      class: "group-head",
      "data-group": group.id,
      id: GROUP_SHORT[group.id],
      type: "button",
    },
    textEl(
      "span",
      {
        class: "group-arrow",
      },
      open ? "▾" : "▸",
    ) +
      textEl(
        "span",
        {
          class: "group-name",
        },
        panelText(`group.${group.id}`, language),
      ) +
      textEl(
        "span",
        {
          class: "group-count",
        },
        group.fields.length,
      ),
  );

  const body = el(
    "div",
    {
      class: "group-body",
      hidden: !open,
    },
    group.fields
      .map((field) => {
        const row = rowsByField.get(field);
        const short = FIELD_SHORT[field as keyof typeof FIELD_SHORT];
        // A group naming a field the row list does not carry is a wiring bug,
        // not a rendering concern; skip it rather than emit a broken row.
        return row && short ? fieldRow(row, language, short) : "";
      })
      .join(""),
  );

  return el(
    "div",
    {
      class: "group",
    },
    head + body,
  );
}

/** One explain-the-field block: `detail.*` then `choice.*`. */
function detailBlock(field: string, language: PanelLanguage, hidden: boolean): string {
  return el(
    "div",
    {
      class: "detail-block",
      "data-field": field,
      hidden,
    },
    textEl(
      "p",
      {
        class: "detail-line",
      },
      panelText(`detail.${field}`, language),
    ) +
      textEl(
        "p",
        {
          class: "detail-line",
        },
        panelText(`choice.${field}`, language),
      ),
  );
}

export function renderSettingsView(input: SettingsViewInput): string {
  const { language, rows } = input;
  const rowsByField = new Map(
    rows.map((row) => [
      row.id,
      row,
    ]),
  );
  const allFields = SETTINGS_GROUPS.flatMap((group) => [
    ...group.fields,
  ]);

  // The first group starts open, matching the terminal panel.
  const groups = SETTINGS_GROUPS.map((group, index) =>
    groupSection(group, rowsByField, language, index === 0),
  ).join("");

  const list = el(
    "div",
    {
      "aria-label": panelText("group.retrieval", language),
      class: "settings-groups",
      id: SETTINGS_SHORT.groups,
      role: "listbox",
    },
    groups,
  );

  const detail = el(
    "div",
    {
      "aria-label": panelText("detail.sleep", language),
      class: "settings-detail",
      id: SETTINGS_SHORT.detail,
      role: "region",
    },
    // The unfocused default explains the first field; every other block is
    // revealed by the client when its row is focused.
    detailBlock(allFields[0] ?? "", language, false) +
      allFields.map((field) => detailBlock(field, language, true)).join(""),
  );

  const error = el(
    "div",
    {
      class: "error-banner",
      hidden: true,
      id: SETTINGS_SHORT.error,
    },
    esc(glimpseText("error.save", language)),
  );

  const loading = el(
    "div",
    {
      class: "skeleton-block",
      hidden: true,
      id: SETTINGS_SHORT.loading,
    },
    [
      "44px",
      "36px",
      "36px",
      "36px",
    ]
      .map((height) =>
        el(
          "div",
          {
            class: "skeleton",
            style: `height: ${height}`,
          },
          "",
        ),
      )
      .join(""),
  );

  return (
    error +
    loading +
    el(
      "div",
      {
        class: "settings-scroll",
      },
      list,
    ) +
    detail
  );
}
