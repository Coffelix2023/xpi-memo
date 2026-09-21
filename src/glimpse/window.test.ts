import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getKeybindings } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_XPI_MEMO_CONFIG, type XpiMemoConfig } from "../config.js";
import {
  type ConsoleActions,
  type createConsoleComponent,
  openConsole,
  settingsItems,
} from "../console.js";
import { panelText } from "../panel-text.js";
import { modelFixture, settingsRowsFixture, statusFixture } from "./fixture.js";
import type { GlimpseOpenFn, GlimpseWindow } from "./module.js";
import { loadPanelPreferences } from "./prefs.js";
import { openGlimpsePanel, WINDOW_HEIGHT, WINDOW_WIDTH } from "./window.js";

/**
 * The window and the fallback, driven through injected fakes.
 *
 * Nothing here touches a real `glimpseui`: this machine has it installed, so a
 * test that reached the default resolver would open an actual window and hang.
 * Every case injects a module — including the ones that want the terminal path,
 * which inject a resolver returning `null`.
 */

function fakeWindow(): {
  emit: (event: string, arg?: unknown) => Promise<void>;
  html: string[];
  closed: () => number;
  win: GlimpseWindow;
} {
  const handlers: Record<string, Array<(arg?: unknown) => void>> = {};
  const html: string[] = [];
  let closes = 0;

  const win = {
    close: () => {
      closes += 1;
    },
    on: (event: string, handler: (arg?: unknown) => void) => {
      handlers[event] = [
        ...(handlers[event] ?? []),
        handler,
      ];
      return win;
    },
    send: () => undefined,
    setHTML: (next: string) => {
      html.push(next);
    },
  } as unknown as GlimpseWindow;

  return {
    closed: () => closes,
    emit: async (event, arg) => {
      // `openGlimpsePanel` awaits its resolver before registering handlers, so
      // a synchronous emit would arrive before anything is listening.
      await new Promise((resolve) => setTimeout(resolve, 0));
      for (const handler of handlers[event] ?? []) handler(arg);
    },
    html,
    win,
  };
}

function stubActions(overrides: Partial<ConsoleActions> = {}): ConsoleActions {
  return {
    confirm: async () => true,
    reviewCandidate: async () => undefined,
    save: () => undefined,
    sleep: async () => undefined,
    ...overrides,
  };
}

/** The config the window types its writes against; nothing here mutates it. */
const TEST_CONFIG = DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig;

/** A model without the language, which `openGlimpsePanel` owns. */
function modelWithoutLanguage() {
  const { language: _language, ...rest } = modelFixture();
  return rest;
}

let prefsDir = "";
function prefsPath(): string {
  if (!prefsDir) prefsDir = mkdtempSync(join(tmpdir(), "glimpse-window-"));
  return join(prefsDir, "ui-prefs.json");
}

afterEach(() => {
  if (prefsDir) {
    rmSync(prefsDir, {
      force: true,
      recursive: true,
    });
    prefsDir = "";
  }
});

