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
import { describeMemoryKindOrNull } from "./kinds.js";
import type { PendingCandidate } from "./pending-candidate.js";
import { formatStatusJson, type MemoryStatus } from "./status.js";

export type ConsoleSettings = Partial<
  Pick<
    XpiMemoConfig,
    | "confirmStore"
    | "globalLimit"
    | "language"
    | "limit"
    | "paused"
    | "projectLimit"
    | "recallPolicy"
    | "retrievalMode"
    | "searchBackend"
  >
>;

export interface ConsoleActions {
  confirm(title: string, message: string): Promise<boolean>;
  reviewCandidate(candidate: PendingCandidate): Promise<void>;
  save(values: ConsoleSettings): void;
  sleep(): Promise<void>;
}

/**
 * Panel chrome is 6 rows: border top, tab title row, field-description row, two
 * info-bar rows, border bottom. The body is whatever the height budget left,
 * floored at 3 rows.
 */
export const PANEL_CHROME_ROWS = 6;
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
  rows: SettingItem[];
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
 * Panel copy: chrome, tab titles, group names, field labels and field notes.
 * Only the panel reads it — injection and hint copy lives in `index.ts`, which
 * renders prose rather than a 78-column grid, so the two are deliberately
 * separate dictionaries (design D7).
 */
type PanelLanguage = XpiMemoConfig["language"];

const PANEL_TEXT: Record<PanelLanguage, Record<string, string>> = {
  en: {
    "chrome.hint":
      "←/→ tab · ↑/↓ move · Space change · Enter save/select · Tab field · Esc close",
    "chrome.saved": "Saved · configuration written",
    "field.autoExport": "Auto export",
    "field.confirmStore": "Confirm store",
    "field.dataDir": "Data dir",
    "field.eventPresentation": "Event presentation",
    "field.excludeToolResults": "Tool results",
    "field.globalLimit": "Global limit",
    "field.l0Enabled": "Session trace",
    "field.language": "Language",
    "field.limit": "Recall limit",
    "field.offlineExtractionEnabled": "Offline extraction",
    "field.offlineExtractionModel": "Offline model",
    "field.passiveFeedback": "Passive feedback",
    "field.paused": "Pause memory",
    "field.privacy": "Privacy mode",
    "field.profileInjection": "Preference profile",
    "field.projectLimit": "Project limit",
    "field.recallPolicy": "Recall policy",
    "field.retrievalMode": "Retrieval mode",
    "field.searchBackend": "Search backend",
    "field.sleep": "Run sleep now",
    "field.sleepMode": "Sleep mode",
    "group.display": "Display",
    "group.pipeline": "Pipeline",
    "group.privacy": "Privacy",
    "group.retrieval": "Retrieval",
    "group.storage": "Storage",
    "info.bank": "bank",
    "info.disk": "disk",
    "info.pause": "pause",
    "info.pending": "pending",
    "info.tier": "L0 session trace → T1 xpi-memo → T2 deferred → T3 deferred",
    "info.today": "today",
    "info.total": "total",
    "note.autoExport": "Periodic export backup",
    "note.confirmStore": "Ask before writing",
    "note.dataDir": "Read-only, edit config file",
    "note.eventPresentation": "Show events in footer",
    "note.excludeToolResults": "Do not log tool output",
    "note.globalLimit": "Cap across projects",
    "note.l0Enabled": "Keep this session's trace",
    "note.language": "Panel and hint language",
    "note.limit": "Rows injected per turn",
    "note.offlineExtractionEnabled": "Works without a model",
    "note.offlineExtractionModel": "Read-only, edit the config file",
    "note.passiveFeedback": "Record usage feedback",
    "note.paused": "Resume any time",
    "note.privacy": "Persist no memory at all",
    "note.profileInjection": "Inject preference profile",
    "note.projectLimit": "Cap inside this project",
    "note.recallPolicy": "Auto-inject by value",
    "note.retrievalMode": "Hybrid adds semantics",
    "note.searchBackend": "Pick first available",
    "note.sleep": "Run one consolidation",
    "note.sleepMode": "When and how to tidy",
    "tab.pending": "Pending",
    "tab.recent": "Recent",
    "tab.settings": "Settings",
    "tab.status": "Status",
  },
  zh: {
    "chrome.hint":
      "←/→ 切页 · ↑/↓ 移动 · Space 切换 · Enter 保存/选择 · Tab 跳字段 · Esc 关闭",
    "chrome.saved": "已保存 · 配置已写入",
    "field.autoExport": "自动导出",
    "field.confirmStore": "存储前确认",
    "field.dataDir": "数据目录",
    "field.eventPresentation": "事件与页脚提示",
    "field.excludeToolResults": "排除工具输出",
    "field.globalLimit": "全局召回上限",
    "field.l0Enabled": "记录会话轨迹",
    "field.language": "界面语言",
    "field.limit": "单次召回条数",
    "field.offlineExtractionEnabled": "离线提取",
    "field.offlineExtractionModel": "离线提取模型",
    "field.passiveFeedback": "被动使用反馈",
    "field.paused": "暂停记忆",
    "field.privacy": "隐私模式",
    "field.profileInjection": "注入偏好画像",
    "field.projectLimit": "项目召回上限",
    "field.recallPolicy": "召回策略",
    "field.retrievalMode": "检索方式",
    "field.searchBackend": "搜索后端",
    "field.sleep": "立即整理一次",
    "field.sleepMode": "记忆整理方式",
    "group.display": "界面与反馈",
    "group.pipeline": "记忆管道",
    "group.privacy": "隐私与维护",
    "group.retrieval": "召回与检索",
    "group.storage": "存储与提取",
    "info.bank": "库",
    "info.disk": "占用",
    "info.pause": "暂停",
    "info.pending": "待审",
    "info.tier": "L0 会话轨迹 → T1 xpi-memo → T2 延后 → T3 延后",
    "info.today": "今日",
    "info.total": "总数",
    "note.autoExport": "定期导出备份",
    "note.confirmStore": "写入前先问你",
    "note.dataDir": "只读, 改它要编辑配置",
    "note.eventPresentation": "页脚展示记忆事件",
    "note.excludeToolResults": "不记录工具输出",
    "note.globalLimit": "跨项目的上限",
    "note.l0Enabled": "保留本轮会话轨迹",
    "note.language": "面板与提示语言",
    "note.limit": "每次注入的条数",
    "note.offlineExtractionEnabled": "无模型也能提取",
    "note.offlineExtractionModel": "只读, 改它要编辑配置",
    "note.passiveFeedback": "记录使用反馈",
    "note.paused": "停用后可随时恢复",
    "note.privacy": "不写任何持久记忆",
    "note.profileInjection": "注入偏好画像",
    "note.projectLimit": "本项目内的上限",
    "note.recallPolicy": "按价值自动注入",
    "note.retrievalMode": "hybrid 兼顾语义",
    "note.searchBackend": "自动选可用后端",
    "note.sleep": "执行一次记忆整理",
    "note.sleepMode": "整理时机与方式",
    "tab.pending": "待审",
    "tab.recent": "最近",
    "tab.settings": "设置",
    "tab.status": "状态",
  },
};

