import type { SettingsFieldId } from "../settings-groups.js";

/**
 * Semantic short codes, used verbatim as HTML `id`s.
 *
 * `id` === short code is a contract, not a coincidence: it is what lets a
 * reviewer grep the rendered document for a code the design dictionary names,
 * and what makes "which element is `P3-1-S21`?" answerable without a lookup
 * table. `glimpse/short-codes.test.ts` asserts the mapping is total and unique.
 *
 * Codes are **stable identifiers, not visual-order indices**. When the settings
 * groups grew a sixth group (admission) and seventeen fields, the new codes were
 * appended rather than renumbering the existing ones, so every code already
 * referenced in review notes and in the dictionary keeps pointing at the same
 * element. `SETTINGS_GROUPS` decides display order; this table decides identity.
 */
export const SHELL_SHORT = {
  badge: "P0-1-B1",
  close: "P0-1-B2",
  footer: "P0-1-A4",
  header: "P0-1-A2",
  infoBar: "P0-1-C1",
  language: "P0-1-W2",
  navPending: "P0-1-N1",
  navRecent: "P0-1-N2",
  navSettings: "P0-1-N3",
  navStatus: "P0-1-N4",
  navTriggers: "P0-1-N5",
  principle: "P0-1-W3",
  sidebar: "P0-1-A3",
  theme: "P0-1-W1",
  window: "P0-1-A1",
} as const;

export const PENDING_SHORT = {
  actions: "P1-1-A2",
  detail: "P1-1-A1",
  empty: "P1-1-T1",
  later: "P1-1-B3",
  list: "P1-1-L1",
  // T = the view's non-normal states, like `empty`.
  notice: "P1-1-T2",
  reject: "P1-1-B2",
  store: "P1-1-B1",
} as const;

export const RECENT_SHORT = {
  empty: "P2-1-T1",
  table: "P2-1-X1",
} as const;

export const SETTINGS_SHORT = {
  detail: "P3-1-A1",
  // The two non-normal states, named `T` like the pending empty state.
  error: "P3-1-T1",
  groups: "P3-1-L1",
  loading: "P3-1-T2",
} as const;

export const STATUS_SHORT = {
  cardBank: "P4-1-C1",
  cardDisk: "P4-1-C3",
  cardRecords: "P4-1-C2",
  cards: "P4-1-A1",
  cardToday: "P4-1-C4",
  extraction: "P4-1-U3",
  snapshot: "P4-1-A2",
  sparkline: "P4-1-U2",
  usageBar: "P4-1-U1",
} as const;

/**
 * The triggers view's anchors. Four codes, not one per rule: the rules are
 * data, and a code per row would mean renumbering the table whenever a phrase
 * list is reordered.
 */
export const TRIGGERS_SHORT = {
  admission: "P5-1-L3",
  capture: "P5-1-L1",
  hint: "P5-1-T1",
  recall: "P5-1-L2",
} as const;

/** Group short codes, keyed by the group id in `SETTINGS_GROUPS`. */
export const GROUP_SHORT: Readonly<Record<string, string>> = {
  admission: "P3-1-B6",
  // B8 named the removed decision group (change
  // remove-typesafe-decision-boundary). Never reuse it.
  display: "P3-1-B4",
  mentalModels: "P3-1-B7",
  pipeline: "P3-1-B3",
  privacy: "P3-1-B5",
  retrieval: "P3-1-B1",
  storage: "P3-1-B2",
};

/**
 * Tab-panel short codes, keyed by the same group ids.
 *
 * The group code names the group's tab (its control); the panel it reveals owns
 * the `P` code, so `aria-controls` and `aria-labelledby` can point at each other.
 */
export const SETTINGS_PANEL_SHORT: Readonly<Record<string, string>> = {
  admission: "P3-1-P6",
  // P8 named the removed decision group's panel. Never reuse it.
  display: "P3-1-P4",
  mentalModels: "P3-1-P7",
  pipeline: "P3-1-P3",
  privacy: "P3-1-P5",
  retrieval: "P3-1-P1",
  storage: "P3-1-P2",
};

/** Field short codes, keyed by config field id. */
export const FIELD_SHORT: Readonly<Record<SettingsFieldId, string>> = {
  admissionAllowGlobalPreference: "P3-1-S26",
  admissionAllowGlobalWorkflow: "P3-1-S27",
  admissionAllowProjectConstraint: "P3-1-S28",
  admissionAllowProjectDecision: "P3-1-S29",
  admissionAllowProjectGene: "P3-1-S30",
  admissionAllowProjectGotcha: "P3-1-S31",
  admissionAllowSessionContext: "P3-1-S32",
  admissionEvidenceFloor: "P3-1-S33",
  admissionMaxAgeDays: "P3-1-S34",
  admissionMinConfidence: "P3-1-S35",
  admissionSourceScope: "P3-1-S36",
  archiveRetentionDays: "P3-1-S37",
  autoAdmit: "P3-1-S25",
  autoExport: "P3-1-S8",
  confirmStore: "P3-1-S7",
  dataDir: "P3-1-S11",
  // P3-1-S40..P3-1-S46 are a reserved, permanently empty range: they named
  // the decision-boundary settings removed by change
  // remove-typesafe-decision-boundary. Never reuse them.
  embeddingApiUrl: "P3-1-S24",
  embeddingMode: "P3-1-S22",
  embeddingModel: "P3-1-S23",
  eventPresentation: "P3-1-S16",
  excludeToolResults: "P3-1-S10",
  globalLimit: "P3-1-S5",
  l0Enabled: "P3-1-S13",
  language: "P3-1-S15",
  limit: "P3-1-S4",
  mentalModelDefinitions: "P3-1-S38",
  mentalModelSynthesisEnabled: "P3-1-S39",
  offlineExtractionEnabled: "P3-1-S9",
  offlineExtractionModel: "P3-1-S21",
  passiveFeedback: "P3-1-S17",
  paused: "P3-1-S12",
  privacy: "P3-1-S18",
  profileInjection: "P3-1-S14",
  projectLimit: "P3-1-S6",
  recallPolicy: "P3-1-S1",
  retrievalMode: "P3-1-S2",
  searchBackend: "P3-1-S3",
  sleep: "P3-1-S20",
  sleepMode: "P3-1-S19",
};

/** Every short code the window emits, for the coverage test. */
export function allShortCodes(): string[] {
  return [
    ...Object.values(SHELL_SHORT),
    ...Object.values(PENDING_SHORT),
    ...Object.values(RECENT_SHORT),
    ...Object.values(SETTINGS_SHORT),
    ...Object.values(GROUP_SHORT),
    ...Object.values(SETTINGS_PANEL_SHORT),
    ...Object.values(FIELD_SHORT),
    ...Object.values(STATUS_SHORT),
    ...Object.values(TRIGGERS_SHORT),
  ];
}