describe("glimpse window (5.1)", () => {
  it("opens at the documented 800x600 size", async () => {
    const opened = fakeWindow();
    const open = vi.fn<GlimpseOpenFn>(() => opened.win);

    const panel = openGlimpsePanel({
      actions: stubActions(),
      config: TEST_CONFIG,
      initialView: "pending",
      language: "zh",
      model: modelWithoutLanguage(),
      prefsPath: prefsPath(),
      resolveModule: async () => ({
        open,
      }),
    });

    // Registration happens after the resolver settles.
    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
    const [, options] = open.mock.calls[0];
    expect(options.width).toBe(WINDOW_WIDTH);
    expect(options.height).toBe(WINDOW_HEIGHT);
    expect(WINDOW_WIDTH).toBe(800);
    expect(WINDOW_HEIGHT).toBe(600);

    await opened.emit("closed");
    await expect(panel).resolves.toBe(true);
  });

  it("renders the document into the window", async () => {
    const opened = fakeWindow();
    const open = vi.fn<GlimpseOpenFn>(() => opened.win);

    const panel = openGlimpsePanel({
      actions: stubActions(),
      config: TEST_CONFIG,
      initialView: "pending",
      language: "zh",
      model: modelWithoutLanguage(),
      prefsPath: prefsPath(),
      resolveModule: async () => ({
        open,
      }),
    });

    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
    const [html] = open.mock.calls[0];
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('id="P1-1-L1"');

    await opened.emit("closed");
    await panel;
  });

  it("saves the theme the window reports", async () => {
    const opened = fakeWindow();
    const save = vi.fn();
    const panel = openGlimpsePanel({
      actions: stubActions({
        save,
      }),
      config: TEST_CONFIG,
      initialView: "pending",
      language: "zh",
      model: modelWithoutLanguage(),
      prefsPath: prefsPath(),
      resolveModule: async () => ({
        open: () => opened.win,
      }),
    });

    await opened.emit("message", {
      type: "theme",
      value: "light",
    });
    // The theme is a window preference, not configuration: it must not go
    // through `save`, which writes the config file.
    expect(save).not.toHaveBeenCalled();

    await opened.emit("closed");
    await panel;
  });

  it("persists the theme principle without re-rendering the window", async () => {
    const opened = fakeWindow();
    const save = vi.fn();
    const panel = openGlimpsePanel({
      actions: stubActions({
        save,
      }),
      config: TEST_CONFIG,
      initialView: "pending",
      language: "zh",
      model: modelWithoutLanguage(),
      prefsPath: prefsPath(),
      resolveModule: async () => ({
        open: () => opened.win,
      }),
    });

    const rendersBefore = opened.html.length;
    await opened.emit("message", {
      type: "principle",
      value: "atlas",
    });

    // The page already swapped the class; a re-render would only reset the
    // scroll position. The principle is a window preference like the theme, so
    // it must not reach `save` either.
    expect(opened.html.length).toBe(rendersBefore);
    expect(save).not.toHaveBeenCalled();
    expect(loadPanelPreferences(prefsPath())).toEqual({
      principle: "atlas",
      theme: "dark",
    });

    await opened.emit("closed");
    await panel;
  });

  it("persists a language change through the configuration", async () => {
    const opened = fakeWindow();
    const save = vi.fn();
    const panel = openGlimpsePanel({
      actions: stubActions({
        save,
      }),
      config: TEST_CONFIG,
      initialView: "settings",
      language: "zh",
      model: modelWithoutLanguage(),
      prefsPath: prefsPath(),
      resolveModule: async () => ({
        open: () => opened.win,
      }),
    });

    await opened.emit("message", {
      type: "language",
      value: "en",
      view: "settings",
    });

    expect(save).toHaveBeenCalledWith({
      language: "en",
    });
    // Re-rendered in place, so the window does not close on a language switch.
    expect(opened.html).toHaveLength(1);
    // The re-render lands on the view the user was on: the settings page is
    // the only section marked active, and it does not carry `hidden`.
    expect(opened.html[0]).toContain('data-page="settings" aria-label="settings">');
    expect(opened.html[0]).toContain('lang="en"');
    expect(opened.closed()).toBe(0);

    await opened.emit("closed");
    await panel;
  });

  it("types an edited setting through the config and moves the row with it", async () => {
    const opened = fakeWindow();
    const save = vi.fn();
    // Real rows, because the write is typed by the field's own configured
    // value: `recallPolicy` is a string and `paused` a boolean.
    const rows = settingsItems(TEST_CONFIG, {});
    const panel = openGlimpsePanel({
      actions: stubActions({
        save,
      }),
      config: TEST_CONFIG,
      initialView: "settings",
      language: "zh",
      prefsPath: prefsPath(),
      model: {
        ...modelWithoutLanguage(),
        rows,
      },
      resolveModule: async () => ({
        open: () => opened.win,
      }),
    });

    await opened.emit("message", {
      id: "paused",
      type: "setting",
      value: "on",
    });
    await opened.emit("message", {
      id: "recallPolicy",
      type: "setting",
      value: "assist",
    });

    expect(save).toHaveBeenNthCalledWith(1, {
      paused: true,
    });
    expect(save).toHaveBeenNthCalledWith(2, {
      recallPolicy: "assist",
    });
    // The row carries the value the next render draws, so a later re-render
    // cannot show the value the user just replaced.
    expect(rows.find((row) => row.id === "recallPolicy")?.currentValue).toBe("assist");

    await opened.emit("closed");
    await panel;
  });

  it("drops a setting this window does not own", async () => {
    const opened = fakeWindow();
    const save = vi.fn();
    const panel = openGlimpsePanel({
      actions: stubActions({
        save,
      }),
      config: TEST_CONFIG,
      initialView: "settings",
      language: "zh",
      model: modelWithoutLanguage(),
      prefsPath: prefsPath(),
      resolveModule: async () => ({
        open: () => opened.win,
      }),
    });

    // An id no row carries, and a blank value, which the terminal panel reads
    // as "leave it alone". Neither may reach the config file.
    await opened.emit("message", {
      id: "notAField",
      type: "setting",
      value: "on",
    });
    await opened.emit("message", {
      id: "recallPolicy",
      type: "setting",
      value: "",
    });

    expect(save).not.toHaveBeenCalled();

    await opened.emit("closed");
    await panel;
  });

  it("runs sleep through the confirmation rather than the configuration", async () => {
    const opened = fakeWindow();
    const save = vi.fn();
    const sleep = vi.fn(async () => undefined);
    const confirm = vi.fn(async () => true);
    const panel = openGlimpsePanel({
      actions: stubActions({
        confirm,
        save,
        sleep,
      }),
      config: TEST_CONFIG,
      initialView: "settings",
      language: "zh",
      model: modelWithoutLanguage(),
      prefsPath: prefsPath(),
      resolveModule: async () => ({
        open: () => opened.win,
      }),
    });

    await opened.emit("message", {
      id: "sleep",
      type: "setting",
      value: "run",
    });

    expect(confirm).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledOnce();
    // `sleep` is an action, not a key: it must never be persisted.
    expect(save).not.toHaveBeenCalled();

    await opened.emit("closed");
    await panel;
  });

  it("applies a review decision without re-prompting when a direct path exists", async () => {
    const opened = fakeWindow();
    const reviewDecision = vi.fn(
      async (_candidate: unknown, _decision: unknown) => undefined,
    );
    const reviewCandidate = vi.fn(async () => undefined);
    const panel = openGlimpsePanel({
      actions: stubActions({
        reviewCandidate,
        reviewDecision,
      }),
      config: TEST_CONFIG,
      initialView: "pending",
      language: "zh",
      model: modelWithoutLanguage(),
      prefsPath: prefsPath(),
      resolveModule: async () => ({
        open: () => opened.win,
      }),
    });

    await opened.emit("message", {
      decision: "reject",
      index: 1,
      type: "review",
    });
    await vi.waitFor(() => expect(reviewDecision).toHaveBeenCalledOnce());

    expect(reviewDecision.mock.calls[0][1]).toBe("reject");
    expect(reviewCandidate).not.toHaveBeenCalled();

    await opened.emit("closed");
    await panel;
  });

  it("falls back to the chooser when no direct path exists", async () => {
    const opened = fakeWindow();
    const reviewCandidate = vi.fn(async () => undefined);
    const panel = openGlimpsePanel({
      actions: stubActions({
        reviewCandidate,
      }),
      config: TEST_CONFIG,
      initialView: "pending",
      language: "zh",
      model: modelWithoutLanguage(),
      prefsPath: prefsPath(),
      resolveModule: async () => ({
        open: () => opened.win,
      }),
    });

    await opened.emit("message", {
      decision: "store",
      index: 0,
      type: "review",
    });
    await vi.waitFor(() => expect(reviewCandidate).toHaveBeenCalledOnce());

    await opened.emit("closed");
    await panel;
  });

  it("closes on the close message", async () => {
    const opened = fakeWindow();
    const panel = openGlimpsePanel({
      actions: stubActions(),
      config: TEST_CONFIG,
      initialView: "pending",
      language: "zh",
      model: modelWithoutLanguage(),
      prefsPath: prefsPath(),
      resolveModule: async () => ({
        open: () => opened.win,
      }),
    });

    await opened.emit("message", {
      type: "close",
    });
    expect(opened.closed()).toBe(1);

    await opened.emit("closed");
    await panel;
  });

  it("ignores a message that does not match the protocol", async () => {
    const opened = fakeWindow();
    const reviewDecision = vi.fn(async () => undefined);
    const save = vi.fn();
    const panel = openGlimpsePanel({
      actions: stubActions({
        reviewDecision,
        save,
      }),
      config: TEST_CONFIG,
      initialView: "pending",
      language: "zh",
      model: modelWithoutLanguage(),
      prefsPath: prefsPath(),
      resolveModule: async () => ({
        open: () => opened.win,
      }),
    });

    // The payload crosses a webview boundary, so a malformed message is dropped
    // rather than reaching an action.
    await opened.emit("message", {
      decision: "store",
      index: "a",
      type: "review",
    });
    await opened.emit("message", {
      decision: "store",
      index: -1,
      type: "review",
    });
    await opened.emit("message", {
      decision: "explode",
      index: 0,
      type: "review",
    });
    await opened.emit("message", {
      type: "theme",
      value: "chartreuse",
    });
    await opened.emit("message", {
      type: "language",
      value: "fr",
    });
    await opened.emit("message", "not an object");
    await opened.emit("message", null);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(reviewDecision).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();

    await opened.emit("closed");
    await panel;
  });
});

