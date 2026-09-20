import type { PanelLanguage } from "../panel-text.js";

/**
 * Time formatting for the window's two time columns.
 *
 * The window shows relative ages on the pending list ("2 小时前" / "2 days ago")
 * and clock times on the recent table ("14:22"). Both come from ISO timestamps
 * already present on the status data — nothing new is stored.
 *
 * An unparseable timestamp yields the raw string rather than "Invalid Date", so
 * a bad record stays visible instead of silently rendering as noise.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** The BCP 47 tag for a panel language. */
export function localeFor(language: PanelLanguage): string {
  return language === "zh" ? "zh-CN" : "en";
}

// `Intl.RelativeTimeFormat` construction is not free and the window rebuilds
// every row on each render, so one formatter per locale is kept.
const RELATIVE_FORMATTERS = new Map<string, Intl.RelativeTimeFormat>();

function relativeFormatter(locale: string): Intl.RelativeTimeFormat {
  const cached = RELATIVE_FORMATTERS.get(locale);
  if (cached) return cached;

  const created = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
  });
  RELATIVE_FORMATTERS.set(locale, created);
  return created;
}

/**
 * Coarse relative age, in the largest unit that still reads naturally.
 *
 * Uses `Intl.RelativeTimeFormat` rather than a hand-rolled string: it is
 * standard library, it gets plurals right in English, and it already knows both
 * of the window's locales.
 */
export function relativeAge(timestamp: string, now: number, locale: string): string {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return timestamp;

  const format = relativeFormatter(locale);
  const elapsed = now - parsed;
  // A future timestamp is clock skew, not a negative age.
  if (elapsed < MINUTE_MS) return format.format(0, "second");
  if (elapsed < HOUR_MS)
    return format.format(-Math.floor(elapsed / MINUTE_MS), "minute");
  if (elapsed < DAY_MS) return format.format(-Math.floor(elapsed / HOUR_MS), "hour");
  return format.format(-Math.floor(elapsed / DAY_MS), "day");
}

/** `HH:MM` in the host's local zone, or the raw string when unparseable. */
export function clockTime(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return timestamp;

  const at = new Date(parsed);
  const hours = String(at.getHours()).padStart(2, "0");
  const minutes = String(at.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Start-of-day boundaries for the last `count` days, oldest first.
 *
 * Returned as timestamps so `dailyBuckets` can compare numerically instead of
 * re-parsing a date string per entry.
 */
export function dayBoundaries(now: number, count: number): number[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const boundaries: number[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    boundaries.push(startOfToday.getTime() - offset * DAY_MS);
  }
  return boundaries;
}
