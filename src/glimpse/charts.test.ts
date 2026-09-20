import { describe, expect, it } from "vitest";
import {
  dailyBuckets,
  litSegments,
  METER_SEGMENTS,
  peak,
  SPARK_HEIGHT,
  SPARK_MIN_HEIGHT,
  sparkHeights,
  TREND_DAYS,
  todayShare,
} from "./charts.js";

/** Noon, so "today" is unambiguous and the window's edges are testable. */
const NOON = Date.parse("2026-09-20T12:00:00.000Z");

/**
 * A timestamp at `hours` local time, `daysAgo` local days before today.
 *
 * Built from local calendar fields on purpose: `dailyBuckets` splits on local
 * midnight, so a test written with UTC strings would pass in UTC and fail
 * everywhere else.
 */
function localTime(daysAgo: number, hours: number, minutes = 0): string {
  const at = new Date(NOON);
  at.setHours(hours, minutes, 0, 0);
  at.setDate(at.getDate() - daysAgo);
  return at.toISOString();
}

describe("dailyBuckets", () => {
  it("returns a fixed-width window even with no entries", () => {
    const buckets = dailyBuckets([], NOON);

    expect(buckets).toHaveLength(TREND_DAYS);
    expect(buckets).toEqual([
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
  });

  it("keeps the bucket count stable regardless of entry count", () => {
    // The bar count must not depend on the data, or the chart jumps width.
    expect(dailyBuckets([], NOON)).toHaveLength(TREND_DAYS);
    expect(
      dailyBuckets(
        [
          "2026-09-20T01:00:00.000Z",
        ],
        NOON,
      ),
    ).toHaveLength(TREND_DAYS);
    expect(
      dailyBuckets(
        Array.from(
          {
            length: 40,
          },
          () => "2026-09-20T01:00:00.000Z",
        ),
        NOON,
      ),
    ).toHaveLength(TREND_DAYS);
  });

  it("puts today's entries in the last bucket", () => {
    const buckets = dailyBuckets(
      [
        localTime(0, 0, 1),
        localTime(0, 23, 59),
      ],
      NOON,
    );

    expect(buckets[TREND_DAYS - 1]).toBe(2);
  });

  it("separates days on local midnight, not on a rolling 24 hours", () => {
    // 23:30 yesterday and 00:30 today are 60 minutes apart but belong to
    // different buckets; a rolling window would put them together.
    const buckets = dailyBuckets(
      [
        localTime(1, 23, 30),
        localTime(0, 0, 30),
      ],
      NOON,
    );

    expect(buckets[TREND_DAYS - 2]).toBe(1);
    expect(buckets[TREND_DAYS - 1]).toBe(1);
  });

  it("ignores entries older than the window instead of clamping them", () => {
    // A month-old entry is not "seven days ago".
    const buckets = dailyBuckets(
      [
        localTime(30, 12),
      ],
      NOON,
    );

    expect(buckets).toEqual([
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
  });

  it("ignores a future timestamp instead of inflating today", () => {
    const buckets = dailyBuckets(
      [
        localTime(-3, 12),
      ],
      NOON,
    );

    expect(buckets).toEqual([
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
  });

  it("skips an unparseable timestamp without dropping the rest", () => {
    const buckets = dailyBuckets(
      [
        "not-a-date",
        localTime(0, 6),
      ],
      NOON,
    );

    expect(buckets[TREND_DAYS - 1]).toBe(1);
  });
});

describe("occupancy", () => {
  it("reports zero when nothing happened", () => {
    const buckets = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];

    expect(peak(buckets)).toBe(0);
    expect(todayShare(buckets)).toBe(0);
    expect(litSegments(buckets)).toBe(0);
  });

  it("reports 100% when today is the busiest day", () => {
    const buckets = [
      1,
      2,
      3,
      5,
      7,
      6,
      7,
    ];

    expect(todayShare(buckets)).toBe(100);
    expect(litSegments(buckets)).toBe(METER_SEGMENTS);
  });

  it("normalises against the busiest day in the window, not a fixed budget", () => {
    // Half of the busiest day is half the bar, whatever the absolute numbers.
    expect(
      todayShare([
        0,
        0,
        0,
        0,
        0,
        0,
        5,
      ]),
    ).toBe(100);
    expect(
      todayShare([
        10,
        0,
        0,
        0,
        0,
        0,
        5,
      ]),
    ).toBe(50);
  });

  it("stays inside 0..100 and 0..segments", () => {
    const buckets = [
      1,
      1,
      1,
      1,
      1,
      1,
      1,
    ];

    const share = todayShare(buckets);
    const lit = litSegments(buckets);
    expect(share).toBeGreaterThanOrEqual(0);
    expect(share).toBeLessThanOrEqual(100);
    expect(lit).toBeGreaterThanOrEqual(0);
    expect(lit).toBeLessThanOrEqual(METER_SEGMENTS);
  });
});

describe("sparkHeights", () => {
  it("gives every bar a baseline when nothing happened", () => {
    const heights = sparkHeights([
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);

    expect(heights).toHaveLength(TREND_DAYS);
    expect(heights.every((height) => height === SPARK_MIN_HEIGHT)).toBe(true);
  });

  it("fills the box for the busiest day", () => {
    expect(
      sparkHeights([
        0,
        0,
        0,
        0,
        0,
        0,
        9,
      ]).at(-1),
    ).toBe(SPARK_HEIGHT);
  });

  it("never renders a zero-height bar", () => {
    // A zero-height bar disappears, and a missing bar reads as missing data.
    const heights = sparkHeights([
      12,
      0,
      0,
      0,
      0,
      0,
      1,
    ]);

    expect(heights.every((height) => height >= SPARK_MIN_HEIGHT)).toBe(true);
  });

  it("keeps a quiet day visibly shorter than a busy one", () => {
    const heights = sparkHeights([
      20,
      1,
      0,
      0,
      0,
      0,
      0,
    ]);

    expect(heights[1]).toBeLessThan(heights[0]);
  });
});
