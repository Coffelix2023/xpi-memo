import type { XpiMemoConfig } from "./config.js";

/**
 * The Settings view's group structure.
 *
 * Lives on its own so both surfaces read one layout: the terminal panel and the
 * Glimpse window must offer the same fields in the same groups, and the window
 * needs this table without importing the console (which will import the window
 * to open it).
 */

/** A config key the Settings tab can show, or the one-shot `sleep` action. */
export type SettingsFieldId = keyof XpiMemoConfig | "sleep";

export interface SettingsGroup {
  /** Field ids in this group, in display order. */
  fields: readonly SettingsFieldId[];
  /** Group id, and the `group.<id>` dictionary key for its name. */
  id: string;
}

/**
 * The Settings tab's groups, in display order. Every id in
 * `SETTINGS_FIELD_SPECS` appears in exactly one group; `console.test.ts`
 * pairs the two structures so a new field cannot be added without a group.
 */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    id: "retrieval",
    fields: [
      "recallPolicy",
      "retrievalMode",
      "searchBackend",
      "limit",
      "globalLimit",
      "projectLimit",
    ],
  },
  {
    id: "storage",
    fields: [
      "confirmStore",
      "autoExport",
      "offlineExtractionEnabled",
      "offlineExtractionModel",
      "embeddingMode",
      "embeddingModel",
      "embeddingApiUrl",
      "excludeToolResults",
      "dataDir",
    ],
  },
  {
    id: "pipeline",
    fields: [
      "autoAdmit",
      "paused",
      "l0Enabled",
      "profileInjection",
    ],
  },
  {
    id: "admission",
    fields: [
      "admissionAllowGlobalPreference",
      "admissionAllowGlobalWorkflow",
      "admissionAllowProjectConstraint",
      "admissionAllowProjectDecision",
      "admissionAllowProjectGene",
      "admissionAllowProjectGotcha",
      "admissionAllowSessionContext",
      "admissionEvidenceFloor",
      "admissionMaxAgeDays",
      "admissionMinConfidence",
      "admissionSourceScope",
      "archiveRetentionDays",
    ],
  },
  {
    id: "display",
    fields: [
      "language",
      "eventPresentation",
      "passiveFeedback",
    ],
  },
  {
    id: "privacy",
    fields: [
      "privacy",
      "sleepMode",
      "sleep",
    ],
  },
];
