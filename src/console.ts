import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  type KeybindingsManager,
  type SelectItem,
  SelectList,
  type SettingItem,
  Text,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { l0Status } from "./cli/l0.js";
import type { XpiMemoConfig } from "./config.js";
import { type GlimpseModule, resolveGlimpseModule } from "./glimpse/module.js";
import { uiPrefsPath } from "./glimpse/prefs.js";
import { openGlimpsePanel } from "./glimpse/window.js";
import { describeMemoryKindOrNull } from "./kinds.js";
import { type PanelLanguage, panelText } from "./panel-text.js";
import type { PendingCandidate } from "./pending-candidate.js";
import {
  SETTINGS_GROUPS,
  type SettingsFieldId,
  type SettingsGroup,
} from "./settings-groups.js";
import { formatStatusJson, type MemoryStatus } from "./status.js";

export type ConsoleSettings = Partial<
  Pick<
    XpiMemoConfig,
    | "confirmStore"
    | "embeddingApiUrl"
    | "embeddingMode"
    | "embeddingModel"
    | "globalLimit"
    | "language"
    | "limit"
    | "offlineExtractionModel"
    | "paused"
    | "projectLimit"
    | "recallPolicy"
    | "retrievalMode"
    | "searchBackend"
  >
>;
/** What a reviewer decided about a pending candidate. */
export type CandidateDecision = "store" | "reject" | "later";
export interface ConsoleActions {
  confirm(title: string, message: string): Promise<boolean>;
  reviewCandidate(candidate: PendingCandidate): Promise<void>;
  /**
   * Apply a decision the Glimpse window already collected.
   *
   * The terminal panel has one Review action that opens a chooser; the window
   * shows store / reject / later as three buttons. Falling back to
   * `reviewCandidate` keeps the window working against an older action set, at
   * the cost of asking twice.
   */
  reviewDecision?(
    candidate: PendingCandidate,
    decision: CandidateDecision,
  ): Promise<void>;
  save(values: ConsoleSettings): void;
  sleep(): Promise<void>;
}

/**
 * Panel chrome is 8 rows: border top carrying the title, tab bar, two
 * field-detail rows, two info-bar rows, the key-hint footer, border bottom.
 * The body is whatever the height budget left, floored at 3 rows.
 */
export const PANEL_CHROME_ROWS = 8;
export const MIN_BODY_ROWS = 3;
/**
 * Documented height budget (`TUI-DESIGN.md`): a 24-row panel, never more than
 * 70% of the terminal, so a tall viewport no longer gets a full-height panel.
 */
export const PANEL_HEIGHT = 24;
/** Documented overlay width in columns; the overlay clamps it to the viewport. */
export const PANEL_WIDTH = 94;
export const PANEL_MAX_HEIGHT_SHARE = 0.7;
/** `TUI-DESIGN.md` Do's: the overlay must clear the input area by at least this. */
export const OVERLAY_MARGIN_BOTTOM = 4;

export function bodyRows(terminalRows: number): number {
  return Math.max(panelHeight(terminalRows) - PANEL_CHROME_ROWS, MIN_BODY_ROWS);
}

/** Panel height before the viewport clamp; always chrome plus the body floor. */
function panelHeight(terminalRows: number): number {
  return Math.max(
    Math.min(PANEL_HEIGHT, Math.floor(terminalRows * PANEL_MAX_HEIGHT_SHARE)),
    PANEL_CHROME_ROWS + MIN_BODY_ROWS,
  );
}

/**
 * Fixed panel geometry, computed once when the panel opens. A viewport of
 * `terminalRows` can never show more than `terminalRows`, so the height is the
 * smaller of the height budget and the viewport, with the body re-derived from
 * that height so the parts always add up.
 */
export function panelLayout(terminalRows: number): {
  body: number;
  height: number;
} {
  const height = Math.min(panelHeight(terminalRows), terminalRows);
  return {
    body: Math.max(height - PANEL_CHROME_ROWS, 0),
    height,
  };
}
/** Tab order is fixed: 0 Pending, 1 Recent, 2 Settings, 3 Status. Overview is the info bar. */
const TAB_TITLE_KEYS = [
  "tab.pending",
  "tab.recent",
  "tab.settings",
  "tab.status",
] as const;
export const TAB_COUNT = TAB_TITLE_KEYS.length;

/** Active tab name, in the configured language. */
export function tabTitle(model: ConsoleViewModel, tab: number): string {
  return panelText(TAB_TITLE_KEYS[tab] ?? "", model.language);
}

/** Tab titles, so a tab switch may keep the list cursor where it was. */
export const PENDING_TAB = 0;
export const RECENT_TAB = 1;
export const SETTINGS_TAB = 2;
export const STATUS_TAB = 3;

/** Tab step that stops at the first and last tab instead of wrapping around. */
export function nextTab(current: number, step: number): number {
  return Math.max(0, Math.min(current + step, TAB_COUNT - 1));
}

/** Index inside a list, wrapping at both ends. Empty lists stay at 0. */
export function moveRow(index: number, step: number, count: number): number {
  if (count <= 0) return 0;
  return (((index + step) % count) + count) % count;
}

