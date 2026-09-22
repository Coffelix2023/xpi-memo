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
/**
 * The two shapes of rule this file carries.
 *
 * A **phrase list** is the common case: any one of the words trips the rule,
 * and `phrasePattern` compiles it into the matcher. The lists are the source
 * rather than a parallel table, so the words a reader sees in the panel's
 * trigger view are literally the words the matcher runs — hand-writing both
 * would be two truths to keep in sync, and only one of them is tested.
 *
 * `CORRECTION_PATTERN` is the exception: a prefix grammar (`actually:`,
 * `更正`), not a word list, so it stays a regex.
 */
function phrasePattern(phrases: readonly string[]): RegExp {
  return new RegExp(`(?:${phrases.join("|")})`, "i");
}

/** `actually` / `更正` / `纠正` before the statement, stripped once matched. */
const CORRECTION_PATTERN = /^(?:actually\s*[:,：]?|更正\s*[:：]?|纠正\s*[:：]?)/i;

/** Project wording: qualifies a constraint and suppresses the global rules. */
const PROJECT_PHRASES = [
  "this project",
  "this repository",
  "repo",
  "本项目",
  "这个仓库",
  "仓库",
] as const;
const PROJECT_PATTERN = phrasePattern(PROJECT_PHRASES);

/** Session wording: bounds what is captured to the current session. */
const SESSION_PHRASES = [
  "this session",
  "for this session",
  "本次",
  "当前任务",
] as const;
const SESSION_PATTERN = phrasePattern(SESSION_PHRASES);

/** Durable preferences. Global, so project or session wording suppresses it. */
const PREFERENCE_PHRASES = [
  "prefer",
  "preference",
  "default",
  "always answer",
  "回复",
  "偏好",
  "默认",
  "始终",
  "一直",
] as const;
const PREFERENCE_PATTERN = phrasePattern(PREFERENCE_PHRASES);

/** Repeating procedures. Global for the same reason as preferences. */
const WORKFLOW_PHRASES = [
  "workflow",
  "every time",
  "before editing",
  "before changing",
  "steps",
  "流程",
  "工作流",
  "每次",
  "提交前",
  "修改前",
] as const;
const WORKFLOW_PATTERN = phrasePattern(WORKFLOW_PHRASES);

/** Prohibitions. Needs project wording to become a project constraint. */
const CONSTRAINT_PHRASES = [
  "must",
  "禁止",
  "不得",
  "必须",
  "不能",
  "never add",
  "never use",
  "固定使用",
] as const;
const CONSTRAINT_PATTERN = phrasePattern(CONSTRAINT_PHRASES);

/** Chosen approaches, resolved to a project decision. */
const DECISION_PHRASES = [
  "decided",
  "decision",
  "adopt",
  "adopted",
  "choose",
  "chosen",
  "采用",
  "决定",
  "改为",
] as const;
const DECISION_PATTERN = phrasePattern(DECISION_PHRASES);

/** Traps worth remembering. */
const GOTCHA_PHRASES = [
  "gotcha",
  "be careful",
  "watch out",
  "pitfall",
  "注意",
  "踩坑",
  "小心",
  "不要忘",
] as const;
const GOTCHA_PATTERN = phrasePattern(GOTCHA_PHRASES);

/**
 * Repository facts. Recognised but deliberately **never** captured on their
 * own: a claim about the codebase has to be verified against the working tree,
 * so a match returns `project-fact-requires-verification` instead of a kind.
 */
const PROJECT_FACT_PHRASES = [
  "uses",
  "使用",
  "技术栈",
  "目录约定",
  "built with",
  "基于",
] as const;
const PROJECT_FACT_PATTERN = phrasePattern(PROJECT_FACT_PHRASES);

/**
 * One capture rule as data, for the panel's read-only trigger view.
 *
 * `phrases` are the exported lists above, not copies, so a listed rule can
 * never describe something the matcher would not do.
 *
 * Two rules scope the others rather than capturing on their own: `project`
 * qualifies a constraint and, like `session`, suppresses the two `globalOnly`
 * rules — "本项目偏好 X" is not a global preference. `CORRECTION_PATTERN` has
 * no row at all: it is a prefix grammar that modifies whichever rule the rest
 * of the sentence trips.
 */
export interface MemoryIntentRule {
  /** `true` when project or session wording suppresses the rule. */
  globalOnly?: true;
  /** Stable key; the view owns the label for it. */
  id: string;
  /** The kind this rule captures; absent for a wording-only rule. */
  kind?: MemoryKind;
  /** The words that trip the rule. */
  phrases: readonly string[];
  /** `true` for the rule that scopes others rather than capturing. */
  qualifier?: true;
  /** `true` when the rule only fires alongside project wording. */
  requiresProject?: true;
  /**
   * `true` when a match is deliberately not captured: the content has to pass
   * verification against the working tree before it can become a memory.
   */
  verifiedSeparately?: true;
}

export const MEMORY_INTENT_RULES: readonly MemoryIntentRule[] = [
  {
    globalOnly: true,
    id: "preference",
    kind: "global_preference",
    phrases: PREFERENCE_PHRASES,
  },
  {
    globalOnly: true,
    id: "workflow",
    kind: "global_workflow",
    phrases: WORKFLOW_PHRASES,
  },
  {
    id: "project",
    phrases: PROJECT_PHRASES,
    qualifier: true,
  },
  {
    id: "session",
    kind: "session_context",
    phrases: SESSION_PHRASES,
  },
  {
    id: "constraint",
    kind: "project_constraint",
    phrases: CONSTRAINT_PHRASES,
    requiresProject: true,
  },
  {
    id: "decision",
    kind: "project_decision",
    phrases: DECISION_PHRASES,
  },
  {
    id: "gotcha",
    kind: "project_gotcha",
    phrases: GOTCHA_PHRASES,
  },
  {
    id: "project-fact",
    phrases: PROJECT_FACT_PHRASES,
    verifiedSeparately: true,
  },
];

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
  if (!trimmed) return skip("no-explicit-intent");

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
