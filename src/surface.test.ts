import { describe, expect, it, vi } from "vitest";

import {
  createMemorySurface,
  EXTRACTION_STAGES,
  extractionProgressText,
  shimmerText,
} from "./surface.js";

describe("memory surface", () => {
  it("renders KITT text with themed tiers", () => {
    const colors: string[] = [];
    const rendered = shimmerText("memory", 0, {
      fg(color, value) {
        colors.push(color);
        return `<${color}>${value}`;
      },
    });
    expect(rendered).toContain("<accent>");
    expect(colors).toHaveLength(6);
  });

  it("shows and clears an operation widget", () => {
    vi.useFakeTimers();
    const setWidget = vi.fn();
    const ctx = {
      mode: "tui",
      ui: {
        setWidget,
      },
    } as never;
    const surface = createMemorySurface(ctx);

    surface.begin("recall");
    expect(setWidget).toHaveBeenCalledWith("xpi-memo-surface", expect.any(Function));
    surface.complete("recall", 2);
    expect(setWidget).toHaveBeenLastCalledWith("xpi-memo-surface", [
      "✦ 已检索 2 条记忆",
    ]);
    vi.advanceTimersByTime(1_500);
    expect(setWidget).toHaveBeenLastCalledWith("xpi-memo-surface", undefined);
    vi.useRealTimers();
  });

  it("swallows writes to a stale ctx instead of crashing the process", () => {
    vi.useFakeTimers();
    let stale = false;
    const setWidget = vi.fn();
    const ctx = {
      get mode(): string {
        if (stale)
          throw new Error(
            "This extension ctx is stale after session replacement or reload.",
          );
        return "tui";
      },
      ui: {
        setWidget,
      },
    } as unknown as Parameters<typeof createMemorySurface>[0];
    const surface = createMemorySurface(ctx);

    surface.begin("recall");
    surface.complete("recall", 2);
    expect(setWidget).toHaveBeenCalled();

    // A session replacement mid-recall makes every later write — including the
    // deferred success clear — land on a ctx that throws on property read.
    stale = true;
    expect(() => {
      surface.begin("recall");
      surface.complete("recall", 2);
      surface.fail();
      surface.clear();
      vi.advanceTimersByTime(2_000);
    }).not.toThrow();
    vi.useRealTimers();
  });

  it("names each extraction stage with its share done", () => {
    // Four stages, in order, each carrying its own percentage: the user sees
    // where a slow compact is, not just that something is happening.
    expect(EXTRACTION_STAGES.map(extractionProgressText)).toEqual([
      "读取 L0 会话轨迹 25% (1/4)",
      "调用提取模型 50% (2/4)",
      "解析候选提案 75% (3/4)",
      "治理写入 T1 100% (4/4)",
    ]);
  });

  it("renders the stage text inside the live widget", () => {
    vi.useFakeTimers();
    const widgets: unknown[] = [];
    const ctx = {
      mode: "tui",
      ui: {
        setWidget: (_key: string, content: unknown) => {
          widgets.push(content);
        },
      },
    } as never;
    const surface = createMemorySurface(ctx);
    surface.begin("extract");
    surface.progress(extractionProgressText("model"));
    const build = widgets.at(-1) as (
      tui: unknown,
      theme: unknown,
    ) => {
      dispose(): void;
      render(): string[];
    };
    const component = build(
      {
        requestRender: () => undefined,
      },
      {
        fg: (_color: string, value: string) => value,
      },
    );
    expect(component.render()[0]).toContain("调用提取模型 50% (2/4)");
    expect(component.render()[0]).toContain("正在提取记忆候选...");
    component.dispose();
    // A fresh begin drops the previous run's progress.
    surface.begin("extract");
    const rebuilt = (widgets.at(-1) as typeof build)(
      {
        requestRender: () => undefined,
      },
      {
        fg: (_color: string, value: string) => value,
      },
    );
    expect(rebuilt.render()[0]).not.toContain("%");
    rebuilt.dispose();
    vi.useRealTimers();
  });
});