/**
 * `SelectList` / `SettingsList` add a scroll-indicator row when the list is
 * longer than `maxVisible`, which would grow the fixed body. Reserving that row
 * only when the list really scrolls keeps the child inside the body region.
 */
export function listMaxVisible(count: number, rows: number): number {
  return count > rows ? Math.max(rows - 1, 1) : rows;
}

/** Hard guard on the body region: never more, never fewer than `rows`. */
export function fit(rows: string[], count: number): string[] {
  const sliced = rows.slice(0, count);
  while (sliced.length < count) sliced.push("");
  return sliced;
}

export interface ConsoleViewModel {
  env: NodeJS.ProcessEnv;
  /** Language the whole panel renders in; comes from the effective config. */
  language: PanelLanguage;
  pending: PendingCandidate[];
  rows: PanelSettingItem[];
  status: MemoryStatus;
  /** Indented JSON shown on the Status tab (rendered status + L0 summary). */
  statusJson: string;
}

export function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = [
    "KB",
    "MB",
    "GB",
    "TB",
  ];
  let value = bytes;
  let index = -1;
  do {
    value /= 1024;
    index += 1;
  } while (value >= 1024 && index < units.length - 1);
  return `${value.toFixed(1)} ${units[index]}`;
}

/**
 * Panel copy lives in `panel-text.ts` so both surfaces read one dictionary.
 * Re-exported here because the console is where panel copy has always been
 * imported from.
 */
export { panelText };

/**
 * Persistent two-row Overview info bar: fixed tier ownership, then bank,
 * totals, today, pending, and visible-bank disk usage. It reads the view-model
 * only, so it never runs recall.
 */
export function infoBarLines(model: ConsoleViewModel, width: number): string[] {
  const { status } = model;
  const text = (key: string) => panelText(key, model.language);
  const total = (status.counts.global ?? 0) + (status.counts.project ?? 0);
  const inner = Math.max(width - 4, 1);
  const segments = [
    `${text("info.bank")}: ${status.currentProject?.bank ?? "global-only"}`,
    `${text("info.total")}: ${total}`,
    `${text("info.today")}: ${status.todayStored}`,
    `${text("info.pending")}: ${status.pendingCandidates}`,
    `${text("info.disk")}: ${status.diskBytes === null ? "unknown" : humanBytes(status.diskBytes)}`,
    `${text("info.pause")}: ${status.paused ? "on" : "off"}`,
  ];
  return [
    truncateToWidth(text("info.tier"), inner, "…"),
    truncateToWidth(segments.join(" · "), inner, "…"),
  ];
}

/** Product title, rendered in the top border in both languages at once. */
export const PANEL_TITLE = "xpi-memo · pi 的 DNA 记忆体 / pi's DNA memory";

/**
 * Top border with `PANEL_TITLE` embedded: the documented TUI pattern, so the
 * title costs no body row. The fill is measured with `visibleWidth`, which
 * counts CJK glyphs as two columns, so the right corner stays in the same
 * column on every row.
 */
export function titleBorder(width: number, theme: Pick<Theme, "fg">): string {
  const inner = Math.max(width - 2, 1);
  const label = truncateToWidth(`─ ${PANEL_TITLE} `, inner, "…");
  const fill = "─".repeat(Math.max(inner - visibleWidth(label), 0));
  return theme.fg("borderAccent", `╭${label}${fill}╮`);
}
/** Tab bar: every tab label, so ←/→ has visible destinations. */
export function tabBarLines(
  model: ConsoleViewModel,
  tab: number,
  width: number,
  theme: Pick<Theme, "fg">,
): string[] {
  const inner = Math.max(width - 4, 1);
  const labels = TAB_TITLE_KEYS.map((_, index) => {
    const label =
      index === PENDING_TAB
        ? `${tabTitle(model, index)} ${model.pending.length}`
        : tabTitle(model, index);
    return index === tab ? theme.fg("accent", label) : theme.fg("muted", label);
  });
  return [
    truncateToWidth(labels.join(" · "), inner, "…"),
  ];
}

/** Pending rows for `SelectList`: kind and bank as the label, summary as description. */
export function pendingItems(pending: PendingCandidate[]): SelectItem[] {
  return pending.map((candidate) => ({
    description: candidate.content.slice(0, 80),
    label: `${describeMemoryKindOrNull(candidate.kind)?.label ?? candidate.kind} · ${candidate.targetBank}`,
    value: candidate.id,
  }));
}

/** Audit metadata only: action, kind, bank, status, timestamp. */
export function recentLines(status: MemoryStatus): string[] {
  return (status.recentEntries ?? []).map(
    (entry) =>
      `${entry.action} · ${describeMemoryKindOrNull(entry.kind)?.label ?? entry.kind ?? "-"} · ${entry.bank ?? "-"} · ${entry.status ?? "-"} · ${entry.timestamp}`,
  );
}

/** Split the Status-tab JSON into display lines. */
export function statusLines(json: string): string[] {
  return json.split("\n");
}
/**
 * The Settings view's group structure lives in `settings-groups.ts` so the
 * Glimpse window can lay out the same groups without importing the console.
 * Re-exported here because the console is where the panel layout has always
 * been imported from.
 */
