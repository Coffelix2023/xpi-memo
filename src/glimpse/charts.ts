import { dayBoundaries } from "./format.js";

/**
 * The status view's two charts, derived from data the status already carries.
 *
 * Both are computed from `recentEntries[].timestamp` rather than a new
 * aggregate field: adding one would change `MemoryStatus` and the
 * `/xpi-memo-status` JSON contract, and the entry list is already in hand.
 *
 * The window is always `TREND_DAYS` wide, so the bar count never depends on how
 * many entries exist — an empty bank renders seven empty bars, not zero bars.
 */
export const TREND_DAYS = 7;

/** Segments in the occupancy bar. Twenty reads as a proportion at a glance. */
export const METER_SEGMENTS = 20;

/** Bar heights are normalised to this many pixels. */
export const SPARK_HEIGHT = 20;

/** A bar never disappears entirely: a zero day still shows a baseline tick. */
export const SPARK_MIN_HEIGHT = 2;

const DAY_MS = 86_400_000;

/**
 * Entry counts per day over the trailing `days`-day window, oldest first.
 *
 * Timestamps outside the window are ignored rather than clamped into the edge
 * buckets: an entry from last month is not "seven days ago".
 */
export function dailyBuckets(
  timestamps: readonly string[],
  now: number,
  days: number = TREND_DAYS,
): number[] {
  const boundaries = dayBoundaries(now, days);
  const end = boundaries[days - 1] + DAY_MS;
  const buckets = new Array<number>(days).fill(0);

  for (const timestamp of timestamps) {
    const at = Date.parse(timestamp);
    if (Number.isNaN(at) || at < boundaries[0] || at >= end) continue;

    const index = boundaries.findLastIndex((boundary) => at >= boundary);
    if (index >= 0) buckets[index] += 1;
  }

  return buckets;
}

/** The busiest day in the window; `0` when nothing happened. */
export function peak(buckets: readonly number[]): number {
  return buckets.reduce((highest, value) => (value > highest ? value : highest), 0);
}

/** Today's share of the busiest day, as a whole percent in `0..100`. */
export function todayShare(buckets: readonly number[]): number {
  const busiest = peak(buckets);
  if (busiest <= 0) return 0;

  const today = buckets[buckets.length - 1] ?? 0;
  return Math.round((today / busiest) * 100);
}

/** How many of the meter's segments are lit, in `0..METER_SEGMENTS`. */
export function litSegments(
  buckets: readonly number[],
  segments: number = METER_SEGMENTS,
): number {
  const busiest = peak(buckets);
  if (busiest <= 0) return 0;

  const today = buckets[buckets.length - 1] ?? 0;
  return Math.round((today / busiest) * segments);
}

/** Bar heights in pixels, normalised so the busiest day fills the box. */
export function sparkHeights(buckets: readonly number[]): number[] {
  const busiest = peak(buckets);
  if (busiest <= 0) return buckets.map(() => SPARK_MIN_HEIGHT);

  return buckets.map((value) =>
    Math.max(SPARK_MIN_HEIGHT, Math.round((value / busiest) * SPARK_HEIGHT)),
  );
}
