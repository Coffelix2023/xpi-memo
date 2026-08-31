import { describe, expect, it } from "vitest";

import {
  decideRecall,
  detectHighValueRecallTrigger,
  type RecallPolicy,
} from "./recall-policy.js";

const policies: readonly RecallPolicy[] = [
  "active",
  "assist",
  "high-value-auto",
];

describe("T1 recall policies", () => {
  it("allows one bounded automatic recall in active mode", () => {
    expect(decideRecall("active", "Explain the current task")).toEqual({
      automatic: true,
      maxAutomaticRecalls: 1,
      reason: "active-policy",
      shouldRecall: true,
      trigger: null,
    });
  });

  it("requires an explicit caller action in assist mode", () => {
    expect(decideRecall("assist", "Continue the implementation")).toEqual({
      automatic: false,
      maxAutomaticRecalls: 0,
      reason: "assist-policy",
      shouldRecall: false,
      trigger: null,
    });
  });

  it("allows one bounded recall for Chinese and English continuity prompts", () => {
    const prompts = [
      "继续上次的实现",
      "上次做到哪了？",
      "我们之前决定了什么？",
      "Resume where we left off",
      "What did we decide before?",
      "Please restore the previous session context",
    ];

    for (const prompt of prompts) {
      const trigger = detectHighValueRecallTrigger(prompt);
      expect(trigger).not.toBeNull();
      expect(decideRecall("high-value-auto", prompt)).toMatchObject({
        automatic: true,
        maxAutomaticRecalls: 1,
        reason: "high-value-trigger",
        shouldRecall: true,
      });
    }
  });

  it("does not classify ordinary prompts as high-value recall", () => {
    for (const prompt of [
      "Implement the parser",
      "Fix the failing test",
      "What is TypeScript?",
      "请实现这个函数",
      "运行测试",
    ]) {
      expect(detectHighValueRecallTrigger(prompt)).toBeNull();
      expect(decideRecall("high-value-auto", prompt)).toEqual({
        automatic: false,
        maxAutomaticRecalls: 0,
        reason: "ordinary-prompt",
        shouldRecall: false,
        trigger: null,
      });
    }
  });

  it("supports only the three fixed policy names", () => {
    expect(policies).toEqual([
      "active",
      "assist",
      "high-value-auto",
    ]);
  });
});