export { SETTINGS_GROUPS, type SettingsFieldId, type SettingsGroup };

interface SettingsFieldSpec {
  /**
   * Environment variable that pins this field, or `null` when nothing
   * governs it. Every name listed here is already read by `loadConfig` in
   * `config.ts`; this table only surfaces them in the panel.
   */
  environment: string | null;
  /**
   * A free-text field (a model id or an endpoint). The panel edits it inline
   * instead of cycling `values`, so such a field keeps `values` empty.
   */
  text?: true;
  /** Empty for fields the panel never writes, such as the data directory. */
  values: readonly string[];
}

/**
 * Settings metadata keyed by field id. `Record` over the id union makes the
 * compiler refuse a partial table, so widening `XpiMemoConfig` cannot
 * silently leave a field out of the panel.
 */
const SETTINGS_FIELD_SPECS: Record<SettingsFieldId, SettingsFieldSpec> = {
  admissionAllowGlobalPreference: {
    environment: "XPI_MEMO_ADMISSION_ALLOW_GLOBAL_PREFERENCE",
    values: [
      "off",
      "on",
    ],
  },
  admissionAllowGlobalWorkflow: {
    environment: "XPI_MEMO_ADMISSION_ALLOW_GLOBAL_WORKFLOW",
    values: [
      "off",
      "on",
    ],
  },
  admissionAllowProjectConstraint: {
    environment: "XPI_MEMO_ADMISSION_ALLOW_PROJECT_CONSTRAINT",
    values: [
      "off",
      "on",
    ],
  },
  admissionAllowProjectDecision: {
    environment: "XPI_MEMO_ADMISSION_ALLOW_PROJECT_DECISION",
    values: [
      "off",
      "on",
    ],
  },
  admissionAllowProjectGene: {
    environment: "XPI_MEMO_ADMISSION_ALLOW_PROJECT_GENE",
    values: [
      "off",
      "on",
    ],
  },
  admissionAllowProjectGotcha: {
    environment: "XPI_MEMO_ADMISSION_ALLOW_PROJECT_GOTCHA",
    values: [
      "off",
      "on",
    ],
  },
  admissionAllowSessionContext: {
    environment: "XPI_MEMO_ADMISSION_ALLOW_SESSION_CONTEXT",
    values: [
      "off",
      "on",
    ],
  },
  admissionEvidenceFloor: {
    environment: "XPI_MEMO_ADMISSION_EVIDENCE_FLOOR",
    values: [
      "repository-fact",
      "session-conclusion",
    ],
  },
  admissionMaxAgeDays: {
    environment: "XPI_MEMO_ADMISSION_MAX_AGE_DAYS",
    values: [
      "7",
      "30",
      "90",
      "365",
    ],
  },
  admissionMinConfidence: {
    environment: "XPI_MEMO_ADMISSION_MIN_CONFIDENCE",
    values: [
      "0.5",
      "0.7",
      "0.9",
    ],
  },
  admissionSourceScope: {
    environment: "XPI_MEMO_ADMISSION_SOURCE_SCOPE",
    values: [
      "all",
      "current-project",
    ],
  },
  archiveRetentionDays: {
    environment: "XPI_MEMO_ARCHIVE_RETENTION_DAYS",
    values: [
      "7",
      "30",
      "90",
      "180",
    ],
  },
  autoAdmit: {
    environment: "XPI_MEMO_AUTO_ADMIT",
    values: [
      "off",
      "on",
    ],
  },
  autoExport: {
    environment: "XPI_MEMO_AUTO_EXPORT",
    values: [
      "off",
      "on",
    ],
  },
  confirmStore: {
    environment: "XPI_MEMO_CONFIRM_STORE",
    values: [
      "off",
      "on",
    ],
  },
  dataDir: {
    environment: "XPI_MEMO_DATA_DIR",
    values: [],
  },
  embeddingApiUrl: {
    environment: "XPI_MEMO_EMBEDDING_API_URL",
    text: true,
    values: [],
  },
  embeddingMode: {
    environment: "XPI_MEMO_EMBEDDING_MODE",
    values: [
      "off",
      "local",
      "api",
    ],
  },
  embeddingModel: {
    environment: "XPI_MEMO_EMBEDDING_MODEL",
    text: true,
    values: [],
  },
  eventPresentation: {
    environment: "XPI_MEMO_EVENT_PRESENTATION",
    values: [
      "off",
      "on",
    ],
  },
  excludeToolResults: {
    environment: "XPI_MEMO_EXCLUDE_TOOL_RESULTS",
    values: [
      "off",
      "on",
    ],
  },
  globalLimit: {
    environment: "XPI_MEMO_GLOBAL_LIMIT",
    values: [
      "1",
      "5",
      "10",
      "20",
    ],
  },
  l0Enabled: {
    environment: "XPI_MEMO_L0_ENABLED",
    values: [
      "off",
      "on",
    ],
  },
  language: {
    environment: "XPI_MEMO_LANGUAGE",
    values: [
      "en",
      "zh",
    ],
  },
  limit: {
    environment: "XPI_MEMO_LIMIT",
    values: [
      "1",
      "5",
      "10",
      "20",
    ],
  },
  offlineExtractionEnabled: {
    environment: "XPI_MEMO_OFFLINE_EXTRACTION_ENABLED",
    values: [
      "off",
      "on",
    ],
  },
  offlineExtractionModel: {
    environment: "XPI_MEMO_OFFLINE_EXTRACTION_MODEL",
    text: true,
    values: [],
  },
  passiveFeedback: {
    environment: "XPI_MEMO_PASSIVE_FEEDBACK",
    values: [
      "off",
      "on",
    ],
  },
  paused: {
    environment: "XPI_MEMO_PAUSED",
    values: [
      "off",
      "on",
    ],
  },
  privacy: {
    environment: "XPI_MEMO_PRIVACY",
    values: [
      "off",
      "on",
    ],
  },
  profileInjection: {
    environment: "XPI_MEMO_PROFILE_INJECTION",
    values: [
      "off",
      "on",
    ],
  },
  projectLimit: {
    environment: "XPI_MEMO_PROJECT_LIMIT",
    values: [
      "1",
      "5",
      "10",
      "20",
    ],
  },
  recallPolicy: {
    environment: "XPI_MEMO_RECALL_POLICY",
    values: [
      "active",
      "assist",
      "high-value-auto",
    ],
  },
  retrievalMode: {
    environment: "XPI_MEMO_RETRIEVAL_MODE",
    values: [
      "fts5",
      "hybrid",
    ],
  },
  searchBackend: {
    environment: "XPI_MEMO_SEARCH_BACKEND",
    values: [
      "auto",
      "mnemosyne",
      "ripgrep",
      "qmd",
    ],
  },
  sleep: {
    environment: null,
    values: [
      "off",
      "run",
    ],
  },
  sleepMode: {
    environment: "XPI_MEMO_SLEEP_MODE",
    values: [
      "disabled",
      "dedicated",
      "session-model",
      "mechanical",
    ],
  },
};

