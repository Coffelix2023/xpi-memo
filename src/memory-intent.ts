import type { MemoryKind } from "./kinds.js";

export interface MemoryIntentContext {
  projectBank: string | null;
}

export type MemoryIntentSkipReason =
  | "ambiguous-intent"
  | "missing-project-context"
  | "no-explicit-intent"
  | "project-fact-requires-verification"
  | "session-context-too-long";

export type MemoryIntentResult =
  | {
      content: string;
      kind: Exclude<MemoryKind, "project_gene">;
      signal: "explicit" | "correction";
      type: "memory";
    }
  | {
      /** Present only for `missing-project-context` skips: names the rejected
       * project kind so routing-rejection evidence can be recorded (task 4.3). */
      kind?: MemoryKind;
      reason: MemoryIntentSkipReason;
      type: "skip";
    };

const MAX_SESSION_CONTEXT_LENGTH = 500;
const EXPLICIT_MARKER_PATTERN =
  /\b(?:remember|please remember|default|always|never|for this session|workflow|gotcha|must|decided|decision|adopt|adopted)\b|记住|默认|始终|一直|以后|每次|本次|当前任务|注意|踩坑|更正|纠正|必须|不能|不得|决定|采用|改为/i;
const CORRECTION_PATTERN = /^(?:actually\s*[:,：]?|更正\s*[:：]?|纠正\s*[:：]?)/i;
const PROJECT_PATTERN = /(?:this project|this repository|repo|本项目|这个仓库|仓库)/i;
const SESSION_PATTERN = /(?:this session|for this session|本次|当前任务)/i;
const PREFERENCE_PATTERN =
  /(?:prefer|preference|default|always answer|回复|偏好|默认|始终|一直)/i;
const WORKFLOW_PATTERN =
  /(?:workflow|every time|before editing|before changing|steps|流程|工作流|每次|提交前|修改前)/i;
const CONSTRAINT_PATTERN = /(?:must|禁止|不得|必须|不能|never add|never use|固定使用)/i;
const DECISION_PATTERN =
  /(?:decided|decision|adopt|adopted|choose|chosen|采用|决定|改为)/i;
const GOTCHA_PATTERN = /(?:gotcha|be careful|watch out|pitfall|注意|踩坑|小心|不要忘)/i;
const PROJECT_FACT_PATTERN = /(?:uses|使用|技术栈|目录约定|built with|基于)/i;

function skip(reason: MemoryIntentSkipReason, kind?: MemoryKind): MemoryIntentResult {
  return {
    ...(kind
      ? {
          kind,
        }
      : {}),
    reason,
    type: "skip",
  };
}

function normalizedContent(text: string, correction: boolean): string {
  const content = text.trim();
  if (!correction) return content;
  return content.replace(CORRECTION_PATTERN, "").trim();
}

function matchingKinds(text: string): MemoryKind[] {
  const kinds: MemoryKind[] = [];
  const project = PROJECT_PATTERN.test(text);
  const session = SESSION_PATTERN.test(text);
  if (PREFERENCE_PATTERN.test(text) && !project && !session)
    kinds.push("global_preference");
  if (WORKFLOW_PATTERN.test(text) && !project && !session)
    kinds.push("global_workflow");
  if (project && CONSTRAINT_PATTERN.test(text)) kinds.push("project_constraint");
  if (DECISION_PATTERN.test(text)) kinds.push("project_decision");
  if (GOTCHA_PATTERN.test(text)) kinds.push("project_gotcha");
  if (session) kinds.push("session_context");
  return kinds;
}

/**
 * Extract only explicit user intent. Governance, evidence, and persistence are
 * deliberately left to the activation path that consumes this result.
 */
export function extractExplicitMemoryIntent(
  text: string,
  context: MemoryIntentContext,
): MemoryIntentResult {
  const trimmed = text.trim();
  if (!trimmed || !EXPLICIT_MARKER_PATTERN.test(trimmed)) {
    return skip("no-explicit-intent");
  }

  const correction = CORRECTION_PATTERN.test(trimmed);
  const kinds = matchingKinds(trimmed);
  if (kinds.length !== 1) {
    if (kinds.length > 1) return skip("ambiguous-intent");
    if (PROJECT_PATTERN.test(trimmed) && PROJECT_FACT_PATTERN.test(trimmed)) {
      return skip("project-fact-requires-verification");
    }
    return skip("no-explicit-intent");
  }

  const kind = kinds[0];
  if (!kind) return skip("no-explicit-intent");
  if (kind === "session_context" && trimmed.length > MAX_SESSION_CONTEXT_LENGTH) {
    return skip("session-context-too-long");
  }
  if (
    (kind === "project_constraint" ||
      kind === "project_decision" ||
      kind === "project_gotcha") &&
    context.projectBank === null
  ) {
    return skip("missing-project-context", kind);
  }
  if (kind === "project_gene") return skip("project-fact-requires-verification");

  return {
    content: normalizedContent(trimmed, correction),
    kind,
    signal: correction ? "correction" : "explicit",
    type: "memory",
  };
}
