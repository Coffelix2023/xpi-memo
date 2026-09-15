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
 * Panel chrome is 5 rows: border top, tab title row, two info-bar rows, border
 * bottom. The body takes whatever the terminal has left, floored at 3 rows.
 */
export const PANEL_CHROME_ROWS = 5;
export const MIN_BODY_ROWS = 3;

export function bodyRows(terminalRows: number): number {
  return Math.max(terminalRows - PANEL_CHROME_ROWS, MIN_BODY_ROWS);
}

/**
 * Fixed panel geometry, computed once when the panel opens. A viewport of
 * `terminalRows` can never show more than `terminalRows`, so the height is the
 * smaller of chrome + body and the viewport, with the body re-derived from that
 * height so the parts always add up.
 */
export function panelLayout(terminalRows: number): {
  body: number;
  height: number;
} {
  const height = Math.min(bodyRows(terminalRows) + PANEL_CHROME_ROWS, terminalRows);
  return {
    body: Math.max(height - PANEL_CHROME_ROWS, 0),
    height,
  };
}

/** Tab order is fixed: 0 Pending, 1 Recent, 2 Settings, 3 Status. Overview is the info bar. */
export const TAB_TITLES = [
  "Pending",
  "Recent",
  "Settings",
  "Status",
] as const;
export const TAB_COUNT = TAB_TITLES.length;
export const TAB_HINT = "←/→ tab · ↑/↓ move · Enter select · Tab field · Esc close";

/** Tab titles, so a tab switch may keep the list cursor where it was. */
export const PENDING_TAB = 0;
export const RECENT_TAB = 1;
export const SETTINGS_TAB = 2;
export const STATUS_TAB = 3;

