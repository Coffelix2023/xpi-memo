export const RECALL_POLICIES = [
  "active",
  "assist",
  "high-value-auto",
] as const;

export type RecallPolicy = (typeof RECALL_POLICIES)[number];

export type RecallTrigger =
  | "continuity-zh"
  | "history-zh"
  | "decision-zh"
  | "continuity-en"
  | "history-en"
  | "restore-en";

export interface RecallDecision {
  automatic: boolean;
  maxAutomaticRecalls: 0 | 1;
  reason:
    | "active-policy"
    | "assist-policy"
    | "high-value-trigger"
    | "ordinary-prompt"
    | "paused";
  shouldRecall: boolean;
  trigger: RecallTrigger | null;
}

interface TriggerDefinition {
  id: RecallTrigger;
  phrases: readonly string[];
}

const HIGH_VALUE_TRIGGERS: readonly TriggerDefinition[] = [
  {
    id: "continuity-zh",
    phrases: [
      "继续上次",
      "恢复上次",
      "接着上次",
    ],
  },
  {
    id: "history-zh",
    phrases: [
      "上次做到哪",
      "之前发生了什么",
      "之前做了什么",
    ],
  },
  {
    id: "decision-zh",
    phrases: [
      "之前决定",
      "我们决定了什么",
      "之前的决策",
    ],
  },
  {
    id: "continuity-en",
    phrases: [
      "resume where we left off",
      "continue from the last session",
      "continue from last time",
    ],
  },
  {
    id: "history-en",
    phrases: [
      "what did we decide before",
      "what happened in the previous session",
    ],
  },
  {
    id: "restore-en",
    phrases: [
      "restore the previous session context",
      "restore where we left off",
    ],
  },
];

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function detectHighValueRecallTrigger(prompt: string): RecallTrigger | null {
  const normalized = normalizePrompt(prompt);
  for (const trigger of HIGH_VALUE_TRIGGERS) {
    if (trigger.phrases.some((phrase) => normalized.includes(phrase)))
      return trigger.id;
  }
  return null;
}

export function decideRecall(
  policy: RecallPolicy,
  prompt: string,
  paused = false,
): RecallDecision {
  if (paused) {
    return {
      automatic: false,
      maxAutomaticRecalls: 0,
      reason: "paused",
      shouldRecall: false,
      trigger: null,
    };
  }
  if (policy === "active") {
    return {
      automatic: true,
      maxAutomaticRecalls: 1,
      reason: "active-policy",
      shouldRecall: true,
      trigger: null,
    };
  }

  if (policy === "assist") {
    return {
      automatic: false,
      maxAutomaticRecalls: 0,
      reason: "assist-policy",
      shouldRecall: false,
      trigger: null,
    };
  }

  const trigger = detectHighValueRecallTrigger(prompt);
  if (trigger) {
    return {
      automatic: true,
      maxAutomaticRecalls: 1,
      reason: "high-value-trigger",
      shouldRecall: true,
      trigger,
    };
  }

  return {
    automatic: false,
    maxAutomaticRecalls: 0,
    reason: "ordinary-prompt",
    shouldRecall: false,
    trigger: null,
  };
}
