import { getKeybindings, type SettingItem, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import type { XpiMemoConfig } from "./config.js";
import { DEFAULT_XPI_MEMO_CONFIG } from "./config.js";
import {
  bodyRows,
  type ConsoleComponentOptions,
  type ConsoleViewModel,
  clampCursor,
  createConsoleComponent,
  cursorWindowStart,
  fit,
  groupHeaderIndex,
  humanBytes,
  infoBarLines,
  listMaxVisible,
  MIN_BODY_ROWS,
  moveRow,
  nextTab,
  OVERLAY_MARGIN_BOTTOM,
  openConsole,
  PANEL_CHROME_ROWS,
  PANEL_HEIGHT,
  PENDING_TAB,
  panelLayout,
  panelText,
  pendingItems,
  RECENT_TAB,
  recentLines,
  recentWindow,
  SETTINGS_GROUPS,
  SETTINGS_TAB,
  STATUS_TAB,
  settingsItems,
  settingsRows,
  settingsRowText,
  statusLines,
  statusWindow,
  tabTitleLines,
} from "./console.js";
import type { PendingCandidate } from "./pending-candidate.js";
import type { MemoryStatus } from "./status.js";

const keybindings = getKeybindings();

/** Identity theme: every style call returns its text unchanged. */
const THEME = {
  bold: (text: string) => text,
  fg: (_color: string, text: string) => text,
};

function status(overrides: Partial<MemoryStatus> = {}): MemoryStatus {
  return {
    diskBytes: 4096,
    fallback: null,
    paused: false,
    pendingCandidates: 1,
    provenance: "test",
    todayStored: 2,
    counts: {
      global: 3,
      project: 4,
      session: null,
    },
    currentProject: {
      bank: "project-demo",
      id: "demo",
      label: "demo",
    },
    recall: {
      scope: "current-project-plus-global",
      queriedBanks: [
        "project-demo",
        "default",
      ],
    },
    recentEntries: [
      {
        action: "write",
        bank: "project-demo",
        kind: "project_decision",
        scope: "global",
        status: "stored",
        timestamp: "2026-08-29T10:00:00.000Z",
      },
    ],
    retrieval: {
      embeddingAvailable: null,
      mode: "hybrid",
    },
    sleep: {
      dedicatedModelSupported: false,
      enabled: false,
      mode: "none",
      sleepCommandSupported: false,
      state: "SLEEP_DISABLED",
    },
    tiers: {
      L0: "external-session-trace",
      T1: "xpi-memo",
      T2: "deferred-ai-memory",
      T3: "deferred-memvid",
    },
    ...overrides,
  };
}

function candidate(id: string): PendingCandidate {
  return {
    content: `Use the existing adapter boundary ${id}.`,
    id,
    kind: "project_decision",
    targetBank: "project-demo",
    targetScope: "global",
  } as unknown as PendingCandidate;
}

function actions(overrides: Partial<ConsoleComponentOptions["actions"]> = {}) {
  return {
    confirm: async () => true,
    reviewCandidate: async () => undefined,
    save: () => undefined,
    sleep: async () => undefined,
    ...overrides,
  };
}

function options(
  overrides: Partial<ConsoleComponentOptions> = {},
): ConsoleComponentOptions {
  return {
    actions: actions(),
    config: DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig,
    env: {},
    done: () => undefined,
    keybindings,
    status: status(),
    statusJson: "{}",
    terminalRows: 50,
    pending: [
      candidate("a"),
      candidate("b"),
    ],
    theme: {
      bold: (t: string) => t,
      fg: (_c: string, t: string) => t,
    },
    tui: {
      requestRender: () => undefined,
      terminal: {
        rows: 50,
      },
    },
    ...overrides,
  };
}

function component(overrides: Partial<ConsoleComponentOptions> = {}) {
  return createConsoleComponent(options(overrides));
}

function viewModel(overrides: Partial<ConsoleComponentOptions> = {}): ConsoleViewModel {
  const o = options(overrides);
  return {
    env: o.env,
    language: o.config.language,
    pending: o.pending,
    rows: settingsItems(o.config, o.env),
    status: o.status,
    statusJson: o.statusJson,
  };
}

// 4.1 — fixed-height bordered panel
describe("4.1 console panel layout (fixed height)", () => {
  it("derives body rows from the panel height budget", () => {
    expect(bodyRows(8)).toBe(3);
    expect(bodyRows(50)).toBe(PANEL_HEIGHT - PANEL_CHROME_ROWS);
    expect(bodyRows(4)).toBe(3);
  });

  it("caps the height at the documented budget and tightens on small terminals", () => {
    // A tall terminal gets the documented 20-row panel, not the whole viewport.
    expect(panelLayout(50)).toEqual({
      body: 15,
      height: 20,
    });
    expect(panelLayout(100)).toEqual({
      body: 15,
      height: 20,
    });
    // A short terminal is squeezed to 70% of its rows.
    expect(panelLayout(24)).toEqual({
      body: 11,
      height: 16,
    });
    // The 3-row body floor still wins over the share, and the viewport clamps.
    expect(panelLayout(8)).toEqual({
      body: 3,
      height: 8,
    });
    expect(panelLayout(6).body + PANEL_CHROME_ROWS).toBe(6);
    // The body floor survives every budget path.
    expect(bodyRows(6)).toBe(MIN_BODY_ROWS);
    expect(bodyRows(11)).toBe(MIN_BODY_ROWS);
  });

  it("renders the budget height and never exceeds terminal rows", () => {
    for (const rows of [
      8,
      10,
      50,
    ]) {
      const tui = {
        requestRender: () => undefined,
        terminal: {
          rows,
        },
      };
      expect(
        component({
          terminalRows: rows,
          tui,
        }).render(70).length,
      ).toBeLessThanOrEqual(rows);
    }
    // A short viewport clamps at the terminal, not the budget.
    expect(
      component({
        terminalRows: 50,
      }).render(70),
    ).toHaveLength(PANEL_HEIGHT);
  });

  it("shrinks but never grows when the terminal resizes", () => {
    const o = options({
      terminalRows: 50,
    });
    const tui = o.tui as {
      terminal: {
        rows: number;
      };
    };
    const panel = createConsoleComponent(o);
    expect(panel.render(70)).toHaveLength(PANEL_HEIGHT);
    tui.terminal.rows = 9;
    expect(panel.render(70).length).toBeLessThanOrEqual(9);
  });

  it("fit pads/truncates to exactly rows lines", () => {
    expect(
      fit(
        [
          "a",
          "b",
          "c",
        ],
        5,
      ),
    ).toHaveLength(5);
    expect(
      fit(
        [
          "a",
          "b",
          "c",
          "d",
        ],
        2,
      ),
    ).toEqual([
      "a",
      "b",
    ]);
  });
});

// 4.2 — directional navigation only
describe("4.2 console directional navigation", () => {
  it("switches tabs with ←/→ and wraps", () => {
    const done = vi.fn();
    const panel = component({
      done,
    });
    expect(panel.getTab()).toBe(PENDING_TAB);
    panel.handleInput("\u001b[C"); // →
    expect(panel.getTab()).toBe(RECENT_TAB);
    panel.handleInput("\u001b[C"); // →
    expect(panel.getTab()).toBe(SETTINGS_TAB);
    panel.handleInput("\u001b[C"); // → Status
    expect(panel.getTab()).toBe(STATUS_TAB);
    panel.handleInput("\u001b[C"); // → wrap to Pending
    expect(panel.getTab()).toBe(PENDING_TAB);
    panel.handleInput("\u001b[D"); // ← wrap from 0
    expect(panel.getTab()).toBe(STATUS_TAB);
  });

  it("recent ↑/↓ move inside the tab with wrap and never leave it", () => {
    const entries = Array.from(
      {
        length: 10,
      },
      (_v, i) => ({
        action: "write",
        bank: `bank-${i}`,
        kind: "project_decision",
        scope: "global",
        status: "stored",
        timestamp: `2026-08-29T10:0${i}:00.000Z`,
      }),
    );
    const panel = component({
      status: status({
        recentEntries: entries,
      }),
    });
    panel.handleInput("\u001b[C"); // → Recent
    expect(panel.getTab()).toBe(RECENT_TAB);
    const before = panel.getRecentRow();
    panel.handleInput("\u001b[B"); // ↓
    expect(panel.getRecentRow()).toBe(moveRow(before, 1, 10));
    panel.handleInput("\u001b[A"); // ↑
    expect(panel.getRecentRow()).toBe(before);
  });

  it("Tab is inert on Pending and Recent, only walks Settings fields", () => {
    const panel = component();
    panel.handleInput("\t"); // Pending — inert
    expect(panel.getTab()).toBe(PENDING_TAB);
    panel.handleInput("\u001b[C"); // → Recent
    panel.handleInput("\t"); // Recent — inert
    expect(panel.getTab()).toBe(RECENT_TAB);
  });

  it("number keys are inert", () => {
    const panel = component();
    const tabBefore = panel.getTab();
    panel.handleInput("1");
    panel.handleInput("2");
    expect(panel.getTab()).toBe(tabBefore);
  });

  it("Escape and Ctrl-C close via cancel keybinding with \\u001b fallback", () => {
    const done = vi.fn();
    const panel = component({
      done,
    });
    panel.handleInput("\u001b");
    expect(done).toHaveBeenCalledOnce();
    done.mockClear();
    panel.handleInput("\u0003");
    expect(done).toHaveBeenCalledOnce();
  });

  it("navigation pure functions: nextTab wrap, moveRow wrap", () => {
    expect(nextTab(0, -1)).toBe(STATUS_TAB);
    expect(nextTab(STATUS_TAB, 1)).toBe(PENDING_TAB);
    expect(moveRow(0, -1, 3)).toBe(2);
    expect(moveRow(2, 1, 3)).toBe(0);
    expect(moveRow(0, 1, 0)).toBe(0);
    expect(listMaxVisible(3, 5)).toBe(5);
    expect(listMaxVisible(10, 5)).toBe(4);
  });
});

// 4.3 — Overview is the persistent bottom info bar, not a tab
describe("4.3 console Overview info bar", () => {
  it("renders ownership plus counters, truncated to the panel width", () => {
    const wide = infoBarLines(viewModel(), 90);
    expect(wide[0]).toContain("L0 session trace → T1 xpi-memo");
    expect(wide[1]).toContain("bank: project-demo");
    expect(wide[1]).toContain("total: 7");
    expect(wide[1]).toContain("today: 2");
    expect(wide[1]).toContain("pending: 1");
    expect(wide[1]).toContain("disk: 4.0 KB");
    expect(wide[1]).toContain("pause: off");
    expect(
      infoBarLines(
        viewModel({
          status: status({
            diskBytes: null,
          }),
        }),
        90,
      )[1],
    ).toContain("disk: unknown");
    expect(
      infoBarLines(
        viewModel({
          status: status({
            paused: true,
          }),
        }),
        90,
      )[1],
    ).toContain("pause: on");
    for (const line of infoBarLines(viewModel(), 20))
      expect(visibleWidth(line)).toBeLessThanOrEqual(16);
  });

  it("no tab body renders Overview; tab titles carry the tab name", () => {
    for (const tab of [
      PENDING_TAB,
      RECENT_TAB,
      SETTINGS_TAB,
    ] as const) {
      expect(tabTitleLines(viewModel(), tab, 70)[0]).toContain(
        [
          "Pending",
          "Recent",
          "Settings",
        ][tab],
      );
      // "Overview" as a literal never appears in the tab title row.
      expect(tabTitleLines(viewModel(), tab, 70)[0]).not.toContain("Overview");
    }
  });

  it("localizes the info bar and tab titles", () => {
    const zh = viewModel({
      config: {
        ...DEFAULT_XPI_MEMO_CONFIG,
        language: "zh",
      } as XpiMemoConfig,
    });
    expect(infoBarLines(zh, 90)[0]).toContain("L0 会话轨迹");
    expect(infoBarLines(zh, 90)[1]).toContain("库: project-demo");
    expect(infoBarLines(zh, 90)[1]).toContain("待审: 1");
    expect(tabTitleLines(zh, SETTINGS_TAB, 70)[0]).toContain("设置");
    expect(infoBarLines(viewModel(), 90)[0]).toContain("L0 session trace");
  });

  it("the rendered panel speaks the configured language", () => {
    const zh = component({
      config: {
        ...DEFAULT_XPI_MEMO_CONFIG,
        language: "zh",
      } as XpiMemoConfig,
      terminalRows: 20,
    });
    zh.handleInput("\u001b[C"); // → Recent
    zh.handleInput("\u001b[C"); // → Settings
    const zhLines = zh.render(78).join("\n");
    expect(zhLines).toContain("设置");
    expect(zhLines).toContain("召回与检索");
    expect(zhLines).toContain("召回策略");
    expect(zhLines).toContain("按价值自动注入");
    const en = component({
      terminalRows: 20,
    });
    en.handleInput("\u001b[C");
    en.handleInput("\u001b[C");
    const enLines = en.render(78).join("\n");
    expect(enLines).toContain("Settings");
    expect(enLines).toContain("Retrieval");
    expect(enLines).toContain("Auto-inject by value");
  });

  it("humanBytes formats KiB-range and below", () => {
    expect(humanBytes(4096)).toBe("4.0 KB");
    expect(humanBytes(0)).toBe("0 B");
    expect(humanBytes(1023)).toBe("1023 B");
  });
});

// 4.4 — Pending tab: SelectList, Enter → reviewCandidate, no delete
describe("4.4 Pending tab", () => {
  it("SelectList items show kind · bank and a bounded summary", () => {
    const items = pendingItems([
      candidate("a"),
    ]);
    expect(items[0]?.label).toBe("Decision · project-demo");
    expect(items[0]?.description).toBe("Use the existing adapter boundary a.");
    expect(items[0]?.value).toBe("a");
  });

  it("Enter on Pending triggers reviewCandidate and save is not called", async () => {
    const reviewCandidate = vi.fn(async () => undefined);
    const save = vi.fn();
    const done = vi.fn();
    const panel = component({
      actions: actions({
        reviewCandidate,
        save,
      }),
      done,
    });
    panel.handleInput("\r");
    await Promise.resolve();
    await Promise.resolve();
    expect(reviewCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "a",
      }),
    );
    expect(done).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });

  it("rendered panel does not surface a delete control", () => {
    const rendered = component().render(70).join("\n");
    expect(rendered.toLowerCase()).not.toContain("delete");
  });

  it("empty pending list renders fixed height without crashing", () => {
    const panel = component({
      pending: [],
    });
    expect(panel.render(70)).toHaveLength(PANEL_HEIGHT);
  });
});

