import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";

const WIDGET_KEY = "xpi-memo-surface";
const SPEED_CELLS_PER_SECOND = 30;
const HEAD_HALF_WIDTH = 0.6;
const TRAIL_LENGTH = 7;
const SUCCESS_MS = 1_500;

export type SurfaceAction = "recall" | "inject" | "store" | "compact";

function kittIntensity(time: number, index: number, length: number): number {
  const range = length - 1;
  if (range <= 0) return 1;
  const cycle = 2 * range;
  const sweep = ((time / 1000) * SPEED_CELLS_PER_SECOND) % cycle;
  const right = sweep < range;
  const head = right ? sweep : cycle - sweep;
  const delta = index - head;
  const distance = Math.abs(delta);
  if (distance <= HEAD_HALF_WIDTH) return 1;
  const behind = right ? -delta : delta;
  if (behind <= HEAD_HALF_WIDTH) return 0;
  const progress = (behind - HEAD_HALF_WIDTH) / TRAIL_LENGTH;
  if (progress >= 1) return 0;
  const remaining = 1 - progress;
  return remaining * remaining;
}

type SurfaceTheme = Pick<ExtensionContext["ui"]["theme"], "fg">;

export function shimmerText(text: string, time: number, theme: SurfaceTheme): string {
  const chars = Array.from(text);
  let output = "";
  for (let index = 0; index < chars.length; index++) {
    const intensity = kittIntensity(time, index, chars.length);
    let color: "accent" | "muted" | "dim" = "dim";
    if (intensity >= 0.65) color = "accent";
    else if (intensity >= 0.22) color = "muted";
    output += theme.fg(color, chars[index]);
  }
  return output;
}

function label(action: SurfaceAction): string {
  return {
    compact: "正在保留记忆",
    inject: "正在注入记忆",
    recall: "正在检索记忆",
    store: "正在保存记忆",
  }[action];
}

function createWidget(
  tui: TUI,
  theme: SurfaceTheme,
  action: SurfaceAction,
): Component & {
  dispose(): void;
} {
  let disposed = false;
  const timer = setInterval(() => tui.requestRender(), 1000 / 30);
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
    },
    invalidate() {},
    render() {
      return [
        shimmerText(`✦ ${label(action)}`, Date.now(), theme),
      ];
    },
  };
}

const successText = (action: SurfaceAction, count?: number): string => {
  if (action === "recall") return `✦ 已检索 ${count ?? 0} 条记忆`;
  if (action === "inject") return `✦ 已注入 ${count ?? 0} 条记忆`;
  if (action === "compact") return "✦ 已保留记忆上下文";
  return "✦ 已保存记忆";
};

export function createMemorySurface(ctx: ExtensionContext) {
  let clearTimer: ReturnType<typeof setTimeout> | undefined;

  function clear(): void {
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = undefined;
    if (ctx.mode !== "tui") return;
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  }

  function begin(action: SurfaceAction): void {
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = undefined;
    if (ctx.mode !== "tui") return;
    ctx.ui.setWidget(WIDGET_KEY, (tui, theme) => createWidget(tui, theme, action));
  }

  function complete(action: SurfaceAction, count?: number): void {
    if (ctx.mode !== "tui") return;
    ctx.ui.setWidget(WIDGET_KEY, [
      successText(action, count),
    ]);
    clearTimer = setTimeout(clear, SUCCESS_MS);
  }

  function fail(message = "记忆操作失败，继续当前任务"): void {
    if (ctx.mode !== "tui") return;
    ctx.ui.setWidget(WIDGET_KEY, [
      `! ${message}`,
    ]);
    clearTimer = setTimeout(clear, SUCCESS_MS);
  }

  return {
    begin,
    complete,
    fail,
    clear,
  };
}
