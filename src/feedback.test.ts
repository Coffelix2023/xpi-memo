import { describe, expect, it } from "vitest";
import {
  applyFeedbackToRecall,
  canRecordPassiveFeedback,
  feedbackAdjustment,
  summarizeFeedback,
} from "./feedback.js";
import type { RecallItem } from "./recall.js";

const item: RecallItem = {
  bank: "default",
  content: "Reply in Chinese",
  id: "old-memory",
  kind: "global_preference",
  scope: "global",
  score: 1,
  provenance: {
    bank: "default",
    layer: "T1",
    source: "mnemosyne",
  },
};

describe("governed memory feedback", () => {
  it("counts explicit feedback and supersession without memory bodies", () => {
    const summary = summarizeFeedback([
      {
        action: "feedback",
        metadata: {
          feedback: "helpful",
          feedbackMode: "explicit",
          targetMemoryId: "old-memory",
        },
      },
      {
        action: "feedback",
        metadata: {
          feedback: "correction",
          feedbackMode: "explicit",
          replacementMemoryId: "new-memory",
          supersedes: "old-memory",
          targetMemoryId: "old-memory",
        },
      },
    ]);

    expect(summary).toEqual({
      conflicts: 0,
      explicit: 2,
      helpful: 1,
      irrelevant: 0,
      passive: 0,
      supersessions: 1,
      wrong: 0,
    });
    expect(JSON.stringify(summary)).not.toContain("Reply in Chinese");
  });

  it("rate-limits passive usage feedback per memory", () => {
    const now = new Date("2026-09-02T10:00:30.000Z");
    const entries = [
      {
        action: "feedback",
        timestamp: "2026-09-02T10:00:00.000Z",
        metadata: {
          feedback: "used",
          feedbackMode: "passive",
          targetMemoryId: "old-memory",
        },
      },
    ];

    expect(canRecordPassiveFeedback(entries, "old-memory", now)).toBe(false);
    expect(
      canRecordPassiveFeedback(
        entries,
        "old-memory",
        new Date("2026-09-02T10:01:00.000Z"),
      ),
    ).toBe(true);
  });

  it("keeps passive feedback weaker than explicit correction", () => {
    const adjustment = feedbackAdjustment("old-memory", [
      {
        action: "feedback",
        metadata: {
          feedback: "used",
          feedbackMode: "passive",
          targetMemoryId: "old-memory",
        },
      },
      {
        action: "feedback",
        metadata: {
          feedback: "wrong",
          feedbackMode: "explicit",
          targetMemoryId: "old-memory",
        },
      },
    ]);
    expect(adjustment).toBeLessThan(0);
    expect(adjustment).toBeGreaterThan(-0.5);
  });

  it("marks corrected rows superseded and never mutates recall rows", () => {
    const entries = [
      {
        action: "feedback",
        metadata: {
          feedback: "correction",
          feedbackMode: "explicit",
          replacementMemoryId: "new-memory",
          supersedes: "old-memory",
          targetMemoryId: "old-memory",
        },
      },
    ];
    const before = JSON.stringify(item);
    const result = applyFeedbackToRecall(
      [
        item,
      ],
      entries,
    );

    expect(result[0]).toMatchObject({
      id: "old-memory",
      score: 0.5,
      supersededBy: "new-memory",
    });
    expect(JSON.stringify(item)).toBe(before);
  });
});