// 4.5 — Recent tab: windowed Text, scrolling inside the body region
describe("4.5 Recent tab", () => {
  it("recentLines emit audit metadata only", () => {
    const lines = recentLines(status());
    expect(lines[0]).toBe(
      "write · Decision · project-demo · stored · 2026-08-29T10:00:00.000Z",
    );
    expect(lines.join(" ")).not.toContain("adapter boundary");
  });

  it("recentWindow is exactly body rows long even with 200 entries", () => {
    const entries = Array.from(
      {
        length: 200,
      },
      (_v, i) => ({
        action: "write",
        bank: `bank-${i}`,
        kind: "project_decision",
        scope: "global",
        status: "stored",
        timestamp: `2026-08-29T10:${String(i % 60).padStart(2, "0")}:00.000Z`,
      }),
    );
    const s = status({
      recentEntries: entries,
    });
    for (const row of [
      0,
      7,
      40,
      199,
    ]) {
      expect(recentWindow(s, row, 3)).toHaveLength(3);
      expect(recentWindow(s, row, 45)).toHaveLength(45);
    }
    expect(recentWindow(s, 199, 3).at(-1)).toContain("bank-199");
  });

  it("empty recent list renders a placeholder at fixed height", () => {
    const panel = component({
      status: status({
        recentEntries: [],
      }),
    });
    panel.handleInput("\u001b[C"); // → Recent
    const rendered = panel.render(70).join("\n");
    expect(rendered).toContain("No recent activity");
    expect(panel.render(70)).toHaveLength(PANEL_HEIGHT);
  });

  it("scrolling Recent does not grow the panel", () => {
    const entries = Array.from(
      {
        length: 50,
      },
      (_v, i) => ({
        action: "write",
        bank: `bank-${i}`,
        kind: "project_decision",
        scope: "global",
        status: "stored",
        timestamp: `2026-08-29T10:${String(i % 60).padStart(2, "0")}:00.000Z`,
      }),
    );
    const panel = component({
      status: status({
        recentEntries: entries,
      }),
    });
    panel.handleInput("\u001b[C"); // → Recent
    const before = panel.render(70).length;
    panel.handleInput("\u001b[B"); // ↓
    panel.handleInput("\u001b[B"); // ↓
    expect(panel.render(70).length).toBe(before);
  });
});

