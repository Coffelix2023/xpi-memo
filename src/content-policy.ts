export const PROHIBITED_CONTENT_CLASSIFICATIONS = [
  "secret",
  "credential",
  "private-key",
  "token",
  "cookie",
  "raw-transcript",
  "raw-tool-output",
  "raw-l0-event",
  "model-reasoning",
  "unverified-speculation",
] as const;

export type ContentClassification =
  | (typeof PROHIBITED_CONTENT_CLASSIFICATIONS)[number]
  | "concise-conclusion"
  | "reviewed-fact";

export interface ContentPolicyInput {
  classification?: ContentClassification;
  content: string;
}

const PRIVATE_KEY_PATTERN = /-----BEGIN (?:[^\n]+ )?PRIVATE KEY-----/i;
const SECRET_PATTERN = /(?:api[_-]?key|secret|password|credential)\s*[:=]/i;
const TOKEN_PATTERN = /(?:access[_-]?token|bearer\s+token|\btoken)\s*[:=]/i;
const COOKIE_PATTERN = /\bcookie\s*[:=]/i;
const RAW_TRANSCRIPT_PATTERN = /\brole\s*:\s*(?:user|assistant)\b/i;
const RAW_TOOL_OUTPUT_PATTERN = /\btool output\s*:/i;
const RAW_L0_EVENT_PATTERN =
  /\bevent[_-]?type\s*:\s*(?:tool[_-]?result|user|assistant)\b/i;
const MODEL_REASONING_PATTERN = /\b(?:chain of thought|hidden reasoning)\b/i;
// ponytail: only probably|maybe count as speculation; might/seems pass through —
// widen the pattern again if false negatives show up in real write governance.
const SPECULATION_PATTERN = /\b(?:probably|maybe)\b/i;

const PRIVATE_KEY_BLOCK_PATTERN =
  /-----BEGIN (?:[^\n]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[^\n]+ )?PRIVATE KEY-----/gi;
const PRIVATE_KEY_BEGIN_PATTERN = /-----BEGIN (?:[^\n]+ )?PRIVATE KEY-----/i;
const PRIVATE_KEY_END_PATTERN = /-----END (?:[^\n]+ )?PRIVATE KEY-----/i;
const CREDENTIAL_ASSIGNMENT_PATTERN =
  /\b(?:api[_-]?key|access[_-]?token|token|secret|password|credential)\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[\w.-]{8,}/gi;
const PREFIXED_TOKEN_PATTERN = /\bsk-[\w-]{8,}/gi;

const CREDENTIAL_SEPARATOR_PATTERN = /[=:]/;
export function hasUnterminatedPrivateKey(content: string): boolean {
  const begin = content.search(PRIVATE_KEY_BEGIN_PATTERN);
  return begin >= 0 && !PRIVATE_KEY_END_PATTERN.test(content.slice(begin));
}

export function redactCredentials(content: string): string {
  return content
    .replace(PRIVATE_KEY_BLOCK_PATTERN, "[REDACTED]")
    .replace(CREDENTIAL_ASSIGNMENT_PATTERN, (match) => {
      const separator = match.match(CREDENTIAL_SEPARATOR_PATTERN)?.[0] ?? ":";
      const name = match.slice(0, match.indexOf(separator) + 1);
      return `${name}[REDACTED]`;
    })
    .replace(BEARER_TOKEN_PATTERN, "Bearer [REDACTED]")
    .replace(PREFIXED_TOKEN_PATTERN, "[REDACTED]");
}

export function classifyProhibitedContent({
  classification,
  content,
}: ContentPolicyInput): ContentClassification | null {
  if (!content.trim()) return "empty-content" as ContentClassification;
  if (
    classification &&
    PROHIBITED_CONTENT_CLASSIFICATIONS.includes(
      classification as (typeof PROHIBITED_CONTENT_CLASSIFICATIONS)[number],
    )
  ) {
    return classification;
  }
  if (PRIVATE_KEY_PATTERN.test(content)) return "private-key";
  if (SECRET_PATTERN.test(content)) return "secret";
  if (TOKEN_PATTERN.test(content)) return "token";
  if (COOKIE_PATTERN.test(content)) return "cookie";
  if (RAW_TRANSCRIPT_PATTERN.test(content)) return "raw-transcript";
  if (RAW_TOOL_OUTPUT_PATTERN.test(content)) return "raw-tool-output";
  if (RAW_L0_EVENT_PATTERN.test(content)) return "raw-l0-event";
  if (MODEL_REASONING_PATTERN.test(content)) return "model-reasoning";
  if (SPECULATION_PATTERN.test(content)) return "unverified-speculation";
  return null;
}

export function isPersistableContent(input: ContentPolicyInput): boolean {
  return classifyProhibitedContent(input) === null;
}
