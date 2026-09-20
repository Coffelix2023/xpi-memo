import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getKeybindings, type SettingItem, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import type { XpiMemoConfig } from "./config.js";
import { DEFAULT_XPI_MEMO_CONFIG, loadConfig, saveUserConfig } from "./config.js";
import {
  bodyRows,
  type ConsoleComponentOptions,
  type ConsoleSettings,
  type ConsoleViewModel,
  clampCursor,
  createConsoleComponent,
  cursorWindowStart,
  fit,
  groupHeaderIndex,
  humanBytes,
  infoBarLines,
  LABEL_NOTE_GAP,
  listMaxVisible,
  MIN_BODY_ROWS,
  moveRow,
  NOTE_VALUE_GAP,
  nextTab,
  OVERLAY_MARGIN_BOTTOM,
  openConsole,
  PANEL_CHROME_ROWS,
  PANEL_HEIGHT,
  PANEL_WIDTH,
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
  settingsSaveValue,
  statusLines,
  statusWindow,
  tabBarLines,
  titleBorder,
} from "./console.js";
import type { PendingCandidate } from "./pending-candidate.js";
import type { MemoryStatus } from "./status.js";

const keybindings = getKeybindings();

/** Trailing `note ... value` gap of one Settings row, as rendered. */
const NOTE_TO_VALUE_PATTERN = /semantics( +)hybrid$/;
/** A description row must hold no copy at all. */
const LETTER_PATTERN = /[A-Za-z]/;
/** Splits an option legend into `value` tokens, ignoring `=` and separators. */
const LEGEND_TOKEN_PATTERN = /[^A-Za-z0-9.-]+/;

/** Identity theme: every style call returns its text unchanged. */
const THEME = {
  bold: (text: string) => text,
  fg: (_color: string, text: string) => text,
};

/**
 * Accent-painted body rows only. The tab bar paints the active tab label with
 * the same accent, so a raw accent tally would count it as a second cursor.
 */
