import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  type KeybindingsManager,
  type SelectItem,
  SelectList,
  type SettingItem,
  SettingsList,
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
    | "globalLimit"
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
/**
 * Settings items for `SettingsList`. An environment-locked field omits
 * `values`, which makes Enter a no-op on it, so the panel cannot persist a
 * value the environment already decides.
 */
export function settingsItems(
  config: XpiMemoConfig,
  env: NodeJS.ProcessEnv,
): SettingItem[] {
  const item = (
    id: string,
    label: string,
    currentValue: string,
    values: string[],
    environment: string,
  ): SettingItem => {
    const locked = Boolean(env[environment]);
    return {
      currentValue,
      id,
      label: locked ? `${label} (env locked)` : label,
      ...(locked
        ? {}
        : {
            values,
          }),
    };
  };
  return [
    item(
      "paused",
      "Pause T1",
      config.paused ? "on" : "off",
      [
        "off",
        "on",
      ],
      "XPI_MEMO_PAUSED",
    ),
    item(
      "recallPolicy",
      "Recall policy",
      config.recallPolicy,
      [
        "active",
        "assist",
        "high-value-auto",
      ],
      "XPI_MEMO_RECALL_POLICY",
    ),
    item(
      "retrievalMode",
      "Retrieval mode",
      config.retrievalMode,
      [
        "fts5",
        "hybrid",
      ],
      "XPI_MEMO_RETRIEVAL_MODE",
    ),
    item(
      "searchBackend",
      "Search backend",
      config.searchBackend,
      [
        "auto",
        "mnemosyne",
        "ripgrep",
        "qmd",
      ],
      "XPI_MEMO_SEARCH_BACKEND",
    ),
    item(
      "limit",
      "Limit",
      String(config.limit),
      [
        "1",
        "5",
        "10",
        "20",
      ],
      "XPI_MEMO_LIMIT",
    ),
    item(
      "globalLimit",
      "Global limit",
      String(config.globalLimit),
      [
        "1",
        "5",
        "10",
        "20",
      ],
      "XPI_MEMO_GLOBAL_LIMIT",
    ),
    item(
      "projectLimit",
      "Project limit",
      String(config.projectLimit),
      [
        "1",
        "5",
        "10",
        "20",
      ],
      "XPI_MEMO_PROJECT_LIMIT",
    ),
    {
      currentValue: "off",
      id: "sleep",
      label: "One-shot sleep",
      values: [
        "off",
        "run",
      ],
    },
  ];
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

  const settings = new SettingsList(
    model.rows,
    listMaxVisible(model.rows.length, body),
    {
      cursor: "→ ",
      description: (text: string) => theme.fg("muted", text),
      hint: (text: string) => theme.fg("dim", text),
      label: (text: string, selected: boolean) =>
        theme.fg(selected ? "accent" : "text", text),
      value: (text: string, selected: boolean) =>
        theme.fg(selected ? "accent" : "muted", text),
    },
    (id, value) => changeField(id, value),
    // Escape belongs to the panel, so the list must never act on it.
    () => undefined,
  );
  const recentText = new Text("", 0, 0);

  return {
    getBodyRows: () => body,
    getHeight: () => height,
    getRecentRow: () => recentRow,
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
      if (keybindings.matches(data, "tui.input.tab")) {
        if (tab === SETTINGS_TAB) settings.handleInput("\u001b[B");
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
      if (tab === SETTINGS_TAB) settings.handleInput(data);
      tui.requestRender();
    },
    invalidate(): void {
      pendingList.invalidate();
      recentText.invalidate();
      settings.invalidate();
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
    return (tab === PENDING_TAB ? pendingList : settings).render(width);
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
            settings.updateValue("sleep", "off");
            tui.requestRender();
            return;
          }
          return actions.sleep().then(done);
        });
      return;
    }
    if (id === "paused")
      actions.save({
        paused: value === "on",
      });
    else if (id === "recallPolicy" || id === "retrievalMode" || id === "searchBackend")
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
