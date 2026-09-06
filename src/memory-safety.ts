import { hasUnterminatedPrivateKey, redactCredentials } from "./content-policy.js";
import type { L0Event } from "./l0/types.js";

export const MEMORY_SAFETY_POLICY_VERSION = "memory-boundary-v1";
export const MAX_MEMORY_SAFETY_COUNT = 999;

export const MEMORY_SAFETY_REASONS = [
  "prompt-injection",
  "credential-redacted",
  "uncertain-credential",
] as const;

export type MemorySafetyReason = (typeof MEMORY_SAFETY_REASONS)[number];

export interface MemorySafetyCounts {
  blocked: number;
  omitted: number;
  redacted: number;
  refused: number;
  safe: number;
}

export interface MemorySafetyEntry {
  content: string;
}

export interface RecallSafetyResult<T extends MemorySafetyEntry> {
  counts: MemorySafetyCounts;
  items: T[];
  policyVersion: typeof MEMORY_SAFETY_POLICY_VERSION;
  reasons: MemorySafetyReason[];
}

export type ExternalSafetyResult =
  | {
      content: string;
      counts: MemorySafetyCounts;
      policyVersion: typeof MEMORY_SAFETY_POLICY_VERSION;
      status: "safe";
    }
  | {
      content: string;
      counts: MemorySafetyCounts;
      policyVersion: typeof MEMORY_SAFETY_POLICY_VERSION;
      reason: "credential-redacted";
      status: "redacted";
    }
  | {
      counts: MemorySafetyCounts;
      policyVersion: typeof MEMORY_SAFETY_POLICY_VERSION;
      reason: "uncertain-credential";
      status: "refused";
    };

const PROMPT_INJECTION_PATTERNS = [
  /\b(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|existing|system)\s+(?:instructions?|rules?|prompts?)\b/i,
  /\b(?:reveal|show)\s+(?:the\s+)?(?:system\s+prompt|hidden\s+instructions?)\b/i,
  /(?:忽略|无视|绕过)(?:之前|此前|上述|所有)?.{0,12}(?:指令|指示|规则)/,
  /(?:修改|覆盖|更改)(?:系统)?(?:提示|指令|规则)/,
  /(?:请|立即)?执行(?:以下|下列).{0,8}(?:命令|指令)/,
] as const;

function boundedCount(value: number): number {
  return Math.min(MAX_MEMORY_SAFETY_COUNT, Math.max(0, value));
}

function counts(values: Partial<MemorySafetyCounts> = {}): MemorySafetyCounts {
  return {
    blocked: boundedCount(values.blocked ?? 0),
    omitted: boundedCount(values.omitted ?? 0),
    redacted: boundedCount(values.redacted ?? 0),
    refused: boundedCount(values.refused ?? 0),
    safe: boundedCount(values.safe ?? 0),
  };
}

export function isPromptInjection(content: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(content));
}

export function filterRecallEntries<T extends MemorySafetyEntry>(
  entries: readonly T[],
): RecallSafetyResult<T> {
  const items: T[] = [];
  let blocked = 0;
  for (const entry of entries) {
    if (isPromptInjection(entry.content)) blocked += 1;
    else items.push(entry);
  }
  return {
    counts: counts({
      blocked,
      safe: items.length,
    }),
    items,
    policyVersion: MEMORY_SAFETY_POLICY_VERSION,
    reasons:
      blocked > 0
        ? [
            "prompt-injection",
          ]
        : [],
  };
}

export function prepareExternalContent(content: string): ExternalSafetyResult {
  if (hasUnterminatedPrivateKey(content)) {
    return {
      counts: counts({
        refused: 1,
      }),
      policyVersion: MEMORY_SAFETY_POLICY_VERSION,
      reason: "uncertain-credential",
      status: "refused",
    };
  }
  const safeContent = redactCredentials(content);
  if (safeContent !== content) {
    return {
      content: safeContent,
      counts: counts({
        redacted: 1,
        safe: 1,
      }),
      policyVersion: MEMORY_SAFETY_POLICY_VERSION,
      reason: "credential-redacted",
      status: "redacted",
    };
  }
  return {
    content,
    counts: counts({
      safe: 1,
    }),
    policyVersion: MEMORY_SAFETY_POLICY_VERSION,
    status: "safe",
  };
}

export function prepareExternalEvents(events: readonly L0Event[]): {
  events: L0Event[];
  result: ExternalSafetyResult;
} {
  const serialized = JSON.stringify(events);
  const result = prepareExternalContent(serialized);
  if (result.status === "refused")
    return {
      events: [],
      result,
    };
  try {
    return {
      events: JSON.parse(result.content) as L0Event[],
      result,
    };
  } catch {
    return {
      events: [],
      result: {
        counts: counts({
          refused: 1,
        }),
        policyVersion: MEMORY_SAFETY_POLICY_VERSION,
        reason: "uncertain-credential",
        status: "refused",
      },
    };
  }
}