/**
 * One panel string. Falls back selected language → `en` → the key itself, so a
 * missing entry renders readable text instead of an empty row.
 */
export function panelText(key: string, language: PanelLanguage): string {
  const selected: Record<string, string> | undefined = PANEL_TEXT[language];
  return selected?.[key] ?? PANEL_TEXT.en[key] ?? key;
}

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

/** Title row: active tab on the left, key hints on the right. */
export function tabTitleLines(
  model: ConsoleViewModel,
  tab: number,
  width: number,
): string[] {
  const inner = Math.max(width - 4, 1);
  const label = tabTitle(model, tab);
  const left = tab === PENDING_TAB ? `${label} ${model.pending.length}` : label;
  const hint = truncateToWidth(
    panelText("chrome.hint", model.language),
    Math.max(inner - visibleWidth(left) - 2, 1),
    "…",
  );
  const gap = " ".repeat(Math.max(inner - visibleWidth(left) - visibleWidth(hint), 1));
  return [
    `${left}${gap}${hint}`,
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
      "excludeToolResults",
      "dataDir",
    ],
  },
  {
    id: "pipeline",
    fields: [
      "paused",
      "l0Enabled",
      "profileInjection",
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

interface SettingsFieldSpec {
  /**
   * Environment variable that pins this field, or `null` when nothing
   * governs it. Every name listed here is already read by `loadConfig` in
   * `config.ts`; this table only surfaces them in the panel.
   */
  environment: string | null;
  /** Empty for fields the panel never writes, such as the data directory. */
  values: readonly string[];
}

/**
 * Settings metadata keyed by field id. `Record` over the id union makes the
 * compiler refuse a partial table, so widening `XpiMemoConfig` cannot
 * silently leave a field out of the panel.
 */
const SETTINGS_FIELD_SPECS: Record<SettingsFieldId, SettingsFieldSpec> = {
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
  // Read-only in the panel: a model id is free text, and the row shows the
  // configured one plus the hint to edit the config file or the environment.
  offlineExtractionModel: {
    environment: "XPI_MEMO_OFFLINE_EXTRACTION_MODEL",
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
 * Every settings row, in group order. A field pinned by an environment
 * variable or never written by the panel omits `values`, which makes Enter a
 * no-op on it, so the panel cannot persist a value it does not own.
 */
export function settingsItems(
  config: XpiMemoConfig,
  env: NodeJS.ProcessEnv,
): SettingItem[] {
  return SETTINGS_GROUPS.flatMap((group) =>
    group.fields.map((id) => settingsItem(id, config, env)),
  );
}

function settingsItem(
  id: SettingsFieldId,
  config: XpiMemoConfig,
  env: NodeJS.ProcessEnv,
): SettingItem {
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
      item: SettingItem;
      kind: "field";
    };

/**
 * The Settings tab's visible rows, in display order: every group header, then
 * the fields of every group that is not collapsed. The cursor indexes into
 * this sequence, so a group header is a real landing spot for up/down.
 */
export function settingsRows(
  items: readonly SettingItem[],
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
      .filter((item): item is SettingItem => item !== undefined);
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
        theme.fg("borderAccent", `╭${"─".repeat(Math.max(width - 2, 1))}╮`),
        `│ ${padRow(theme.bold(tabTitleLines(model, tab, width)[0] ?? ""), inner)} │`,
      ];
      for (const row of fit(bodyRowsFor(inner), body))
        lines.push(`│ ${padRow(row, inner)} │`);
      lines.push(`│ ${padRow(theme.fg("muted", describeRow()), inner)} │`);
      const info = infoBarLines(model, width);
      lines.push(`│ ${padRow(theme.fg("dim", info[0] ?? ""), inner)} │`);
      lines.push(`│ ${padRow(theme.fg("muted", info[1] ?? ""), inner)} │`);
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

  /** Space: fold a group header, cycle a writable field, ignore the rest. */
  function settingsActivate(): void {
    const rows = settingsRows(model.rows, collapsed);
    const row = rows[cursor];
    if (row === undefined) return;
    if (row.kind === "group") {
      settingsToggleGroup(row.group.id);
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

  /** Enter: persist the panel's state. The panel stays open. */
  function settingsSave(): void {
    actions.save({});
    savedNotice = true;
  }

  /**
   * Text for the description row: the save notice first, otherwise the note of
   * the row under the cursor. Only the Settings tab has field notes.
   */
  function describeRow(): string {
    if (savedNotice) return panelText("chrome.saved", model.language);
    if (tab !== SETTINGS_TAB) return "";
    const row = settingsRows(model.rows, collapsed)[cursor];
    if (row === undefined || row.kind === "group") return "";
    return row.item.description ?? panelText(`note.${row.item.id}`, model.language);
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
    if (id === "paused" || id === "confirmStore")
      actions.save({
        [id]: value === "on",
      } as ConsoleSettings);
    else if (id === "language") {
      // The panel renders its own labels, and `model.language` is what they read,
      // so the row must land in the view-model or the panel keeps the old
      // language until it is reopened.
      if (value === "en" || value === "zh") {
        actions.save({
          language: value,
        } as ConsoleSettings);
        model.language = value;
      }
    } else if (
      id === "recallPolicy" ||
      id === "retrievalMode" ||
      id === "searchBackend"
    )
      actions.save({
        [id]: value,
      } as ConsoleSettings);
    else
      actions.save({
        [id]: Number(value),
      } as ConsoleSettings);
    tui.requestRender();
  }
}

function padRow(text: string, width: number): string {
  const line = truncateToWidth(text, width, "");
  return line + " ".repeat(Math.max(width - visibleWidth(line), 0));
}

export async function openConsole(
  ctx: ExtensionContext,
  status: MemoryStatus,
  config: XpiMemoConfig,
  env: NodeJS.ProcessEnv,
  pending: PendingCandidate[],
  actions: ConsoleActions,
): Promise<void> {
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
        statusJson: formatStatusJson(
          status,
          l0Status({
            env,
          }),
        ),
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
