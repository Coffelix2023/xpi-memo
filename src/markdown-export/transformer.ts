/**
 * L0 event to Markdown transformer (Task 8.1, 8.4, 10.2).
 *
 * Converts one L0 event into human-readable prose, carrying source
 * traceability (session id + event position) for bidirectional navigation.
 * Deterministic ordering is the caller's job: entries are emitted in event
 * position order so Git diffs stay append-only and stable.
 */

import type { L0Event } from "../l0/types.js";

export interface ExportFilters {
  /** Drop tool_result details entirely when true (L0 log keeps full payloads). */
  excludeToolResults?: boolean;
  /** Redact sensitive content (file paths, key-like strings) with [REDACTED]. */
  privacy?: boolean;
}

const REDACTIONS: Array<{
  pattern: RegExp;
  replacement: string;
}> = [
  // Unix-style file paths of some length
  {
    pattern: /(?:\/[\w.-]+){2,}/g,
    replacement: "[REDACTED]",
  },
  // Key/token-like assignments (sk-…, token=…, Bearer …)
  {
    pattern:
      /(?:sk-[\w-]{8,}|(?:api[_-]?key|token|secret)\s*[=:]?\s*[\w-]{8,}|Bearer\s+[\w.-]{8,})/gi,
    replacement: "[REDACTED]",
  },
];

function redact(text: string): string {
  let out = text;
  for (const { pattern, replacement } of REDACTIONS)
    out = out.replace(pattern, replacement);
  return out;
}

/** First line of a scalar, or a compact `key: value` list for plain objects (no JSON dumps). */
function summarize(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return flatten(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value))
    return value
      .slice(0, 3)
      .map((item) => summarize(item))
      .join(", ");
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 4);
    return flatten(
      entries.map(([key, item]) => `${key}: ${summarize(item)}`).join(", "),
    );
  }
  return flatten(String(value));
}

function flatten(text: string): string {
  const flattened = text.split("\n", 1)[0].trim();
  return flattened.length > 200 ? `${flattened.slice(0, 197)}...` : flattened;
}

interface ProsePayload {
  action?: unknown;
  arguments?: unknown;
  bank?: unknown;
  content?: unknown;
  error?: unknown;
  input?: unknown;
  isError?: unknown;
  kind?: unknown;
  output?: unknown;
  path?: unknown;
  reason?: unknown;
  summary?: unknown;
  text?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
}

function prose(event: L0Event, filters: ExportFilters): string {
  const payload = event.payload as ProsePayload;
  const text = (value: unknown): string => {
    const raw = summarize(value);
    return filters.privacy ? redact(raw) : raw;
  };
  switch (event.type) {
    case "user_message":
      return `User: ${text(payload.text)}`;
    case "assistant_message":
      return `Assistant: ${text(payload.text)}`;
    case "tool_call":
      return `Called ${text(payload.toolName)}: ${text(payload.arguments ?? payload.input)}`;
    case "tool_result": {
      if (filters.excludeToolResults) return "";
      return payload.isError
        ? `Tool ${text(payload.toolCallId)} failed: ${text(payload.error ?? payload.summary)}`
        : `Tool ${text(payload.toolCallId)} completed: ${text(payload.summary ?? payload.output)}`;
    }
    case "file_change":
      return `File changed: ${text(payload.path)} (${text(payload.action)})`;
    case "compaction":
      return `Context compacted: ${text(payload.reason)}`;
    case "t1_memory_write":
      return `Memory stored [${text(payload.kind)}]: ${text(payload.content)}`;
    case "candidate_created":
      return `Memory candidate created [${text(payload.kind)}]: ${text(payload.content ?? payload.reason)}`;
    case "candidate_confirmed":
      return `Memory candidate confirmed [${text(payload.kind)}]`;
    case "candidate_rejected":
      return `Memory candidate rejected [${text(payload.kind)}]: ${text(payload.reason)}`;
    case "routing_decision":
      return `Routing decision [${text(payload.kind)}] -> ${text(payload.bank)}`;
    default:
      return `${event.type}: ${flatten(JSON.stringify(event.payload))}`;
  }
}

/** Render one event as a Markdown list entry with source traceability, or "" if filtered out. */
export function transformEvent(
  event: L0Event,
  sessionId: string,
  filters: ExportFilters = {},
): string {
  const body = prose(event, filters);
  if (!body) return "";
  const time = event.timestamp.slice(11, 19);
  const kind = event.payload.kind !== undefined ? ` \`${event.payload.kind}\`` : "";
  const source = `<sub>session \`${sessionId}\` @ position ${event.position}</sub>`;
  return `- \`${time}\` ${body}${kind} ${source}`;
}

/** Wrap an event that could not be parsed into a visible warning line (Task 10.x corrupt handling). */
export function corruptEventLine(raw: string): string {
  return `- \`corrupt\` <sub>unparseable L0 event skipped:</sub> \`${flatten(raw)}\``;
}