/**
 * A panel row. `text` marks the free-text fields: the panel edits them inline
 * instead of cycling `values`, and it is absent on a pinned or never-written
 * field, which keeps those rows inert.
 */
export interface PanelSettingItem extends SettingItem {
  text?: true;
}

/**
 * Every settings row, in group order. A field pinned by an environment
 * variable or never written by the panel omits `values`, which makes Enter a
 * no-op on it, so the panel cannot persist a value it does not own.
 */
export function settingsItems(
  config: XpiMemoConfig,
  env: NodeJS.ProcessEnv,
): PanelSettingItem[] {
  return SETTINGS_GROUPS.flatMap((group) =>
    group.fields.map((id) => settingsItem(id, config, env)),
  );
}

function settingsItem(
  id: SettingsFieldId,
  config: XpiMemoConfig,
  env: NodeJS.ProcessEnv,
): PanelSettingItem {
  const spec = SETTINGS_FIELD_SPECS[id];
  const environment = spec.environment;
  const locked = environment !== null && Boolean(env[environment]);
  const writable = !locked && spec.values.length > 0;
  return {
    currentValue: settingsValue(id, config),
    // A pinned field names its variable in the note slot; the label stays the
    // dictionary key so the row renders in the configured language.
    ...(environment !== null && locked
      ? {
          description: `⊘ ${environment}`,
        }
      : {}),
    id,
    label: id,
    // Free text is edited inline, so a text field carries the marker instead
    // of `values`; a locked one carries neither and stays inert.
    ...(spec.text === true && !locked
      ? {
          text: true as const,
        }
      : {}),
    ...(writable
      ? {
          values: [
            ...spec.values,
          ],
        }
      : {}),
  };
}

/** `on`/`off` for booleans, the bare string for everything else. */
function settingsValue(id: SettingsFieldId, config: XpiMemoConfig): string {
  if (id === "sleep") return "off";
  const value = config[id];
  if (typeof value !== "boolean") return String(value);
  return value ? "on" : "off";
}

/**
 * Panel value → persisted config value, typed by the field's own configured
 * value. A boolean switch must never reach `saveUserConfig` as `Number("on")`:
 * `NaN` serializes to `null`, which the next load rejects, so the setting looks
 * saved and silently reverts. Typing off the config also keeps a field added
 * later correct without touching this code.
 */
export function settingsSaveValue(
  id: string,
  value: string,
  config: XpiMemoConfig,
): ConsoleSettings {
  // `SettingsFieldId` is a subset of the config's keys, so this lookup is sound
  // for every id the panel can pass; the key is widened only for indexing.
  const current = config[id as keyof XpiMemoConfig];
  if (typeof current === "boolean")
    return {
      [id]: value === "on",
    } as ConsoleSettings;
  if (typeof current === "number")
    return {
      [id]: Number(value),
    } as ConsoleSettings;
  return {
    [id]: value,
  } as ConsoleSettings;
}
/** One row the Settings tab can show: a group header or a field. */
export type SettingsRow =
  | {
      /** Number of field rows this header opens. */
      count: number;
      group: SettingsGroup;
      kind: "group";
      /** Whether this group's field rows are currently visible. */
      open: boolean;
    }
  | {
      groupId: string;
      item: PanelSettingItem;
      kind: "field";
    };