// 4.5b — Status tab: windowed JSON, scrolling inside the body region
describe("4.5b Status tab", () => {
  const json = JSON.stringify(
    {
      counts: {
        global: 3,
      },
      l0: {
        sessionCount: 2,
      },
      search: {
        active: "ripgrep",
      },
    },
    null,
    2,
  );

  it("statusLines splits the JSON and statusWindow is exactly rows long", () => {
    const lines = statusLines(json);
    expect(lines).toHaveLength(11);
    expect(lines[0]).toBe("{");
    for (const row of [
      0,
      7,
      10,
    ]) {
      expect(statusWindow(json, row, 3)).toHaveLength(3);
    }
    expect(statusWindow(json, 10, 3).at(-1)).toContain("}");
  });

  it("renders the Status tab with JSON content at fixed height", () => {
    const panel = component({
      statusJson: json,
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Status
    expect(panel.getTab()).toBe(STATUS_TAB);
    const rendered = panel.render(70).join("\n");
    expect(rendered).toContain('"active": "ripgrep"');
    expect(rendered).toContain('"sessionCount": 2');
    expect(panel.render(70)).toHaveLength(PANEL_HEIGHT);
  });

  it("scrolling Status does not grow the panel", () => {
    const panel = component({
      statusJson: json,
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Status
    const before = panel.render(70).length;
    panel.handleInput("\u001b[B"); // ↓
    panel.handleInput("\u001b[B"); // ↓
    expect(panel.render(70).length).toBe(before);
  });
});

// 4.6 — Settings tab: SettingsList, save calls, env locks, one-shot sleep
describe("4.6 Settings tab", () => {
  it("settingsItems covers every config field plus the one-shot sleep", () => {
    const items = settingsItems(DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig, {});
    const ids = items.map((i) => i.id);
    expect(ids).toEqual([
      "recallPolicy",
      "retrievalMode",
      "searchBackend",
      "limit",
      "globalLimit",
      "projectLimit",
      "confirmStore",
      "autoExport",
      "offlineExtractionEnabled",
      "excludeToolResults",
      "dataDir",
      "paused",
      "l0Enabled",
      "profileInjection",
      "language",
      "eventPresentation",
      "passiveFeedback",
      "privacy",
      "sleepMode",
      "sleep",
    ]);
    // No field is shown twice.
    expect(new Set(ids).size).toBe(ids.length);
    // sleep always has values; env-locked and never-written items omit values.
    expect(items.find((i) => i.id === "sleep")?.values).toEqual([
      "off",
      "run",
    ]);
  });

  it("env-locked fields omit values and name the variable in the note slot", () => {
    const items = settingsItems(DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig, {
      XPI_MEMO_CONFIRM_STORE: "true",
      XPI_MEMO_LANGUAGE: "zh",
      XPI_MEMO_RECALL_POLICY: "assist",
    });
    // The item itself is language-neutral: its `label` is the dictionary key.
    const confirm = items.find((i) => i.id === "confirmStore");
    expect(confirm?.values).toBeUndefined();
    expect(
      settingsRowText(
        {
          groupId: "storage",
          item: confirm as SettingItem,
          kind: "field",
        },
        false,
        78,
        THEME,
        "en",
      ),
    ).toContain("⊘ XPI_MEMO_CONFIRM_STORE");
    const language = items.find((i) => i.id === "language");
    expect(language?.values).toBeUndefined();
    expect(
      settingsRowText(
        {
          groupId: "display",
          item: language as SettingItem,
          kind: "field",
        },
        false,
        78,
        THEME,
        "en",
      ),
    ).toContain("⊘ XPI_MEMO_LANGUAGE");
    const policy = items.find((i) => i.id === "recallPolicy");
    expect(policy?.values).toBeUndefined();
    expect(
      settingsRowText(
        {
          groupId: "retrieval",
          item: policy as SettingItem,
          kind: "field",
        },
        false,
        78,
        THEME,
        "en",
      ),
    ).toContain("⊘ XPI_MEMO_RECALL_POLICY");
    // A field no environment variable pins stays writable.
    expect(items.find((i) => i.id === "limit")?.values).toEqual([
      "1",
      "5",
      "10",
      "20",
    ]);
  });

  it("both panel dictionaries cover every key the panel can ask for", () => {
    // Keys the panel renders: chrome, tabs, groups, fields, notes and info bar.
    const keys = [
      "chrome.hint",
      "info.bank",
      "info.disk",
      "info.pause",
      "info.pending",
      "info.tier",
      "info.today",
      "info.total",
      "tab.pending",
      "tab.recent",
      "tab.settings",
      "tab.status",
      ...SETTINGS_GROUPS.map((group) => `group.${group.id}`),
      ...SETTINGS_GROUPS.flatMap((group) => group.fields).flatMap((id) => [
        `field.${id}`,
        `note.${id}`,
      ]),
    ];
    for (const language of [
      "en",
      "zh",
    ] as const) {
      for (const key of keys) {
        expect(panelText(key, language).length, `${language} ${key}`).toBeGreaterThan(
          0,
        );
      }
    }
    // The two languages really differ, so the switch is observable.
    expect(panelText("field.limit", "zh")).not.toBe(panelText("field.limit", "en"));
  });

  it("a missing translation falls back to en and never renders empty", () => {
    // An unknown key is the worst case: readable fallback, no throw, no blank.
    expect(panelText("field.doesNotExist", "zh")).toBe("field.doesNotExist");
    expect(panelText("note.doesNotExist", "zh")).toBe("note.doesNotExist");
    const item: SettingItem = {
      currentValue: "5",
      id: "limit",
      label: "limit",
    };
    const row = settingsRowText(
      {
        groupId: "retrieval",
        item,
        kind: "field",
      },
      false,
      78,
      THEME,
      "zh",
    );
    expect(row.length).toBeGreaterThan(0);
    expect(visibleWidth(row)).toBeLessThanOrEqual(78);
  });

  it("a field row carries label, value and note as three aligned columns", () => {
    const item: SettingItem = {
      currentValue: "hybrid",
      id: "retrievalMode",
      label: "retrievalMode",
    };
    const row = settingsRowText(
      {
        groupId: "retrieval",
        item,
        kind: "field",
      },
      false,
      78,
      THEME,
      "en",
    );
    expect(row).toContain("Retrieval mode");
    expect(row).toContain("Hybrid adds semantics");
    expect(row).toContain("hybrid");
    expect(visibleWidth(row)).toBe(78);
    // The value column is right-aligned: it ends the row.
    expect(row.endsWith("hybrid")).toBe(true);
    // The label column starts the row.
    expect(row.startsWith("  Retrieval mode")).toBe(true);
  });

  it("a narrow row drops the note column before the label or the value", () => {
    const item: SettingItem = {
      currentValue: "high-value-auto",
      id: "recallPolicy",
      label: "recallPolicy",
    };
    const row = settingsRowText(
      {
        groupId: "retrieval",
        item,
        kind: "field",
      },
      false,
      40,
      THEME,
      "en",
    );
    expect(row).not.toContain("Auto-inject by value");
    expect(row).toContain("Recall policy");
    expect(row).toContain("high-value-auto");
    expect(visibleWidth(row)).toBeLessThanOrEqual(40);
  });

  it("every field belongs to exactly one group and dataDir is never writable", () => {
    const grouped = SETTINGS_GROUPS.flatMap((group) => group.fields);
    expect(new Set(grouped).size).toBe(grouped.length);
    const ids = settingsItems(DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig, {}).map(
      (item) => item.id,
    );
    // The group table and the field spec table describe the same field set.
    expect(
      [
        ...grouped,
      ].sort(),
    ).toEqual(
      [
        ...ids,
      ].sort(),
    );
    const dataDir = settingsItems(DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig, {}).find(
      (item) => item.id === "dataDir",
    );
    expect(dataDir?.currentValue).toBe(DEFAULT_XPI_MEMO_CONFIG.dataDir);
    expect(dataDir?.values).toBeUndefined();
  });

  it("settingsRows expands the collapsed state into one cursor sequence", () => {
    const items = settingsItems(DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig, {});
    const collapsedElsewhere = new Set([
      "storage",
      "pipeline",
      "display",
      "privacy",
    ]);
    // Default view: first group open, the remaining four collapsed.
    const firstOnly = settingsRows(items, collapsedElsewhere);
    expect(firstOnly).toHaveLength(11);
    expect(firstOnly.filter((row) => row.kind === "group")).toHaveLength(5);
    expect(firstOnly.filter((row) => row.kind === "field")).toHaveLength(6);
    // Fully collapsed: headers only.
    const allCollapsed = settingsRows(
      items,
      new Set(SETTINGS_GROUPS.map((group) => group.id)),
    );
    expect(allCollapsed).toHaveLength(5);
    expect(allCollapsed.every((row) => row.kind === "group")).toBe(true);
    // Fully expanded: 5 headers + all 20 rows.
    expect(settingsRows(items, new Set())).toHaveLength(25);
  });

  it("cursorWindowStart keeps the cursor visible inside the sequence", () => {
    const total = 25;
    const rows = 15;
    // Cursor above the window pulls it up.
    expect(cursorWindowStart(10, 3, total, rows)).toBe(3);
    // Cursor below the window pushes it down, leaving the cursor at the bottom.
    expect(cursorWindowStart(0, 20, total, rows)).toBe(6);
    // Cursor already inside the window leaves it alone.
    expect(cursorWindowStart(5, 9, total, rows)).toBe(5);
    // A sequence shorter than the window never scrolls.
    expect(cursorWindowStart(0, 2, 5, rows)).toBe(0);
    // Every cursor position stays inside a window that fits the sequence.
    for (let cursor = 0; cursor < total; cursor += 1) {
      const start = cursorWindowStart(0, cursor, total, rows);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start + rows).toBeLessThanOrEqual(total);
      expect(cursor).toBeGreaterThanOrEqual(start);
      expect(cursor).toBeLessThan(start + rows);
    }
  });

  it("collapsing moves the cursor onto a row that still exists", () => {
    const items = settingsItems(DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig, {});
    const collapsedElsewhere = new Set([
      "storage",
      "pipeline",
      "display",
      "privacy",
    ]);
    const firstOpen = settingsRows(items, collapsedElsewhere);
    // The first group's last field row sits just before its neighbour's header.
    const last = 6;
    expect(firstOpen[last]?.kind).toBe("field");
    expect(firstOpen[last + 1]?.kind).toBe("group");
    const allCollapsed = settingsRows(
      items,
      new Set([
        ...collapsedElsewhere,
        "retrieval",
      ]),
    );
    expect(allCollapsed).toHaveLength(5);
    // The old index no longer exists; clamping keeps the cursor renderable.
    const moved = clampCursor(last, allCollapsed.length);
    expect(moved).toBe(4);
    expect(allCollapsed[moved]).toBeDefined();
    // Reopening lands on the group header, which is a real row.
    expect(groupHeaderIndex(firstOpen, "retrieval")).toBe(0);
    expect(firstOpen[groupHeaderIndex(firstOpen, "retrieval")]?.kind).toBe("group");
    // An empty sequence never yields a negative or out-of-range cursor.
    expect(clampCursor(5, 0)).toBe(0);
  });

  it("renders both arrows with per-group counts and a distinguishable cursor", () => {
    const accented: string[] = [];
    const panel = component({
      terminalRows: 20,
      theme: {
        bold: (text: string) => text,
        fg: (color: string, text: string) => {
          if (color === "accent") accented.push(text);
          return text;
        },
      },
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    const lines = panel.render(78);
    const body = lines.slice(2, 17).join("\n");
    // Default view: the first group is open, the remaining four are folded.
    expect(body).toContain("▾ Retrieval (6)");
    expect(body).toContain("▸ Storage (5)");
    expect(body).toContain("▸ Pipeline (3)");
    // Exactly one row carries the cursor, and it is the first group header.
    expect(accented).toHaveLength(1);
    expect(accented[0]).toContain("Retrieval");
  });

  it("the new Settings path keeps the panel geometry contract", () => {
    const panel = component({
      terminalRows: 20,
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    const lines = panel.render(78);
    // 5 chrome rows + 15 body rows at the 20-row budget.
    expect(lines.length).toBe(PANEL_HEIGHT);
    expect(panel.getBodyRows()).toBe(PANEL_HEIGHT - PANEL_CHROME_ROWS);
    // Every row fits the 78-column basis.
    for (const line of lines) expect(visibleWidth(line)).toBe(78);
    // Border characters stay continuous around every body row.
    expect(lines[0]?.startsWith("╭")).toBe(true);
    expect(lines[lines.length - 1]?.startsWith("╰")).toBe(true);
    for (const line of lines.slice(1, -1)) {
      expect(line.startsWith("│")).toBe(true);
      expect(line.endsWith("│")).toBe(true);
    }
    // The layout contract itself is untouched by the grouping change.
    expect(bodyRows(6)).toBe(3);
    expect(panelLayout(6).height).toBe(6);
    const tall = component({
      terminalRows: 50,
    });
    tall.handleInput("\u001b[C");
    tall.handleInput("\u001b[C");
    expect(tall.render(78).length).toBe(PANEL_HEIGHT);
  });

  it("Tab walks Settings fields and Enter changes + saves values", () => {
    const save = vi.fn();
    const panel = component({
      actions: actions({
        save,
      }),
      terminalRows: 20,
    });
    panel.handleInput("\u001b[C"); // → Recent
    panel.handleInput("\u001b[C"); // → Settings
    expect(panel.getTab()).toBe(SETTINGS_TAB);
    // The cursor starts on a group header, so Tab is what reaches a field.
    panel.handleInput("\t");
    panel.handleInput("\r");
    expect(save).toHaveBeenLastCalledWith({
      recallPolicy: "active",
    });
    // Tab walks down one field: Recall policy → Retrieval mode.
    panel.handleInput("\t");
    panel.handleInput("\r");
    expect(save).toHaveBeenLastCalledWith({
      retrievalMode: "fts5",
    });
    // Shift+Tab walks back up to the previous field.
    panel.handleInput("\u001b[Z");
    panel.handleInput("\r");
    expect(save).toHaveBeenLastCalledWith({
      recallPolicy: "assist",
    });
  });

  it("limit is saved as a number, not a string", () => {
    const save = vi.fn();
    const panel = component({
      actions: actions({
        save,
      }),
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    // Tab skips the header; Limit is the fourth field of the first group.
    for (let i = 0; i < 4; i += 1) panel.handleInput("\t");
    panel.handleInput("\r");
    expect(save).toHaveBeenLastCalledWith({
      limit: 10,
    });
  });

  it("env-locked settings stay read-only: Enter never saves", () => {
    const save = vi.fn();
    const panel = component({
      actions: actions({
        save,
      }),
      env: {
        XPI_MEMO_RECALL_POLICY: "assist",
      },
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    panel.handleInput("\t"); // → Recall policy, pinned by the environment
    panel.handleInput("\r");
    expect(save).not.toHaveBeenCalled();
    // A field no environment variable pins stays writable.
    panel.handleInput("\t"); // → Retrieval mode
    panel.handleInput("\r");
    expect(save).toHaveBeenLastCalledWith({
      retrievalMode: "fts5",
    });
  });

  it("sleep is one-shot behind explicit confirmation; reject resets and no sleep", async () => {
    const sleep = vi.fn(async () => undefined);
    const done = vi.fn();
    const confirm = vi.fn(async () => false);
    const panel = component({
      actions: actions({
        confirm,
        sleep,
      }),
      terminalRows: 20,
      done,
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    // The row sequence wraps, so one ↑ reaches the last group header.
    panel.handleInput("\u001b[A");
    panel.handleInput("\r"); // unfold Privacy & maintenance
    for (let i = 0; i < 3; i += 1) panel.handleInput("\t"); // → One-shot sleep
    panel.handleInput("\r");
    await Promise.resolve();
    await Promise.resolve();
    expect(confirm).toHaveBeenCalledWith(
      "Run one-shot sleep",
      expect.stringContaining("not persisted"),
    );
    expect(sleep).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
  });

  it("sleep runs exactly once then closes when confirmed", async () => {
    const sleep = vi.fn(async () => undefined);
    const done = vi.fn();
    const confirm = vi.fn(async () => true);
    const panel = component({
      actions: actions({
        confirm,
        sleep,
      }),
      terminalRows: 20,
      done,
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    panel.handleInput("\u001b[A");
    panel.handleInput("\r"); // unfold Privacy & maintenance
    for (let i = 0; i < 3; i += 1) panel.handleInput("\t"); // → One-shot sleep
    panel.handleInput("\r");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledOnce();
  });

  it("up/down walk the row sequence across headers and wrap at both ends", () => {
    const panel = component({
      terminalRows: 20,
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    // Row 0 is the first group header; the default view holds 11 rows.
    expect(panel.getSettingsCursor()).toBe(0);
    panel.handleInput("\u001b[B");
    expect(panel.getSettingsCursor()).toBe(1);
    // Six more steps cross the open group's fields onto the next header.
    for (let i = 0; i < 6; i += 1) panel.handleInput("\u001b[B");
    expect(panel.getSettingsCursor()).toBe(7);
    // Up stays inside the sequence.
    for (let i = 0; i < 4; i += 1) panel.handleInput("\u001b[A");
    expect(panel.getSettingsCursor()).toBe(3);
    // Down wraps from the last row back to the first.
    for (let i = 0; i < 8; i += 1) panel.handleInput("\u001b[B");
    expect(panel.getSettingsCursor()).toBe(0);
  });

  it("the window follows the cursor when the sequence outgrows the body", () => {
    const accented: string[] = [];
    const panel = component({
      // body = 5 rows, but the default view is 11 rows long.
      terminalRows: 10,
      theme: {
        bold: (text: string) => text,
        fg: (color: string, text: string) => {
          if (color === "accent") accented.push(text);
          return text;
        },
      },
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    accented.length = 0;
    panel.render(78);
    expect(accented).toHaveLength(1);
    expect(accented[0] ?? "").toContain("Retrieval");
    // Walking to the last row must drag the window with it.
    for (let i = 0; i < 10; i += 1) panel.handleInput("\u001b[B");
    accented.length = 0;
    panel.render(78);
    expect(accented).toHaveLength(1);
    expect(accented[0] ?? "").toContain("Privacy");
  });

  it("Enter folds and unfolds a group header without saving", () => {
    const save = vi.fn();
    const panel = component({
      actions: actions({
        save,
      }),
      terminalRows: 20,
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    // Folding keeps the cursor on the header it just folded.
    panel.handleInput("\r");
    expect(save).not.toHaveBeenCalled();
    expect(panel.getSettingsCursor()).toBe(0);
    // A fully folded sequence has no field row for Tab to reach.
    panel.handleInput("\t");
    expect(panel.getSettingsCursor()).toBe(0);
    // Unfolding brings the fields back, still with the cursor on the header.
    panel.handleInput("\r");
    expect(panel.getSettingsCursor()).toBe(0);
    panel.handleInput("\t");
    expect(panel.getSettingsCursor()).toBe(1);
  });

  it("Enter cycles a writable field, ignores a locked one, and routes sleep to confirm", async () => {
    const save = vi.fn();
    const confirm = vi.fn(async () => false);
    const sleep = vi.fn(async () => undefined);
    const panel = component({
      actions: actions({
        confirm,
        save,
        sleep,
      }),
      terminalRows: 20,
      env: {
        XPI_MEMO_RETRIEVAL_MODE: "hybrid",
      },
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings

    // Writable field: Enter cycles to the next value and saves it.
    panel.handleInput("\t"); // → Recall policy
    panel.handleInput("\r");
    expect(save).toHaveBeenLastCalledWith({
      recallPolicy: "active",
    });

    // Locked field: its values were omitted, so Enter is a no-op.
    save.mockClear();
    panel.handleInput("\t"); // → Retrieval mode, pinned by the environment
    panel.handleInput("\r");
    expect(save).not.toHaveBeenCalled();

    // Action row: walk back to the header and wrap up to the last group.
    for (let i = 0; i < 3; i += 1) panel.handleInput("\u001b[A");
    expect(panel.getSettingsCursor()).toBe(10);
    panel.handleInput("\r"); // unfold Privacy & maintenance
    for (let i = 0; i < 3; i += 1) panel.handleInput("\t"); // → One-shot sleep
    panel.handleInput("\r");
    await Promise.resolve();
    await Promise.resolve();
    expect(confirm).toHaveBeenCalledWith(
      "Run one-shot sleep",
      expect.stringContaining("not persisted"),
    );
    // Neither the locked field nor the action row went through the save path.
    expect(save).not.toHaveBeenCalled();
  });

  it("Tab and Shift+Tab skip group headers in both directions", () => {
    const panel = component({
      terminalRows: 20,
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    // Forward from the first header lands on its first field.
    panel.handleInput("\t");
    expect(panel.getSettingsCursor()).toBe(1);
    // Backward wraps around the headers to the previous field row.
    panel.handleInput("\u001b[Z");
    expect(panel.getSettingsCursor()).toBe(6);
  });
});

// overlay wiring
describe("console overlay wiring", () => {
  it("opens a centered fixed-width overlay with the documented bottom margin", async () => {
    const custom = vi.fn(async (_factory: unknown, _options: unknown) => undefined);
    await openConsole(
      {
        ui: {
          custom,
        },
      } as never,
      status(),
      DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig,
      {},
      [
        candidate("a"),
      ],
      actions(),
    );
    expect(custom).toHaveBeenCalledOnce();
    const [, opts] = custom.mock.calls[0] as [
      unknown,
      {
        overlay: boolean;
        overlayOptions: Record<string, unknown>;
      },
    ];
    expect(opts.overlay).toBe(true);
    expect(opts.overlayOptions.anchor).toBe("center");
    expect(opts.overlayOptions.width).toBe("70%");
    // `TUI-DESIGN.md`: the panel must clear the conversation input area.
    const margin = opts.overlayOptions.margin as {
      bottom: number;
    };
    expect(margin.bottom).toBeGreaterThanOrEqual(4);
    expect(margin.bottom).toBe(OVERLAY_MARGIN_BOTTOM);
    expect(opts.overlayOptions.maxHeight).toBeUndefined();
  });

  it("passes the terminal row count into the component factory", async () => {
    let factory:
      | ((
          ...args: [
            unknown,
            unknown,
            unknown,
            () => void,
          ]
        ) => unknown)
      | undefined;
    await openConsole(
      {
        ui: {
          custom: async (fn: typeof factory) => {
            factory = fn;
          },
        },
      } as never,
      status(),
      DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig,
      {},
      [],
      actions(),
    );
    const panel = factory?.(
      {
        requestRender: () => undefined,
        terminal: {
          rows: 12,
        },
      },
      {
        bold: (t: string) => t,
        fg: (_c: string, t: string) => t,
      },
      keybindings,
      () => undefined,
    ) as ReturnType<typeof createConsoleComponent>;
    expect(panel.getHeight()).toBe(panelLayout(12).height);
    expect(panel.getBodyRows()).toBe(panelLayout(12).body);
    expect(panel.render(60)).toHaveLength(panelLayout(12).height);
  });
});
