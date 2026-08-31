import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deriveContext,
  FOLDING_SUMMARY_MAX_CHARS,
  foldSummary,
} from "./context-derivation.js";
import { createEventLogWriter } from "./event-log-writer.js";
import type { L0Event } from "./types.js";

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir)
      rmSync(dir, {
        force: true,
        recursive: true,
      });
  }
});

function event(
  position: number,
  type: L0Event["type"],
  payload: Record<string, unknown> = {},
): L0Event {
  return {
    payload,
    position,
    timestamp: "2024-01-01T00:00:00.000Z",
    type,
    version: 1,
  };
}

describe("deriveContext (Task 6.1 determinism)", () => {
  it("same log + policy + budget produces identical derived context", () => {
    const events = [
      1,
      2,
      3,
      4,
      5,
    ].map((position) =>
      event(position, "user_message", {
        content: `m${position}`,
      }),
    );
    const first = deriveContext(
      events,
      {
        allowedTypes: [
          "user_message",
        ],
      },
      3,
    );
    const second = deriveContext(
      events,
      {
        allowedTypes: [
          "user_message",
        ],
      },
      3,
    );
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("is deterministic across shuffled input (order normalized by position)", () => {
    const events = [
      3,
      1,
      5,
      2,
      4,
    ].map((position) => event(position, "user_message", {}));
    const shuffled = [
      ...events,
    ].reverse();
    const a = deriveContext(
      events,
      {
        allowedTypes: [
          "user_message",
        ],
      },
      2,
    );
    const b = deriveContext(
      shuffled,
      {
        allowedTypes: [
          "user_message",
        ],
      },
      2,
    );
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("deriveContext (Task 6.2 policy filtering)", () => {
  it("omits excluded event types but log still contains them", () => {
    const events = [
      event(1, "user_message"),
      event(2, "tool_result", {
        output: "secret-details",
      }),
      event(3, "user_message"),
    ];
    const derived = deriveContext(events, {
      allowedTypes: [
        "user_message",
      ],
    });
    expect(derived.entries).toHaveLength(2);
    expect(
      derived.entries.every(
        (entry) => entry.kind === "event" && entry.event.type === "user_message",
      ),
    ).toBe(true);
    // raw log untouched conceptually: input array unchanged
    expect(events).toHaveLength(3);
  });
});

describe("deriveContext (Task 6.3 budget folding)", () => {
  it("folds older events into a marker and shows recent events in full", () => {
    const events = Array.from(
      {
        length: 10,
      },
      (_, index) =>
        event(index + 1, "user_message", {
          content: `m${index + 1}`,
        }),
    );
    const derived = deriveContext(
      events,
      {
        allowedTypes: [
          "user_message",
        ],
      },
      4,
    );
    expect(derived.foldedPositions).toBe(6);
    expect(derived.shownEvents).toBe(4);

    const marker = derived.entries[0];
    expect(marker?.kind).toBe("folding_marker");
    if (marker?.kind === "folding_marker") {
      expect(marker.foldedStart).toBe(1);
      expect(marker.foldedEnd).toBe(6);
      expect(marker.eventCount).toBe(6);
    }
    // remaining entries are events 7..10 in order
    const shown = derived.entries.filter((entry) => entry.kind === "event");
    expect(
      shown.map((entry) => (entry.kind === "event" ? entry.event.position : 0)),
    ).toEqual([
      7,
      8,
      9,
      10,
    ]);
  });

  it("does not fold when under budget", () => {
    const events = [
      event(1, "user_message"),
      event(2, "user_message"),
    ];
    const derived = deriveContext(
      events,
      {
        allowedTypes: [
          "user_message",
        ],
      },
      10,
    );
    expect(derived.foldedPositions).toBe(0);
    expect(derived.entries).toHaveLength(2);
  });
});

describe("foldSummary (Task 6.4 marker content)", () => {
  it("references type breakdown and stays bounded", () => {
    const events = [
      event(1, "user_message"),
      event(2, "user_message"),
      event(3, "tool_call"),
    ];
    const summary = foldSummary(events);
    expect(summary).toContain("3 earlier events");
    expect(summary).toContain("user_message:2");
    expect(summary).toContain("tool_call:1");
    expect(summary.length).toBeLessThanOrEqual(FOLDING_SUMMARY_MAX_CHARS);
  });

  it("round-trips through a real writer log deterministically", async () => {
    const { createEventLogReader } = await import("./event-log-reader.js");
    const dataDir = mkdtempSync(join(tmpdir(), "xpi-l0-derive-"));
    tempDirs.push(dataDir);
    const writer = createEventLogWriter({
      sessionDir: dataDir,
    });
    for (let index = 1; index <= 8; index += 1) {
      writer.append(index % 2 === 0 ? "tool_call" : "user_message", {
        index,
      });
    }
    const reader = createEventLogReader({
      sessionDir: dataDir,
    });
    const events = await reader.readAll();
    const derived = deriveContext(
      events,
      {
        allowedTypes: [
          "user_message",
          "tool_call",
        ],
      },
      3,
    );
    expect(derived.shownEvents).toBe(3);
    expect(derived.foldedPositions).toBe(5);
    const again = deriveContext(
      events,
      {
        allowedTypes: [
          "user_message",
          "tool_call",
        ],
      },
      3,
    );
    expect(JSON.stringify(derived)).toBe(JSON.stringify(again));
  });
});