/**
 * The Settings tab's visible rows, in display order: every group header, then
 * the fields of every group that is not collapsed. The cursor indexes into
 * this sequence, so a group header is a real landing spot for up/down.
 */
export function settingsRows(
  items: readonly PanelSettingItem[],
  collapsed: ReadonlySet<string>,
): SettingsRow[] {
  const byId = new Map(
    items.map((item) => [
      item.id,
      item,
    ]),
  );
  const rows: SettingsRow[] = [];
  for (const group of SETTINGS_GROUPS) {
    const fields = group.fields
      .map((id) => byId.get(id))
      .filter((item): item is PanelSettingItem => item !== undefined);
    const open = !collapsed.has(group.id);
    rows.push({
      count: fields.length,
      group,
      kind: "group",
      open,
    });
    if (!open) continue;
    for (const item of fields) {
      rows.push({
        groupId: group.id,
        item,
        kind: "field",
      });
    }
  }
  return rows;
}

/**
 * Next window start for a cursor-driven list. Unlike `windowSlice`, which
 * centres one fixed row, this keeps the cursor inside the window and only
 * moves once the cursor would leave it, so the sequence decides where the
 * window sits rather than the other way round.
 */
export function cursorWindowStart(
  previous: number,
  cursor: number,
  total: number,
  rows: number,
): number {
  let start = previous;
  if (cursor < start) start = cursor;
  else if (cursor >= start + rows) start = cursor - rows + 1;
  return Math.max(0, Math.min(start, Math.max(total - rows, 0)));
}

/** Index of a group's header row. Falls back to the first row. */
export function groupHeaderIndex(
  rows: readonly SettingsRow[],
  groupId: string,
): number {
  const index = rows.findIndex(
    (row) => row.kind === "group" && row.group.id === groupId,
  );
  return index < 0 ? 0 : index;
}

/**
 * Clamp a cursor onto a row that exists. Collapsing a group can leave the
 * previous index past the end of the shortened sequence.
 */
export function clampCursor(cursor: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(cursor, total - 1));
}

/** Label column width at the documented 94-column basis. */
export const LABEL_COLUMN_WIDTH = 22;
/** Below this the note column is dropped entirely rather than showing `…`. */
export const MIN_NOTE_COLUMN_WIDTH = 8;
/** Fixed separator between the label and the note column. */
export const LABEL_NOTE_GAP = 2;
/** Fixed separator between the note and the value column. */
export const NOTE_VALUE_GAP = 1;

/** One Settings row as panel text, without the surrounding borders. */
export function settingsRowText(
  row: SettingsRow,
  selected: boolean,
  width: number,
  theme: Pick<Theme, "bold" | "fg">,
  language: PanelLanguage,
): string {
  if (row.kind === "group") {
    const text = `${row.open ? "▾" : "▸"} ${panelText(`group.${row.group.id}`, language)} (${row.count})`;
    return selected ? theme.fg("accent", text) : theme.bold(text);
  }
  // A pinned field carries its variable name as the description.
  const note = row.item.description ?? panelText(`note.${row.item.id}`, language);
  const value = row.item.currentValue;
  const budget = width;
  const valueWidth = visibleWidth(value);
  // Three columns at the documented 94-column basis: label 22, a 2-space
  // separator, the note flexible, a 1-space separator, then the right-aligned
  // value. Degradation order is note first, then the label; value always kept.
  let labelWidth = Math.min(LABEL_COLUMN_WIDTH, Math.max(budget - valueWidth - 2, 1));
  let noteWidth = budget - labelWidth - LABEL_NOTE_GAP - valueWidth - NOTE_VALUE_GAP;
  if (noteWidth < MIN_NOTE_COLUMN_WIDTH) {
    noteWidth = 0;
    labelWidth = Math.max(budget - valueWidth - NOTE_VALUE_GAP, 1);
  }
  const label = truncateToWidth(
    `  ${panelText(`field.${row.item.id}`, language)}`,
    labelWidth,
    "…",
  );
  const noteText = noteWidth === 0 ? "" : truncateToWidth(note, noteWidth, "…");
  // The separator is fixed, so only the trailing gap absorbs the slack left by
  // a truncated label or note.
  const noteSection = noteText === "" ? "" : `${padding(LABEL_NOTE_GAP)}${noteText}`;
  const gap = Math.max(
    budget - visibleWidth(label) - visibleWidth(noteSection) - valueWidth,
    NOTE_VALUE_GAP,
  );
  return selected
    ? theme.fg("accent", `${label}${noteSection}${padding(gap)}${value}`)
    : `${label}${theme.fg("dim", noteSection)}${padding(gap)}${theme.fg("muted", value)}`;
}

function padding(count: number): string {
  return " ".repeat(Math.max(count, 0));
}

/** Windowed audit lines for the Recent tab, always exactly `rows` long. */
export function recentWindow(
  status: MemoryStatus,
  row: number,
  rows: number,
): string[] {
  const lines = recentLines(status);
  return windowSlice(
    lines.length
      ? lines
      : [
          "No recent activity",
        ],
    row,
    rows,
  );
}