describe("glimpse unavailable (5.1 fallback)", () => {
  it("reports false when Glimpse is absent", async () => {
    await expect(
      openGlimpsePanel({
        actions: stubActions(),
        config: TEST_CONFIG,
        initialView: "pending",
        language: "zh",
        model: modelWithoutLanguage(),
        prefsPath: prefsPath(),
        resolveModule: async () => null,
      }),
    ).resolves.toBe(false);
  });

  it("reports false when the resolver throws", async () => {
    await expect(
      openGlimpsePanel({
        actions: stubActions(),
        config: TEST_CONFIG,
        initialView: "pending",
        language: "zh",
        model: modelWithoutLanguage(),
        prefsPath: prefsPath(),
        resolveModule: async () => {
          throw new Error("glimpseui exploded");
        },
      }),
    ).resolves.toBe(false);
  });
});

describe("glimpse failure falls back (5.4)", () => {
  it("reports false when opening throws, without rethrowing", async () => {
    await expect(
      openGlimpsePanel({
        actions: stubActions(),
        config: TEST_CONFIG,
        initialView: "pending",
        language: "zh",
        model: modelWithoutLanguage(),
        prefsPath: prefsPath(),
        resolveModule: async () => ({
          open: () => {
            throw new Error("native host refused");
          },
        }),
      }),
    ).resolves.toBe(false);
  });

  it("reports false when a message action throws", async () => {
    const opened = fakeWindow();
    const panel = openGlimpsePanel({
      actions: stubActions({
        reviewDecision: async () => {
          throw new Error("store failed");
        },
      }),
      config: TEST_CONFIG,
      initialView: "pending",
      language: "zh",
      model: modelWithoutLanguage(),
      prefsPath: prefsPath(),
      resolveModule: async () => ({
        open: () => opened.win,
      }),
    });

    // A failing action must not tear down the window's message loop.
    await opened.emit("message", {
      decision: "store",
      index: 0,
      type: "review",
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(opened.closed()).toBe(0);

    await opened.emit("closed");
    await expect(panel).resolves.toBe(true);
  });
});

describe("terminal panel remains complete (5.3)", () => {
  it("takes the fallback path and keeps every view and field", async () => {
    let factory: unknown;
    const custom = vi.fn(async (fn: unknown) => {
      factory = fn;
    });

    await openConsole(
      {
        ui: {
          custom,
        },
      } as never,
      statusFixture(),
      DEFAULT_XPI_MEMO_CONFIG as XpiMemoConfig,
      {},
      [],
      {
        actions: stubActions(),
        resolveModule: async () => null,
      },
    );

    // The window did not open, so the terminal panel must have.
    expect(custom).toHaveBeenCalledOnce();

    const panel = (
      factory as (...args: unknown[]) => ReturnType<typeof createConsoleComponent>
    )(
      {
        requestRender: () => undefined,
        terminal: {
          rows: 24,
        },
      },
      {
        bold: (text: string) => text,
        fg: (_color: string, text: string) => text,
      },
      getKeybindings(),
      () => undefined,
    );

    // All four views are named at once in the tab bar, so none is unreachable
    // on a machine without Glimpse.
    const chrome = panel.render(94).join("\n");
    for (const view of [
      "pending",
      "recent",
      "settings",
      "status",
    ]) {
      expect(chrome, view).toContain(panelText(`tab.${view}`, "en"));
    }

    // Both surfaces draw their settings rows from one source, and that source
    // carries every configured field. `views.test.ts` pins the window to render
    // one row per entry; this pins the entry count to the live config.
    const rows = settingsItems(DEFAULT_XPI_MEMO_CONFIG, {});
    expect(rows).toHaveLength(39);
    expect(rows).toHaveLength(settingsRowsFixture().length);
  });
});