function accentedRows(accented: readonly string[]): string[] {
  return accented.filter(
    (text) => text.startsWith("▾") || text.startsWith("▸") || text.startsWith("  "),
  );
}

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
    embedding: {
      mode: "local",
      model: "BAAI/bge-small-en-v1.5",
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
    // A tall terminal gets the documented 24-row panel, not the whole viewport.
    expect(panelLayout(50)).toEqual({
      body: 16,
      height: 24,
    });
    expect(panelLayout(100)).toEqual({
      body: 16,
      height: 24,
    });
    // A short terminal is squeezed to 70% of its rows.
    expect(panelLayout(24)).toEqual({
      body: 8,
      height: 16,
    });
    // The viewport clamp wins before the 3-row body floor can.
    expect(panelLayout(8)).toEqual({
      body: 0,
      height: 8,
    });
    expect(panelLayout(9)).toEqual({
      body: 1,
      height: 9,
    });
    // Below chrome + the body floor the panel can only show its frame.
    expect(panelLayout(6).body).toBe(0);
    // The body floor survives every budget path that outlives the chrome.
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

  it("embeds the bilingual title in the top border without breaking the frame", () => {
    const line = titleBorder(PANEL_WIDTH, THEME);
    expect(line).toContain("xpi-memo");
    expect(line).toContain("pi 的 DNA 记忆体");
    expect(line).toContain("pi's DNA memory");
    expect(visibleWidth(line)).toBe(PANEL_WIDTH);
    const rendered = component().render(PANEL_WIDTH);
    expect(rendered[0]).toBe(line);
    // Every row keeps the same visible width, so the right border stays aligned.
    for (const row of rendered) expect(visibleWidth(row)).toBe(PANEL_WIDTH);
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
  it("switches tabs with ←/→ and stops at both ends", () => {
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
    // The last tab absorbs further right presses instead of wrapping.
    panel.handleInput("\u001b[C");
    expect(panel.getTab()).toBe(STATUS_TAB);
    for (let i = 0; i < 5; i += 1) panel.handleInput("\u001b[D"); // ←
    // Four steps reach the first tab; the extra one must not jump to the end.
    expect(panel.getTab()).toBe(PENDING_TAB);
    expect(done).not.toHaveBeenCalled();
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

  it("navigation pure functions: nextTab clamps, moveRow wraps", () => {
    expect(nextTab(0, -1)).toBe(PENDING_TAB);
    expect(nextTab(STATUS_TAB, 1)).toBe(STATUS_TAB);
    expect(nextTab(RECENT_TAB, 1)).toBe(SETTINGS_TAB);
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

  it("the tab bar lists every tab and no tab body renders Overview", () => {
    const every = [
      "Pending",
      "Recent",
      "Settings",
      "Status",
    ];
    for (const tab of [
      PENDING_TAB,
      RECENT_TAB,
      SETTINGS_TAB,
      STATUS_TAB,
    ] as const) {
      const row = tabBarLines(viewModel(), tab, 70, THEME)[0] ?? "";
      // Every destination is on screen, so ←/→ is discoverable.
      for (const name of every) expect(row).toContain(name);
      expect(row).not.toContain("Overview");
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
    expect(tabBarLines(zh, SETTINGS_TAB, 70, THEME)[0]).toContain("设置");
    expect(tabBarLines(zh, PENDING_TAB, 70, THEME)[0]).toContain("待审 2");
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
      "offlineExtractionModel",
      "embeddingMode",
      "embeddingModel",
      "embeddingApiUrl",
      "excludeToolResults",
      "dataDir",
      "autoAdmit",
      "paused",
      "l0Enabled",
      "profileInjection",
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

  it("shows the resolved admission preference and locks it when pinned", () => {
    const configHome = mkdtempSync(join(tmpdir(), "xpi-memo-admission-panel-"));
    try {
      // `loadConfig` folds the environment into the value, so the panel shows
      // exactly what the admission decision will use.
      const { config } = loadConfig({
        configHome,
        env: {
          XPI_MEMO_ADMISSION_MIN_CONFIDENCE: "0.9",
          XPI_MEMO_ADMISSION_SOURCE_SCOPE: "current-project",
        },
      });
      const items = settingsItems(config, {
        XPI_MEMO_ADMISSION_MIN_CONFIDENCE: "0.9",
      });
      const confidence = items.find((item) => item.id === "admissionMinConfidence");
      expect(confidence?.currentValue).toBe("0.9");
      // Pinned: no cycling values, and the row names the variable.
      expect(confidence?.values).toBeUndefined();
      expect(
        settingsRowText(
          {
            groupId: "admission",
            item: confidence as SettingItem,
            kind: "field",
          },
          false,
          78,
          THEME,
          "en",
        ),
      ).toContain("⊘ XPI_MEMO_ADMISSION_MIN_CONFIDENCE");
      // An unpinned sibling shows its resolved value and stays editable.
      const scope = items.find((item) => item.id === "admissionSourceScope");
      expect(scope?.currentValue).toBe("current-project");
      expect(scope?.values).toEqual([
        "all",
        "current-project",
      ]);
    } finally {
      rmSync(configHome, {
        force: true,
        recursive: true,
      });
    }
  });

  it("keeps the admission group collapsed by default", () => {
    const items = settingsItems(DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig, {});
    // The default view expands the first group only.
    const rows = settingsRows(
      items,
      new Set(SETTINGS_GROUPS.slice(1).map((group) => group.id)),
    );
    expect(
      rows.find((row) => row.kind === "group" && row.group.id === "admission"),
    ).toMatchObject({
      kind: "group",
      open: false,
    });
  });

  it("both panel dictionaries cover every key the panel can ask for", () => {
    // Keys the panel renders: chrome, tabs, groups, fields, notes and info bar.
    const keys = [
      "chrome.hint",
      "chrome.saved",
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
        `detail.${id}`,
        `choice.${id}`,
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

  it("every detail row explains the field and every choice row names its options", () => {
    const items = settingsItems(DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig, {});
    for (const language of [
      "en",
      "zh",
    ] as const) {
      for (const item of items) {
        const detail = panelText(`detail.${item.id}`, language);
        const choice = panelText(`choice.${item.id}`, language);
        // Both rows must fit the 90-column inner width of the 94-column panel.
        expect(
          visibleWidth(detail),
          `${language} detail.${item.id}`,
        ).toBeLessThanOrEqual(90);
        expect(
          visibleWidth(choice),
          `${language} choice.${item.id}`,
        ).toBeLessThanOrEqual(90);
        // The detail row is an explanation, not the note column read back.
        expect(detail).not.toBe(panelText(`note.${item.id}`, language));
        // Every enumerated value is named in the option legend.
        const tokens = choice.split(LEGEND_TOKEN_PATTERN);
        for (const value of item.values ?? [])
          expect(tokens, `${language} choice.${item.id} is missing ${value}`).toContain(
            value,
          );
      }
    }
  });

  it("types a saved value from the field's configured type, never NaN", () => {
    const config = DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig;
    // `sleep` is a one-shot action row with no configured value to type off.
    const ids = SETTINGS_GROUPS.flatMap((group) => group.fields).filter(
      (id) => id !== "sleep",
    );
    for (const id of ids) {
      const current = config[id];
      // Numbers take a numeric string, everything else a name; a boolean field
      // resolves `"on"`-style input to a real boolean either way.
      const value = typeof current === "number" ? "10" : "hybrid";
      const saved = settingsSaveValue(id, value, config) as Record<string, unknown>;
      expect(typeof saved[id], id).toBe(typeof current);
    }
    // The reported bug: a boolean switch reached the file as Number("on").
    expect(settingsSaveValue("offlineExtractionEnabled", "on", config)).toEqual({
      offlineExtractionEnabled: true,
    });
    expect(settingsSaveValue("offlineExtractionEnabled", "off", config)).toEqual({
      offlineExtractionEnabled: false,
    });
    expect(settingsSaveValue("limit", "10", config)).toEqual({
      limit: 10,
    });
    expect(settingsSaveValue("retrievalMode", "fts5", config)).toEqual({
      retrievalMode: "fts5",
    });
  });

  it("Space on a boolean switch saves a boolean instead of NaN", () => {
    const save = vi.fn();
    const panel = component({
      actions: actions({
        save,
      }),
      terminalRows: 20,
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    // Walk down to the Storage header and unfold it.
    for (let i = 0; i < 7; i += 1) panel.handleInput("\u001b[B");
    expect(panel.getSettingsCursor()).toBe(7);
    panel.handleInput(" ");
    // Tab walks the group: confirmStore, autoExport, offline extraction.
    for (let i = 0; i < 3; i += 1) panel.handleInput("\t");
    expect(panel.getSettingsCursor()).toBe(10);
    // Offline extraction is off by default: Space turns it on and saves.
    panel.handleInput(" ");
    expect(save).toHaveBeenLastCalledWith({
      offlineExtractionEnabled: true,
    });
    const payload = (save.mock.calls.at(-1)?.[0] ?? {}) as Record<string, unknown>;
    expect(typeof payload.offlineExtractionEnabled).toBe("boolean");
    // Space again turns it back off, still as a boolean.
    panel.handleInput(" ");
    expect(save).toHaveBeenLastCalledWith({
      offlineExtractionEnabled: false,
    });
  });

  it("a boolean switch survives the round trip to the config file", () => {
    const configHome = mkdtempSync(join(tmpdir(), "xpi-memo-panel-"));
    const save = vi.fn((values: ConsoleSettings) => {
      saveUserConfig({
        configHome,
        env: {},
        values,
      });
    });
    const panel = component({
      actions: actions({
        save,
      }),
      terminalRows: 20,
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    for (let i = 0; i < 7; i += 1) panel.handleInput("\u001b[B");
    panel.handleInput(" "); // unfold Storage
    for (let i = 0; i < 3; i += 1) panel.handleInput("\t");
    panel.handleInput(" "); // offline extraction: off -> on
    // The reported symptom: the file kept `null` and the setting reverted.
    expect(
      loadConfig({
        configHome,
        env: {},
      }).config.offlineExtractionEnabled,
    ).toBe(true);
    rmSync(configHome, {
      force: true,
      recursive: true,
    });
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

  it("separates the label, note and value columns by fixed gaps", () => {
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
    // `  Retrieval mode` (22 wide) then the fixed 2-space separator.
    expect(row.startsWith(`  Retrieval mode${" ".repeat(LABEL_NOTE_GAP)}Hybrid`)).toBe(
      true,
    );
    // The value stays right-aligned behind at least the fixed 1-space gap; the
    // slack left by a short note lands in that gap.
    const trailing = NOTE_TO_VALUE_PATTERN.exec(row);
    expect(trailing).not.toBeNull();
    expect((trailing?.[1] ?? "").length).toBeGreaterThanOrEqual(NOTE_VALUE_GAP);
    expect(row.endsWith("hybrid")).toBe(true);
    expect(visibleWidth(row)).toBe(78);
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

  it("marks the free-text fields and leaves the read-only ones inert", () => {
    const items = settingsItems(DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig, {});
    const text = items
      .filter((item) => item.text === true)
      .map((item) => item.id)
      .sort();
    expect(text).toEqual([
      "embeddingApiUrl",
      "embeddingModel",
      "offlineExtractionModel",
    ]);
    // dataDir stays display-only: the panel never writes it.
    const dataDir = items.find((item) => item.id === "dataDir");
    expect(dataDir?.text).toBeUndefined();
    expect(dataDir?.values).toBeUndefined();
    // A text field never cycles values; it opens the inline editor instead.
    for (const item of items) if (item.text) expect(item.values).toBeUndefined();
    // An environment-pinned field is read-only, text or not.
    const pinned = settingsItems(DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig, {
      XPI_MEMO_EMBEDDING_MODEL: "BAAI/bge-m3",
    }).find((item) => item.id === "embeddingModel");
    expect(pinned?.text).toBeUndefined();
    expect(pinned?.description).toContain("XPI_MEMO_EMBEDDING_MODEL");
  });

  it("edits a free-text field inline and saves the typed value", () => {
    const save = vi.fn();
    const panel = component({
      actions: actions({
        save,
      }),
      terminalRows: 40,
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    // Unfold Storage and walk to the offline extraction model.
    for (let i = 0; i < 7; i += 1) panel.handleInput("\u001b[B");
    panel.handleInput(" "); // unfold Storage
    // Tab skips the header: the fourth Storage field is the offline model.
    for (let i = 0; i < 4; i += 1) panel.handleInput("\t");
    panel.handleInput(" "); // open the inline editor
    expect(panel.render(94).join("\n")).toContain("✎");
    // The buffer starts from the current value and replaces it.
    for (let i = 0; i < 20; i += 1) panel.handleInput("\u007f");
    for (const character of "openai/gpt-5") panel.handleInput(character);
    expect(panel.render(94).join("\n")).toContain("openai/gpt-5");
    panel.handleInput("\r");
    expect(save).toHaveBeenLastCalledWith({
      offlineExtractionModel: "openai/gpt-5",
    });
    // The editor is closed again and the row carries the new value.
    expect(panel.render(94).join("\n")).not.toContain("✎");
    expect(panel.render(94).join("\n")).toContain("openai/gpt-5");
  });

  it("Escape abandons an inline edit and leaves the value untouched", () => {
    const save = vi.fn();
    const done = vi.fn();
    const panel = component({
      actions: actions({
        save,
      }),
      done,
      terminalRows: 40,
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    for (let i = 0; i < 7; i += 1) panel.handleInput("\u001b[B");
    panel.handleInput(" "); // unfold Storage
    // Tab skips the header: the fifth field of Storage is the embedding mode.
    for (let i = 0; i < 5; i += 1) panel.handleInput("\t");
    panel.handleInput(" "); // off → local
    expect(save).toHaveBeenLastCalledWith({
      embeddingMode: "local",
    });
    save.mockClear();
    panel.handleInput("\t"); // → embedding model
    panel.handleInput(" "); // open the inline editor
    for (const character of "junk") panel.handleInput(character);
    panel.handleInput("\u001b"); // cancel, not close
    expect(save).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
    expect(panel.render(94).join("\n")).not.toContain("junk");
    // An empty buffer is not a value either: it never blanks a configured key.
    panel.handleInput(" ");
    panel.handleInput("\r");
    expect(save).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
  });

  it("saves the three embedding fields and writes none of them as a number", () => {
    const save = vi.fn();
    const panel = component({
      actions: actions({
        save,
      }),
      terminalRows: 40,
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    for (let i = 0; i < 7; i += 1) panel.handleInput("\u001b[B");
    panel.handleInput(" "); // unfold Storage
    // The embedding fields follow the offline extraction model, so five tabs
    // from the header land on the mode.
    for (let i = 0; i < 5; i += 1) panel.handleInput("\t");
    panel.handleInput(" "); // off → local
    panel.handleInput(" "); // local → api
    expect(save).toHaveBeenLastCalledWith({
      embeddingMode: "api",
    });
    panel.handleInput("\t"); // → embedding model
    panel.handleInput(" ");
    for (const character of "text-embedding-3-small") panel.handleInput(character);
    panel.handleInput("\r");
    expect(save).toHaveBeenLastCalledWith({
      embeddingModel: "text-embedding-3-small",
    });
    panel.handleInput("\t"); // → embedding API URL
    panel.handleInput(" ");
    panel.handleInput("\u007f".repeat(99));
    for (const character of "http://127.0.0.1:8080/v1") panel.handleInput(character);
    panel.handleInput("\r");
    expect(save).toHaveBeenLastCalledWith({
      embeddingApiUrl: "http://127.0.0.1:8080/v1",
    });
  });

  it("settingsRows expands the collapsed state into one cursor sequence", () => {
    const items = settingsItems(DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig, {});
    // Derived from the group table so adding a group or field cannot silently
    // invalidate the layout contract this test pins.
    const groupCount = SETTINGS_GROUPS.length;
    const firstGroupFields = SETTINGS_GROUPS[0]?.fields.length ?? 0;
    const totalFields = SETTINGS_GROUPS.reduce(
      (total, group) => total + group.fields.length,
      0,
    );
    // Default view: first group open, every later group collapsed.
    const firstOnly = settingsRows(
      items,
      new Set(SETTINGS_GROUPS.slice(1).map((group) => group.id)),
    );
    expect(firstOnly).toHaveLength(groupCount + firstGroupFields);
    expect(firstOnly.filter((row) => row.kind === "group")).toHaveLength(groupCount);
    expect(firstOnly.filter((row) => row.kind === "field")).toHaveLength(
      firstGroupFields,
    );
    // Fully collapsed: headers only.
    const allCollapsed = settingsRows(
      items,
      new Set(SETTINGS_GROUPS.map((group) => group.id)),
    );
    expect(allCollapsed).toHaveLength(groupCount);
    expect(allCollapsed.every((row) => row.kind === "group")).toBe(true);
    // Fully expanded: one header per group plus every field row.
    expect(settingsRows(items, new Set())).toHaveLength(groupCount + totalFields);
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
      "admission",
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
    expect(allCollapsed).toHaveLength(6);
    // The old index no longer exists; clamping keeps the cursor renderable.
    const moved = clampCursor(last, allCollapsed.length);
    expect(moved).toBe(5);
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
    expect(body).toContain("▸ Storage (9)");
    expect(body).toContain("▸ Pipeline (4)");
    // Exactly one row carries the cursor, and it is the first group header.
    const cursors = accentedRows(accented);
    expect(cursors).toHaveLength(1);
    expect(cursors[0]).toContain("Retrieval");
  });

  it("the new Settings path keeps the panel geometry contract", () => {
    const panel = component({
      terminalRows: 20,
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    const lines = panel.render(78);
    // 8 chrome rows + 16 body rows at the 24-row budget.
    // The key hints must survive the documented 78-column basis in full.
    expect(lines.at(-2)).toContain("Esc close");
    expect(lines.length).toBe(PANEL_HEIGHT);
    expect(panel.getBodyRows()).toBe(PANEL_HEIGHT - PANEL_CHROME_ROWS);
    // Every row fits the 78-column render width the caller asked for.
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

  it("Tab walks Settings fields and Space changes + saves values", () => {
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
    panel.handleInput(" ");
    expect(save).toHaveBeenLastCalledWith({
      recallPolicy: "active",
    });
    // Tab walks down one field: Recall policy → Retrieval mode.
    panel.handleInput("\t");
    panel.handleInput(" ");
    expect(save).toHaveBeenLastCalledWith({
      retrievalMode: "fts5",
    });
    // Shift+Tab walks back up to the previous field.
    panel.handleInput("\u001b[Z");
    panel.handleInput(" ");
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
    panel.handleInput(" ");
    expect(save).toHaveBeenLastCalledWith({
      limit: 10,
    });
  });

  it("env-locked settings stay read-only: Space never saves them", () => {
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
    panel.handleInput(" ");
    expect(save).not.toHaveBeenCalled();
    // A field no environment variable pins stays writable.
    panel.handleInput("\t"); // → Retrieval mode
    panel.handleInput(" ");
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
    panel.handleInput(" "); // unfold Privacy & maintenance
    for (let i = 0; i < 3; i += 1) panel.handleInput("\t"); // → One-shot sleep
    panel.handleInput(" ");
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
    panel.handleInput(" "); // unfold Privacy & maintenance
    for (let i = 0; i < 3; i += 1) panel.handleInput("\t"); // → One-shot sleep
    panel.handleInput(" ");
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
    // Row 0 is the first group header; the default view holds 12 rows.
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
    for (let i = 0; i < 9; i += 1) panel.handleInput("\u001b[B");
    expect(panel.getSettingsCursor()).toBe(0);
  });

  it("the window follows the cursor when the sequence outgrows the body", () => {
    const accented: string[] = [];
    const panel = component({
      // body = 2 rows, but the default view is 12 rows long.
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
    expect(accentedRows(accented)).toHaveLength(1);
    expect(accentedRows(accented)[0] ?? "").toContain("Retrieval");
    // Walking to the last row must drag the window with it.
    for (let i = 0; i < 11; i += 1) panel.handleInput("\u001b[B");
    accented.length = 0;
    panel.render(78);
    expect(accentedRows(accented)).toHaveLength(1);
    expect(accentedRows(accented)[0] ?? "").toContain("Privacy");
  });

  it("Space folds and unfolds a group header without saving", () => {
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
    panel.handleInput(" ");
    expect(save).not.toHaveBeenCalled();
    expect(panel.getSettingsCursor()).toBe(0);
    // A fully folded sequence has no field row for Tab to reach.
    panel.handleInput("\t");
    expect(panel.getSettingsCursor()).toBe(0);
    // Unfolding brings the fields back, still with the cursor on the header.
    panel.handleInput(" ");
    expect(panel.getSettingsCursor()).toBe(0);
    panel.handleInput("\t");
    expect(panel.getSettingsCursor()).toBe(1);
  });

  it("Enter saves the whole panel and never closes it", () => {
    const save = vi.fn();
    const done = vi.fn();
    const panel = component({
      actions: actions({
        save,
      }),
      done,
      terminalRows: 20,
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    // Enter persists the panel's current state instead of cycling a value.
    panel.handleInput("\r");
    expect(save).toHaveBeenLastCalledWith({});
    expect(panel.getTab()).toBe(SETTINGS_TAB);
    expect(done).not.toHaveBeenCalled();
    expect(panel.getSettingsCursor()).toBe(0);
    // The save notice takes over the description row and clears on navigation.
    expect(panel.render(94).join("\n")).toContain("Saved");
    panel.handleInput("\u001b[B");
    expect(panel.render(94).join("\n")).not.toContain("Saved");
  });

  it("Space cycles a writable field, ignores a locked one, and routes sleep to confirm", async () => {
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

    // Writable field: Space cycles to the next value and saves it.
    panel.handleInput("\t"); // → Recall policy
    panel.handleInput(" ");
    expect(save).toHaveBeenLastCalledWith({
      recallPolicy: "active",
    });

    // Locked field: its values were omitted, so Space is a no-op.
    save.mockClear();
    panel.handleInput("\t"); // → Retrieval mode, pinned by the environment
    panel.handleInput(" ");
    expect(save).not.toHaveBeenCalled();

    // Action row: walk back to the header and wrap up to the last group.
    for (let i = 0; i < 3; i += 1) panel.handleInput("\u001b[A");
    expect(panel.getSettingsCursor()).toBe(11);
    panel.handleInput(" "); // unfold Privacy & maintenance
    for (let i = 0; i < 3; i += 1) panel.handleInput("\t"); // → One-shot sleep
    panel.handleInput(" ");
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

  it("describes the field under the cursor in the two rows above the info bar", () => {
    const panel = component({
      terminalRows: 50,
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    const onHeader = panel.render(PANEL_WIDTH);
    expect(onHeader.at(-6)).not.toMatch(LETTER_PATTERN);
    panel.handleInput("\t"); // → Recall policy
    const onField = panel.render(PANEL_WIDTH);
    // The detail rows explain the field instead of echoing its note column.
    expect(onField.at(-6)).toContain("When the Agent recalls memory on its own");
    expect(onField.at(-6)).not.toContain("Auto-inject by value");
    expect(onField.at(-5)).toContain("Recommend: high-value-auto");
    // The row itself still shows label, note and value in the body.
    expect(onField.slice(2, -6).join("\n")).toContain("Auto-inject by value");
    // The info bar keeps its two rows underneath the detail rows.
    expect(onField.at(-4)).toContain("L0 session trace");
    expect(onField.at(-3)).toContain("bank: project-demo");
    // The key hints are the last row before the bottom border.
    expect(onField.at(-2)).toContain("Esc");
    expect(onField).toHaveLength(PANEL_HEIGHT);
  });

  it("switching the language field re-renders the panel in the new language", () => {
    const save = vi.fn();
    const panel = component({
      actions: actions({
        save,
      }),
      terminalRows: 50,
    });
    panel.handleInput("\u001b[C");
    panel.handleInput("\u001b[C"); // → Settings
    expect(panel.render(PANEL_WIDTH).join("\n")).toContain("Retrieval");
    // Display is the fifth header: retrieval, storage, pipeline and admission
    // come first.
    for (let i = 0; i < 10; i += 1) panel.handleInput("\u001b[B");
    expect(panel.getSettingsCursor()).toBe(10);
    panel.handleInput(" "); // fold Display open, cursor stays on the header
    panel.handleInput("\t"); // → Language, its first field
    panel.handleInput(" "); // en → zh
    expect(save).toHaveBeenLastCalledWith({
      language: "zh",
    });
    // The panel must switch immediately, without reopening /xpi-memo.
    const zh = panel.render(PANEL_WIDTH).join("\n");
    expect(zh).toContain("召回与检索");
    expect(zh).toContain("界面语言");
    expect(zh).not.toContain("Retrieval");
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
      // Force the terminal path: this machine has Glimpse installed, so the
      // default resolver would open a real window and the test would hang.
      {
        actions: actions(),
        resolveModule: async () => null,
      },
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
    expect(opts.overlayOptions.width).toBe(PANEL_WIDTH);
    expect(PANEL_WIDTH).toBe(94);
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
      {
        actions: actions(),
        resolveModule: async () => null,
      },
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
