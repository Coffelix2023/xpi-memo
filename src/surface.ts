import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";

const WIDGET_KEY = "xpi-memo-surface";
const SPEED_CELLS_PER_SECOND = 30;
const HEAD_HALF_WIDTH = 0.6;
const TRAIL_LENGTH = 7;
const SUCCESS_MS = 1_500;

export type SurfaceAction = "recall" | "inject" | "store" | "compact" | "extract";

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
    extract: "正在提取记忆候选...",
    inject: "正在注入记忆",
    recall: "正在检索记忆",
    store: "正在保存记忆",
  }[action];
}

function createWidget(
  tui: TUI,
  theme: SurfaceTheme,
  action: SurfaceAction,
  /** Read at render time so `progress` needs no widget rebuild. */
  progressText: () => string | undefined,
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
      const line = shimmerText(`✦ ${label(action)}`, Date.now(), theme);
      const progress = progressText();
      // One row either way: the progress replaces nothing, it appends.
      return [
        progress ? `${line} · ${progress}` : line,
      ];
    },
  };
}

/** Shared injection/recall status line: same text for TUI widget and injected block. */
export const NO_RELEVANT_MEMORY = "无相关记忆";

export const successText = (action: SurfaceAction, count?: number): string => {
  if (action !== "compact" && action !== "store" && (count ?? 0) === 0)
    return `✦ ${NO_RELEVANT_MEMORY}`;
  if (action === "recall") return `✦ 已检索 ${count ?? 0} 条记忆`;
  if (action === "inject") return `✦ 已注入 ${count ?? 0} 条记忆`;
  if (action === "compact") return "✦ 已保留记忆上下文";
  if (action === "extract") return "✦ 已提取记忆候选";
  return "✦ 已保存记忆";
};

/**
 * The four stages of a compact-time extraction, in order. Compact is the only
 * surface a user can watch: shutdown is fire-and-forget and carries no widget,
 * so this is where the progress belongs.
 */
export const EXTRACTION_STAGES = [
  "read",
  "model",
  "parse",
  "govern",
] as const;
export type ExtractionStage = (typeof EXTRACTION_STAGES)[number];

const STAGE_TEXT: Record<ExtractionStage, string> = {
  govern: "治理写入 T1",
  model: "调用提取模型",
  parse: "解析候选提案",
  read: "读取 L0 会话轨迹",
};

/** `读取 L0 会话轨迹 25% (1/4)` — stage, share done, and position. */
export function extractionProgressText(stage: ExtractionStage): string {
  const index = EXTRACTION_STAGES.indexOf(stage) + 1;
  const percent = Math.round((index / EXTRACTION_STAGES.length) * 100);
  return `${STAGE_TEXT[stage]} ${percent}% (${index}/${EXTRACTION_STAGES.length})`;
}
export function createMemorySurface(ctx: ExtensionContext) {
  let clearTimer: ReturnType<typeof setTimeout> | undefined;
  /** Set by `progress`, read by the live widget on the next frame. */
  let progressText: string | undefined;

  function clear(): void {
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = undefined;
    if (ctx.mode !== "tui") return;
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  }

  function begin(action: SurfaceAction): void {
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = undefined;
    progressText = undefined;
    if (ctx.mode !== "tui") return;
    ctx.ui.setWidget(WIDGET_KEY, (tui, theme) =>
      createWidget(tui, theme, action, () => progressText),
    );
  }

  /**
   * Stage text for an action already begun. The widget timer re-renders at
   * 30Hz, so this only has to write the value down.
   */
  function progress(text: string): void {
    progressText = text;
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
    clear,
    complete,
    fail,
    progress,
  };
}
