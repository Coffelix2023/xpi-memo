import { getKeybindings, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import type { XpiMemoConfig } from "./config.js";
import { DEFAULT_XPI_MEMO_CONFIG } from "./config.js";
import {
  bodyRows,
  type ConsoleComponentOptions,
  type ConsoleViewModel,
  createConsoleComponent,
  fit,
  humanBytes,
  infoBarLines,
  listMaxVisible,
  moveRow,
  nextTab,
  openConsole,
  PENDING_TAB,
  panelLayout,
  pendingItems,
  RECENT_TAB,
  recentLines,
  recentWindow,
  SETTINGS_TAB,
  STATUS_TAB,
  settingsItems,
  statusLines,
  statusWindow,
  tabTitleLines,
} from "./console.js";
import type { PendingCandidate } from "./pending-candidate.js";
import type { MemoryStatus } from "./status.js";

const keybindings = getKeybindings();

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
    pending: o.pending,
    rows: settingsItems(o.config, o.env),
    status: o.status,
    statusJson: o.statusJson,
  };
}

// 4.1 — fixed-height bordered panel
describe("4.1 console panel layout (fixed height)", () => {
  it("derives body rows from the terminal", () => {
    expect(bodyRows(8)).toBe(3);
    expect(bodyRows(50)).toBe(45);
    expect(bodyRows(4)).toBe(3);
  });

  it("keeps the panel inside the viewport on small and large terminals", () => {
    expect(panelLayout(8)).toEqual({
      body: 3,
      height: 8,
    });
    expect(panelLayout(50)).toEqual({
      body: 45,
      height: 50,
    });
    expect(panelLayout(6).body + 5).toBe(6);
  });

  it("renders exactly the fixed height and never exceeds terminal rows", () => {
    for (const rows of [
      8,
      10,
      50,
    ]) {
      expect(
        component({
          terminalRows: rows,
        }).render(70),
      ).toHaveLength(rows);
    }
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
    expect(panel.render(70)).toHaveLength(50);
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
    expect(panel.render(70)).toHaveLength(50);
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
    expect(panel.render(70)).toHaveLength(50);
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
    expect(panel.render(70)).toHaveLength(50);
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
  it("settingsItems has pause + three limits + recallPolicy + retrievalMode + sleep", () => {
    const items = settingsItems(DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig, {});
    const ids = items.map((i) => i.id);
    expect(ids).toEqual([
      "paused",
      "recallPolicy",
      "retrievalMode",
      "searchBackend",
      "limit",
      "globalLimit",
      "projectLimit",
      "sleep",
    ]);
    // sleep always has values; env-locked items omit values.
    expect(items.find((i) => i.id === "sleep")?.values).toEqual([
      "off",
      "run",
    ]);
  });

  it("env-locked fields omit values and gain (env locked) label", () => {
    const items = settingsItems(DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig, {
      XPI_MEMO_RECALL_POLICY: "assist",
    });
    const policy = items.find((i) => i.id === "recallPolicy");
    expect(policy?.label).toBe("Recall policy (env locked)");
    expect(policy?.values).toBeUndefined();
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
    // Row 0 = paused (off → on)
    panel.handleInput("\r");
    expect(save).toHaveBeenCalledWith({
      paused: true,
    });
    // Tab walks down one field
    panel.handleInput("\t");
    panel.handleInput("\r");
    expect(save).toHaveBeenLastCalledWith({
      recallPolicy: "active",
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
    // Walk to limit (4 Tab presses from paused: recallPolicy, retrievalMode,
    // searchBackend, limit)
    panel.handleInput("\t");
    panel.handleInput("\t");
    panel.handleInput("\t");
    panel.handleInput("\t");
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
    panel.handleInput("\t"); // → recallPolicy (locked)
    panel.handleInput("\r");
    expect(save).not.toHaveBeenCalled();
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
    // Walk to sleep (last field): 7 Tab presses
    for (let i = 0; i < 7; i += 1) panel.handleInput("\t");
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
    for (let i = 0; i < 7; i += 1) panel.handleInput("\t");
    panel.handleInput("\r");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledOnce();
  });
});

// overlay wiring
describe("console overlay wiring", () => {
  it("opens a centered fixed-width overlay without maxHeight", async () => {
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
    expect(opts.overlayOptions).toEqual({
      anchor: "center",
      width: "70%",
    });
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
    expect(panel.getHeight()).toBe(12);
    expect(panel.getBodyRows()).toBe(7);
    expect(panel.render(60)).toHaveLength(12);
  });
});
