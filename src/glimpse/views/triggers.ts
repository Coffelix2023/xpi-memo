import { MEMORY_INTENT_RULES, type MemoryIntentRule } from "../../memory-intent.js";
import { type PanelLanguage, panelText } from "../../panel-text.js";
import { HIGH_VALUE_TRIGGERS } from "../../recall-policy.js";
import { SETTINGS_GROUPS } from "../../settings-groups.js";
import { el, textEl } from "../html.js";
import { TRIGGERS_SHORT } from "../short-codes.js";
import { glimpseText } from "../text.js";
import type { SettingsRowLike } from "./settings.js";

/**
 * The triggers view: every rule that can make the extension write or retrieve a
 * memory, and where each one lives.
 *
 * **Read-only by construction.** The capture rules and the recall phrases live
 * in code, and the admission half mirrors `SETTINGS_GROUPS`. The page answers
 * "what is the system watching for?" without becoming a second place to edit
 * anything: editing stays in Settings, where a change is validated and written,
 * and a second editor here would be a second truth.
 *
 * The rule tables are imported rather than threaded through the model because
 * they are constants that do not depend on configuration — the same reason
 * `chrome.ts` imports `THEME_PRINCIPLES`. Only the admission values are live,
 * and those arrive as the panel's own `rows`.
 */
export interface TriggersViewInput {
  language: PanelLanguage;
  /** The panel's field rows, read for the live admission values. */
  rows: readonly SettingsRowLike[];
}

/** One rule line: what it is called, what trips it, what it results in. */
function row(id: string, label: string, phrases: string, result: string): string {
  return el(
    "div",
    {
      class: "trigger-row",
      "data-rule": id,
    },
    textEl(
      "span",
      {
        class: "trigger-label",
      },
      label,
    ) +
      textEl(
        "span",
        {
          class: "trigger-phrases",
        },
        phrases,
      ) +
      textEl(
        "span",
        {
          class: "trigger-result",
        },
        result,
      ),
  );
}

function section(title: string, id: string, body: string): string {
  return el(
    "section",
    {
      class: "trigger-group",
    },
    textEl(
      "h3",
      {
        class: "trigger-head",
        id,
      },
      title,
    ) + body,
  );
}

/**
 * The captured kind is printed verbatim rather than translated. It is the same
 * identifier the audit trail and the exported Markdown carry, so a reader can
 * match this page against a log; a localized label would cost that.
 */
function captureRow(rule: MemoryIntentRule, language: PanelLanguage): string {
  return row(
    rule.id,
    glimpseText(`triggers.rule.${rule.id}`, language),
    rule.phrases.join(" · "),
    rule.kind ?? "—",
  );
}

/** The admission group's field ids, in the order Settings shows them. */
function admissionFields(): readonly string[] {
  return SETTINGS_GROUPS.find((group) => group.id === "admission")?.fields ?? [];
}

export function renderTriggersView(input: TriggersViewInput): string {
  const { language, rows } = input;
  const current = new Map(
    rows.map((entry) => [
      entry.id,
      entry.currentValue,
    ]),
  );

  const hint = textEl(
    "p",
    {
      class: "trigger-hint",
      id: TRIGGERS_SHORT.hint,
    },
    glimpseText("triggers.hint", language),
  );

  const capture = section(
    glimpseText("triggers.capture", language),
    TRIGGERS_SHORT.capture,
    MEMORY_INTENT_RULES.map((rule) => captureRow(rule, language)).join(""),
  );

  // The live policy first, then the phrases that policy consults — the second
  // section is only reachable at all when the policy is `high-value-auto`.
  const recall = section(
    glimpseText("triggers.recall", language),
    TRIGGERS_SHORT.recall,
    row(
      "mode",
      glimpseText("triggers.mode", language),
      "",
      current.get("recallPolicy") ?? "",
    ) +
      HIGH_VALUE_TRIGGERS.map((trigger) =>
        row(trigger.id, trigger.id, trigger.phrases.join(" · "), ""),
      ).join(""),
  );

  const admission = section(
    glimpseText("triggers.admission", language),
    TRIGGERS_SHORT.admission,
    admissionFields()
      .map((id) =>
        row(id, panelText(`field.${id}`, language), "", current.get(id) ?? ""),
      )
      .join(""),
  );

  return el(
    "div",
    {
      class: "triggers-view",
    },
    hint + capture + recall + admission,
  );
}
