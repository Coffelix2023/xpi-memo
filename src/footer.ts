import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type MemoryEvent, shortOperationId } from "./event-stream.js";
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

/**
 * Bounded, throttled one-line event status (task 2.1): phase, scope, count
 * and a short operation identifier. Reverts to the base line after a short
 * hold; never blocks the session.
 */
const EVENT_HOLD_MS = 1_500;

export function footerEventText(event: MemoryEvent): string {
  const scope = event.scope ? ` ${event.scope}` : "";
  const count = event.resultCount ?? event.injectedCount;
  const countText = count ? ` ×${count}` : "";
  return `${footerText(false)} · ${event.kind}${countText}${scope} ${shortOperationId(event)}`;
}

export function setFooterEventStatus(
  ctx: ExtensionContext,
  paused: boolean,
  event: MemoryEvent,
): void {
  if (paused) return;
  const previous = timers.get(ctx);
  if (previous) clearTimeout(previous);
  ctx.ui.setStatus("xpi-memo", footerEventText(event));
  timers.set(
    ctx,
    setTimeout(() => {
      ctx.ui.setStatus("xpi-memo", footerText(false));
      timers.delete(ctx);
    }, EVENT_HOLD_MS),
  );
}