export function nextTab(current: number, step: number): number {
  return (((current + step) % TAB_COUNT) + TAB_COUNT) % TAB_COUNT;
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
 * Persistent two-row Overview info bar: fixed tier ownership, then bank,
 * totals, today, pending, and visible-bank disk usage. It reads the view-model
 * only, so it never runs recall.
 */
export function infoBarLines(model: ConsoleViewModel, width: number): string[] {
  const { status } = model;
  const total = (status.counts.global ?? 0) + (status.counts.project ?? 0);
  const inner = Math.max(width - 4, 1);
  return [
    truncateToWidth(
      "L0 session trace → T1 xpi-memo → T2 deferred → T3 deferred",
      inner,
      "…",
    ),
    truncateToWidth(
      [
        `bank: ${status.currentProject?.bank ?? "global-only"}`,
        `total: ${total}`,
        `today: ${status.todayStored}`,
        `pending: ${status.pendingCandidates}`,
        `disk: ${status.diskBytes === null ? "unknown" : humanBytes(status.diskBytes)}`,
        `pause: ${status.paused ? "on" : "off"}`,
      ].join(" · "),
      inner,
      "…",
    ),
  ];
}

/** Title row: active tab on the left, key hints on the right. */
export function tabTitleLines(
  model: ConsoleViewModel,
  tab: number,
  width: number,
): string[] {
  const inner = Math.max(width - 4, 1);
  const label = TAB_TITLES[tab] ?? "";
  const left = tab === PENDING_TAB ? `${label} ${model.pending.length}` : label;
  const hint = truncateToWidth(
    TAB_HINT,
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
  id: string;
  label: string;
}

/**
 * The Settings tab's groups, in display order. Every id in
 * `SETTINGS_FIELD_SPECS` appears in exactly one group; `console.test.ts`
 * pairs the two structures so a new field cannot be added without a group.
 */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    id: "retrieval",
    label: "Retrieval",
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
    label: "Storage",
    fields: [
      "confirmStore",
      "autoExport",
      "offlineExtractionEnabled",
      "excludeToolResults",
      "dataDir",
    ],
  },
  {
    id: "pipeline",
    label: "Memory runtime",
    fields: [
      "paused",
      "l0Enabled",
      "profileInjection",
    ],
  },
  {
    id: "display",
    label: "Display",
    fields: [
      "language",
      "eventPresentation",
      "passiveFeedback",
    ],
  },
  {
    id: "privacy",
    label: "Privacy & maintenance",
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
  label: string;
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
    label: "Auto export",
    values: [
      "off",
      "on",
    ],
  },
  confirmStore: {
    environment: "XPI_MEMO_CONFIRM_STORE",
    label: "Confirm before store",
    values: [
      "off",
      "on",
    ],
  },
  dataDir: {
    environment: "XPI_MEMO_DATA_DIR",
    label: "Data directory",
    values: [],
  },
  eventPresentation: {
    environment: "XPI_MEMO_EVENT_PRESENTATION",
    label: "Event presentation",
    values: [
      "off",
      "on",
    ],
  },
  excludeToolResults: {
    environment: "XPI_MEMO_EXCLUDE_TOOL_RESULTS",
    label: "Exclude tool results",
    values: [
      "off",
      "on",
    ],
  },
  globalLimit: {
    environment: "XPI_MEMO_GLOBAL_LIMIT",
    label: "Global limit",
    values: [
      "1",
      "5",
      "10",
      "20",
    ],
  },
  l0Enabled: {
    environment: "XPI_MEMO_L0_ENABLED",
    label: "Session trace",
    values: [
      "off",
      "on",
    ],
  },
  language: {
    environment: "XPI_MEMO_LANGUAGE",
    label: "Language",
    values: [
      "en",
      "zh",
    ],
  },
  limit: {
    environment: "XPI_MEMO_LIMIT",
    label: "Limit",
    values: [
      "1",
      "5",
      "10",
      "20",
    ],
  },
  offlineExtractionEnabled: {
    environment: "XPI_MEMO_OFFLINE_EXTRACTION_ENABLED",
    label: "Offline extraction",
    values: [
      "off",
      "on",
    ],
  },
  passiveFeedback: {
    environment: "XPI_MEMO_PASSIVE_FEEDBACK",
    label: "Passive feedback",
    values: [
      "off",
      "on",
    ],
  },
  paused: {
    environment: "XPI_MEMO_PAUSED",
    label: "Pause memory",
    values: [
      "off",
      "on",
    ],
  },
  privacy: {
    environment: "XPI_MEMO_PRIVACY",
    label: "Privacy mode",
    values: [
      "off",
      "on",
    ],
  },
  profileInjection: {
    environment: "XPI_MEMO_PROFILE_INJECTION",
    label: "Preference profile",
    values: [
      "off",
      "on",
    ],
  },
  projectLimit: {
    environment: "XPI_MEMO_PROJECT_LIMIT",
    label: "Project limit",
    values: [
      "1",
      "5",
      "10",
      "20",
    ],
  },
  recallPolicy: {
    environment: "XPI_MEMO_RECALL_POLICY",
    label: "Recall policy",
    values: [
      "active",
      "assist",
      "high-value-auto",
    ],
  },
  retrievalMode: {
    environment: "XPI_MEMO_RETRIEVAL_MODE",
    label: "Retrieval mode",
    values: [
      "fts5",
      "hybrid",
    ],
  },
  searchBackend: {
    environment: "XPI_MEMO_SEARCH_BACKEND",
    label: "Search backend",
    values: [
      "auto",
      "mnemosyne",
      "ripgrep",
      "qmd",
    ],
  },
  sleep: {
    environment: null,
    label: "One-shot sleep",
    values: [
      "off",
      "run",
    ],
  },
  sleepMode: {
    environment: "XPI_MEMO_SLEEP_MODE",
    label: "Sleep mode",
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
    id,
    label:
      locked && environment !== null ? `${spec.label} (${environment})` : spec.label,
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

/**
 * One Settings row as panel text, without the surrounding borders. A selected
 * row is painted accent so the cursor stays readable; an unselected field row
 * keeps its label in the default colour and mutes only its value.
 */
export function settingsRowText(
  row: SettingsRow,
  selected: boolean,
  width: number,
  theme: Pick<Theme, "bold" | "fg">,
): string {
  if (row.kind === "group") {
    const text = `${row.open ? "▾" : "▸"} ${row.group.label} (${row.count})`;
    return selected ? theme.fg("accent", text) : theme.bold(text);
  }
  const label = `  ${row.item.label}`;
  const gap = Math.max(
    width - visibleWidth(label) - visibleWidth(row.item.currentValue),
    1,
  );
  const padding = " ".repeat(gap);
  return selected
    ? theme.fg("accent", `${label}${padding}${row.item.currentValue}`)
    : `${label}${padding}${theme.fg("muted", row.item.currentValue)}`;
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
    pending: options.pending,
    rows: settingsItems(options.config, options.env),
    status: options.status,
    statusJson: options.statusJson,
  };
  // Height is fixed at open time; the render guard only ever shrinks it.
  let { body, height } = panelLayout(options.terminalRows);
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
  const recentText = new Text("", 0, 0);

  return {
    getBodyRows: () => body,
    getHeight: () => height,
    getRecentRow: () => recentRow,
    getSettingsCursor: () => cursor,
    getTab: () => tab,
    handleInput(data: string): void {
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
      const lines = [
        theme.fg("borderAccent", `╭${"─".repeat(Math.max(width - 2, 1))}╮`),
        `│ ${padRow(theme.bold(tabTitleLines(model, tab, width)[0] ?? ""), inner)} │`,
      ];
      for (const row of fit(bodyRowsFor(inner), body))
        lines.push(`│ ${padRow(row, inner)} │`);
      const info = infoBarLines(model, width);
      lines.push(`│ ${padRow(theme.fg("dim", info[0] ?? ""), inner)} │`);
      lines.push(`│ ${padRow(theme.fg("muted", info[1] ?? ""), inner)} │`);
      lines.push(theme.fg("borderAccent", `╰${"─".repeat(Math.max(width - 2, 1))}╯`));
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
        settingsRowText(row, settingsStart + index === cursor, width, theme),
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

  /** Enter: fold a group header, cycle a writable field, ignore the rest. */
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
    else if (data === "\r" || data === "\n") settingsActivate();
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
    else if (
      id === "language" ||
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
      // No maxHeight: the component renders a fixed number of rows, so it
      // cannot exceed the viewport.
      overlayOptions: {
        anchor: "center",
        width: "70%",
      },
    },
  );
}