/** Windowed Status-tab JSON lines, always exactly `rows` long. */
export function statusWindow(json: string, row: number, rows: number): string[] {
  return windowSlice(statusLines(json), row, rows);
}
function windowSlice(lines: string[], row: number, rows: number): string[] {
  const count = lines.length;
  const safe = count === 0 ? 0 : Math.max(0, Math.min(row, count - 1));
  const start =
    count === 0
      ? 0
      : Math.max(
          0,
          Math.min(safe - Math.floor((rows - 1) / 2), Math.max(count - rows, 0)),
        );
  return fit(lines.slice(start, start + rows), rows);
}

export interface ConsoleComponentOptions {
  actions: ConsoleActions;
  config: XpiMemoConfig;
  done(): void;
  env: NodeJS.ProcessEnv;
  keybindings: Pick<KeybindingsManager, "matches">;
  pending: PendingCandidate[];
  status: MemoryStatus;
  statusJson: string;
  terminalRows: number;
  theme: Pick<Theme, "bold" | "fg">;
  tui: {
    requestRender(): void;
    terminal: {
      rows: number;
    };
  };
}

export function createConsoleComponent(options: ConsoleComponentOptions) {
  const { actions, done, keybindings, theme, tui } = options;
  const model: ConsoleViewModel = {
    env: options.env,
    language: options.config.language,
    pending: options.pending,
    rows: settingsItems(options.config, options.env),
    status: options.status,
    statusJson: options.statusJson,
  };
  // Height is fixed at open time; the render guard only ever shrinks it. The
  // open-time source is the real terminal, not the caller's snapshot, so a
  // component built on a stale snapshot still honours the 70% budget.
  let { body, height } = panelLayout(tui.terminal.rows);
  let tab = PENDING_TAB;
  let recentRow = 0;

  const pendingList = new SelectList(
    pendingItems(options.pending),
    listMaxVisible(model.pending.length, body),
    {
      description: (text: string) => theme.fg("muted", text),
      noMatch: (text: string) => theme.fg("warning", text),
      scrollInfo: (text: string) => theme.fg("dim", text),
      selectedPrefix: (text: string) => theme.fg("accent", text),
      selectedText: (text: string) => theme.fg("accent", text),
    },
  );
  pendingList.onSelect = (item) => {
    const candidate = model.pending.find(({ id }) => id === item.value);
    if (candidate) void actions.reviewCandidate(candidate).then(done);
  };

  // Settings state: which groups are folded, where the cursor sits, and the
  // window start that keeps the cursor visible. The cursor indexes into
  // `settingsRows(...)`, so a group header is a normal landing spot.
  const collapsed = new Set(SETTINGS_GROUPS.slice(1).map((group) => group.id));
  let cursor = 0;
  let settingsStart = 0;
  /** Set by the save action, cleared by the next keystroke that navigates. */
  let savedNotice = false;
  /** The free-text row being edited inline, with its buffer. */
  let editing:
    | {
        id: string;
        item: PanelSettingItem;
        text: string;
      }
    | undefined;
  const recentText = new Text("", 0, 0);

  return {
    getBodyRows: () => body,
    getHeight: () => height,
    getRecentRow: () => recentRow,
    getSettingsCursor: () => cursor,
    getTab: () => tab,
    handleInput(data: string): void {
      // Any keystroke other than the one that saved clears the save notice.
      savedNotice = false;
      // While a text field is open, every key belongs to its buffer — Escape
      // cancels the edit instead of closing the panel.
      if (editing !== undefined) {
        handleTextEditInput(data);
        tui.requestRender();
        return;
      }
      // The panel owns Escape and ←/→; the lists never see them.
      if (keybindings.matches(data, "tui.select.cancel") || data === "\u001b") {
        done();
        return;
      }
      if (keybindings.matches(data, "tui.editor.cursorLeft")) {
        tab = nextTab(tab, -1);
        tui.requestRender();
        return;
      }
      if (keybindings.matches(data, "tui.editor.cursorRight")) {
        tab = nextTab(tab, 1);
        tui.requestRender();
        return;
      }
      // Tab walks Settings fields and is inert on the other two tabs.
      // Tab walks Settings fields; Shift+Tab walks them backwards. The
      // keybinding only covers forward, so the raw CSI Z sequence is the
      // fallback, the same way Escape falls back to "\u001b" above.
      if (keybindings.matches(data, "tui.input.tab") || data === "\u001b[Z") {
        if (tab === SETTINGS_TAB) settingsMoveField(data === "\u001b[Z" ? -1 : 1);
        tui.requestRender();
        return;
      }
      if (tab === RECENT_TAB || tab === STATUS_TAB) {
        let step = 0;
        if (keybindings.matches(data, "tui.select.up")) step = -1;
        else if (keybindings.matches(data, "tui.select.down")) step = 1;
        const lineCount =
          tab === RECENT_TAB
            ? Math.max(recentLines(model.status).length, 1)
            : Math.max(statusLines(model.statusJson).length, 1);
        recentRow = moveRow(recentRow, step, lineCount);
        tui.requestRender();
        return;
      }
      // ↑/↓/Enter go to the active list; anything else (number keys included) is inert.
      if (tab === PENDING_TAB) pendingList.handleInput(data);
      if (tab === SETTINGS_TAB) settingsHandleInput(data);
      tui.requestRender();
    },
    invalidate(): void {
      pendingList.invalidate();
      recentText.invalidate();
    },
    render(width: number): string[] {
      const guard = panelLayout(tui.terminal.rows);
      body = Math.min(body, guard.body);
      height = Math.min(height, guard.height);
      const inner = Math.max(width - 4, 1);
      const lines: string[] = [
        titleBorder(width, theme),
        `│ ${padRow(tabBarLines(model, tab, width, theme)[0] ?? "", inner)} │`,
      ];
      for (const row of fit(bodyRowsFor(inner), body))
        lines.push(`│ ${padRow(row, inner)} │`);
      for (const row of detailLines())
        lines.push(`│ ${padRow(theme.fg("muted", row), inner)} │`);
      const info = infoBarLines(model, width);
      lines.push(`│ ${padRow(theme.fg("dim", info[0] ?? ""), inner)} │`);
      lines.push(`│ ${padRow(theme.fg("muted", info[1] ?? ""), inner)} │`);
      // Key hints sit on the last line before the border, in the same dim
      // style as the footer status line.
      lines.push(
        `│ ${padRow(theme.fg("dim", panelText("chrome.hint", model.language)), inner)} │`,
      );
      lines.push(theme.fg("borderAccent", `╰${"─".repeat(Math.max(width - 2, 1))}╯`));
      // Cap the rendered height at the budget. The body list, info bar and
      // border always add up to more than `height` on tall terminals, so the
      // tail is trimmed rather than the panel stretching to the viewport.
      return lines.slice(0, height);
    },
  };

  /** Visible Settings rows for the current fold state and cursor position. */
  function settingsLines(width: number): string[] {
    const rows = settingsRows(model.rows, collapsed);
    cursor = clampCursor(cursor, rows.length);
    settingsStart = cursorWindowStart(settingsStart, cursor, rows.length, body);
    return rows
      .slice(settingsStart, settingsStart + body)
      .map((row, index) =>
        settingsRowText(
          row,
          settingsStart + index === cursor,
          width,
          theme,
          model.language,
        ),
      );
  }

  function settingsMove(step: number): void {
    cursor = moveRow(cursor, step, settingsRows(model.rows, collapsed).length);
  }

  function settingsMoveField(step: number): void {
    const rows = settingsRows(model.rows, collapsed);
    let index = cursor;
    // Skip group headers: Tab only ever lands on a field row.
    for (let i = 0; i < rows.length; i += 1) {
      index = moveRow(index, step, rows.length);
      if (rows[index]?.kind === "field") break;
    }
    cursor = index;
  }

  /**
   * Space on a group header folds it, on a free-text field opens the inline
   * editor, and on a cycling field advances the value.
   */
  function settingsActivate(): void {
    const rows = settingsRows(model.rows, collapsed);
    const row = rows[cursor];
    if (row === undefined) return;
    if (row.kind === "group") {
      settingsToggleGroup(row.group.id);
      return;
    }
    if (row.item.text) {
      beginTextEdit(row.item);
      return;
    }
    const { values } = row.item;
    // Locked and never-written fields carry no values, so Enter is a no-op.
    if (values === undefined || values.length === 0) return;
    const index = values.indexOf(row.item.currentValue);
    const next = values[(index + 1) % values.length];
    if (next === undefined || next === row.item.currentValue) return;
    // The panel owns the displayed value now that `SettingsList` is gone, so
    // the row must carry the new value before the save round-trips.
    row.item.currentValue = next;
    changeField(row.item.id, next);
  }

  function settingsToggleGroup(id: string): void {
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
    // Land on the group header, which exists in both fold states.
    const rows = settingsRows(model.rows, collapsed);
    cursor = groupHeaderIndex(rows, id);
    settingsStart = cursorWindowStart(settingsStart, cursor, rows.length, body);
  }

  function settingsHandleInput(data: string): void {
    if (keybindings.matches(data, "tui.select.up")) settingsMove(-1);
    else if (keybindings.matches(data, "tui.select.down")) settingsMove(1);
    else if (data === " ") settingsActivate();
    else if (data === "\r" || data === "\n") settingsSave();
  }

  /**
   * Inline free-text editing.
   *
   * `ctx.ui.input` is not an option here: it mounts its prompt in the Pi
   * editor container and focuses it, so a 24-row overlay drawn on top hides
   * the echo, and closing the prompt hands focus back to the chat editor —
   * the panel would keep rendering but stop receiving keys. The panel
   * therefore owns the buffer and its own cursor, exactly like a cycling row.
   */
  function beginTextEdit(item: PanelSettingItem): void {
    editing = {
      id: item.id,
      item,
      text: item.currentValue,
    };
  }

  /** Commit with Enter, abandon with Escape; anything else only grows the buffer. */
  function handleTextEditInput(data: string): void {
    if (editing === undefined) return;
    if (data === "\r" || data === "\n") {
      const { id, item, text } = editing;
      editing = undefined;
      const value = text.trim();
      // An empty buffer means "leave it alone": no key in this table is
      // worth persisting as a blank string.
      if (value.length === 0 || value === item.currentValue) return;
      item.currentValue = value;
      changeField(id, value);
      return;
    }
    if (data === "\u001b") {
      editing = undefined;
      return;
    }
    if (data === "\u007f" || data === "\b") {
      editing.text = editing.text.slice(0, -1);
      return;
    }
    // A single printable character is text; a longer sequence is a key
    // (arrows, function keys) that the editor deliberately swallows.
    if (data.length === 1 && data >= " ") editing.text += data;
  }
  /** Enter: persist the panel's state. The panel stays open. */
  function settingsSave(): void {
    actions.save({});
    savedNotice = true;
  }

  /**
   * The two fixed detail rows for the row under the cursor: what the field
   * does and who it is for, then the recommended value with the meaning of
   * every option. Group headers and the non-Settings tabs explain nothing,
   * so both rows stay blank and the detail area never changes height.
   */
  function detailLines(): string[] {
    if (savedNotice)
      return [
        panelText("chrome.saved", model.language),
        "",
      ];
    const blank = [
      "",
      "",
    ];
    // An open editor takes the second detail row: the buffer, a block cursor,
    // and the keys that commit or abandon it.
    if (editing !== undefined)
      return [
        panelText(`detail.${editing.id}`, model.language),
        `✎ ${editing.text}\u2588 · ${panelText("chrome.edit", model.language)}`,
      ];
    if (tab !== SETTINGS_TAB) return blank;
    const row = settingsRows(model.rows, collapsed)[cursor];
    if (row === undefined || row.kind === "group") return blank;
    return [
      panelText(`detail.${row.item.id}`, model.language),
      panelText(`choice.${row.item.id}`, model.language),
    ];
  }

  function bodyRowsFor(width: number): string[] {
    if (tab === RECENT_TAB) {
      recentText.setText(
        recentWindow(model.status, recentRow, body)
          .map((line) => truncateToWidth(line, width, ""))
          .join("\n"),
      );
      return recentText.render(width);
    }
    if (tab === STATUS_TAB) {
      recentText.setText(
        statusWindow(model.statusJson, recentRow, body)
          .map((line) => truncateToWidth(line, width, ""))
          .join("\n"),
      );
      return recentText.render(width);
    }
    if (tab === SETTINGS_TAB) return settingsLines(width);
    return pendingList.render(width);
  }

  function changeField(id: string, value: string): void {
    if (id === "sleep") {
      void actions
        .confirm(
          "Run one-shot sleep",
          "Sleep performs one authorized T1 consolidation and is not persisted.",
        )
        .then((confirmed) => {
          if (!confirmed) {
            const sleep = model.rows.find((item) => item.id === "sleep");
            if (sleep) sleep.currentValue = "off";
            tui.requestRender();
            return;
          }
          return actions.sleep().then(done);
        });
      return;
    }
    if (id === "language") {
      // The panel renders its own labels, and `model.language` is what they read,
      // so the row must land in the view-model or the panel keeps the old
      // language until it is reopened.
      if (value === "en" || value === "zh") {
        actions.save({
          language: value,
        } as ConsoleSettings);
        model.language = value;
      }
    } else actions.save(settingsSaveValue(id, value, options.config));
    tui.requestRender();
  }
}

