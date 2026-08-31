import { describe, expect, it, vi } from "vitest";

import { createMemorySurface, shimmerText } from "./surface.js";

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
});
