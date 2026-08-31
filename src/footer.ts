import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export const FOOTER_ACTIVE = "● memo on";
export const FOOTER_PULSE = "✦ memo on";
export const FOOTER_PAUSED = "○ memo off";

const timers = new WeakMap<object, ReturnType<typeof setTimeout>>();

export function footerText(paused: boolean, pulse = false): string {
  if (paused) return FOOTER_PAUSED;
  return pulse ? FOOTER_PULSE : FOOTER_ACTIVE;
}

export function setFooterStatus(
  ctx: ExtensionContext,
  paused: boolean,
  pulse = false,
): void {
  const previous = timers.get(ctx);
  if (previous) clearTimeout(previous);
  ctx.ui.setStatus("xpi-memo", footerText(paused, pulse));
  if (!pulse || paused) return;
  timers.set(
    ctx,
    setTimeout(() => {
      ctx.ui.setStatus("xpi-memo", footerText(false));
      timers.delete(ctx);
    }, 1_000),
  );
}

export function clearFooterStatus(ctx: ExtensionContext): void {
  const timer = timers.get(ctx);
  if (timer) clearTimeout(timer);
  timers.delete(ctx);
  ctx.ui.setStatus("xpi-memo", undefined);
}