function padRow(text: string, width: number): string {
  const line = truncateToWidth(text, width, "");
  return line + " ".repeat(Math.max(width - visibleWidth(line), 0));
}
/**
 * What opening the panel needs beyond the data it renders.
 *
 * `resolveModule` is injectable so a test can force the terminal fallback
 * deterministically — on a machine where Glimpse is installed, an
 * uninjectable resolver would open a real window mid-test.
 */
export interface ConsoleOpenOptions {
  actions: ConsoleActions;
  resolveModule?: () => Promise<GlimpseModule | null>;
}
export async function openConsole(
  ctx: ExtensionContext,
  status: MemoryStatus,
  config: XpiMemoConfig,
  env: NodeJS.ProcessEnv,
  pending: PendingCandidate[],
  options: ConsoleOpenOptions,
): Promise<void> {
  const { actions, resolveModule = resolveGlimpseModule } = options;
  // One payload for both surfaces: `summarize` and the KPI cards read it, so a
  // second derivation would be free to disagree with this one.
  const statusJson = formatStatusJson(
    status,
    l0Status({
      env,
    }),
  );

  // Glimpse first. The terminal panel is the fallback, not a second choice,
  // and `openGlimpsePanel` reports `false` for absent *and* broken Glimpse.
  const handled = await openGlimpsePanel({
    actions,
    config,
    initialView: "pending",
    language: config.language,
    prefsPath: uiPrefsPath(config.dataDir),
    resolveModule,
    model: {
      now: Date.now(),
      pending,
      rows: settingsItems(config, env),
      status,
      statusJson,
    },
  });
  if (handled) return;

  await ctx.ui.custom(
    (tui, theme, keybindings, done) =>
      createConsoleComponent({
        actions,
        config,
        done: () => done(undefined),
        env,
        keybindings,
        pending,
        status,
        statusJson,
        terminalRows: tui.terminal.rows,
        theme,
        tui,
      }),
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: PANEL_WIDTH,
        margin: {
          bottom: OVERLAY_MARGIN_BOTTOM,
          left: 2,
          right: 2,
          top: 2,
        },
      },
    },
  );
}
