import { isMemoryKind, MEMORY_KINDS } from "./kinds.js";
import type { L0Event } from "./l0/types.js";
import type {
  OfflineExtractionRunner,
  OfflineExtractionRunnerInput,
} from "./offline-extraction.js";
import { OFFLINE_EXTRACTION_TIMEOUT_MESSAGE } from "./offline-extraction.js";

/**
 * Default session-model runner for gated offline extraction
 * (track-b-real-validation tasks 2.1–2.3, design decisions D1/D3/D4).
 *
 * This module is the only place that knows how to turn a bounded slice of L0
 * events into proposals through a model call. `offline-extraction.ts` stays
 * provider-neutral and keeps accepting an injected runner; the composition in
 * `index.ts` supplies this one only when nothing was injected.
 *
 * Boundaries inherited from the existing contract, none of them relaxed here:
 * bounded input, bounded output, abortable request, structured output only,
 * raw model text never persisted, and every failure mode expressed as a bounded
 * diagnostic rather than a thrown session-close failure.
 */

/** Output token budget for one extraction call (~4k characters). */
export const DEFAULT_OFFLINE_EXTRACTION_MAX_OUTPUT_TOKENS = 1200;

/** Config value meaning "use the session's chat model". */
export const SESSION_MODEL_SENTINEL = "session-model";

/** Anything the matcher needs from a model: an id and its provider. */
export interface OfflineExtractionModelRef {
  id: string;
  provider: string;
}

/**
 * Resolve the configured extraction model against the model catalogue.
 *
 * `"session-model"`, an unknown id, or an unparsable value all fall back to the
 * session model: a typo degrades to the previous behaviour instead of silently
 * switching extraction off. Accepts `provider/model-id` or a bare model id.
 * The catalogue is a thunk so the sentinel path never reads the registry.
 */
export function matchOfflineExtractionModel<T extends OfflineExtractionModelRef>(
  configured: string,
  sessionModel: T | undefined,
  catalogue: () => readonly T[],
): T | undefined {
  if (configured === SESSION_MODEL_SENTINEL) return sessionModel;
  const separator = configured.indexOf("/");
  const provider = separator > 0 ? configured.slice(0, separator) : undefined;
  const id = separator > 0 ? configured.slice(separator + 1) : configured;
  if (id === "") return sessionModel;
  return (
    catalogue().find(
      (model) =>
        model.id === id && (provider === undefined || model.provider === provider),
    ) ?? sessionModel
  );
}

/**
 * Confidence assigned to an entry the model returned without a usable number.
 * Midpoint is deliberate: it routes the proposal to the candidate lifecycle
 * (review) instead of inventing certainty about it.
 */
const UNSPECIFIED_CONFIDENCE = 0.5;

/** Bound on a single transcript line, so one huge payload cannot crowd out spans. */
const MAX_TRANSCRIPT_LINE_CHARS = 2_000;

/**
 * Minimal structural view of `ModelRegistry` (design decision D3).
 *
 * Deliberately structural: the runner is exercised by unit tests with a fake
 * client, and no model/provider type leaks into this module. The real
 * `ModelRegistry.complete(model, context, options)` satisfies it.
 */
export interface OfflineExtractionModelClient {
  // Method syntax is required: it keeps parameter checking bivariant, so the
  // real `ModelRegistry` (generic, `pi-ai`-typed) is assignable without a cast.
  complete(
    model: unknown,
    context: OfflineExtractionModelPrompt,
    options: {
      maxTokens: number;
      signal: AbortSignal;
    },
  ): Promise<unknown>;
}

/** The only request shape this runner builds; mirrors `pi-ai` `Context`. */
export interface OfflineExtractionModelPrompt {
  messages: Array<{
    content: string;
    role: "user";
    timestamp: number;
  }>;
  systemPrompt: string;
}

export interface SessionModelRunnerOptions {
  client: OfflineExtractionModelClient;
  maxOutputTokens?: number;
  /** Opaque here; handed to `client.complete` unchanged. */
  model?: unknown;
  timeoutMs: number;
}

/** Raw runner output; the boundary validates and re-normalises every entry. */
export interface OfflineExtractionRunnerOutput {
  /** Bounded marker for "the model answered but not with parsable JSON". */
  invalidOutput?: boolean;
  proposals: Array<{
    confidence: number;
    content: string;
    kind: string;
    sourceReference: string;
  }>;
  /** Present only when no call was made; never carries body text. */
  unavailable?: "no-model";
}

const EXTRACTION_SYSTEM_PROMPT = [
  "You extract durable memories from an engineering session transcript.",
  'Reply with strict JSON only, no prose and no code fences: {"proposals":[...]}',
  'where each entry is {"kind": <allowed kind>, "content": <one self-contained statement>,',
  '"confidence": <number between 0 and 1>, "sourceEvent": <transcript position number>}.',
  `Allowed kinds: ${MEMORY_KINDS.join(", ")}.`,
  "Extract only what the transcript supports.",
  'Prefer few high-quality entries; reply with {"proposals":[]} when nothing is durable.',
].join(" ");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Render the tail of the transcript within `maxInputChars`. Newest events win:
 * the boundary already sliced the session tail, and a closing session's most
 * recent span is the most likely to hold a durable conclusion.
 */
function transcriptFor(events: readonly L0Event[], maxInputChars: number): string {
  const limit =
    Number.isInteger(maxInputChars) && maxInputChars > 0 ? maxInputChars : 0;
  const lines: string[] = [];
  let chars = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index] as L0Event;
    const line =
      `#${event.position} ${event.type}: ${JSON.stringify(event.payload)}`.slice(
        0,
        MAX_TRANSCRIPT_LINE_CHARS,
      );
    if (chars + line.length > limit) break;
    lines.push(line);
    chars += line.length;
  }
  return lines.reverse().join("\n");
}

export function assistantText(message: unknown): string {
  if (typeof message === "string") return message;
  if (!isRecord(message) || !Array.isArray(message.content)) return "";
  return message.content
    .filter(
      (
        part,
      ): part is {
        text: string;
        type: string;
      } => isRecord(part),
    )
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

/** Parsed model reply, narrowed to the two JSON shapes this runner accepts. */
type ParsedModelReply =
  | {
      kind: "array";
      value: unknown[];
    }
  | {
      kind: "object";
      value: Record<string, unknown>;
    };

/** Parse the first parsable JSON object/array in the reply, tolerating code fences. */
export function parseStructured(text: string): ParsedModelReply | undefined {
  const trimmed = text.trim();
  const candidates = [
    trimmed,
    (() => {
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      return start >= 0 && end > start ? trimmed.slice(start, end + 1) : "";
    })(),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate) as unknown;
    } catch {
      // Try the next candidate; a fenced or prefixed reply is normal.
      continue;
    }
    if (Array.isArray(parsed))
      return {
        kind: "array",
        value: parsed,
      };
    if (isRecord(parsed))
      return {
        kind: "object",
        value: parsed,
      };
  }
  return undefined;
}

function entriesFor(reply: ParsedModelReply): unknown[] {
  if (reply.kind === "array") return reply.value;
  return Array.isArray(reply.value.proposals) ? reply.value.proposals : [];
}

function confidenceFor(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return UNSPECIFIED_CONFIDENCE;
  }
  return Math.min(1, Math.max(0, value));
}

/**
 * Source reference of one proposal: `session:<id>#<position>`.
 *
 * The model is asked for a transcript position; when it cites one that is not
 * in the sent span, the newest sent position is used instead so the reference
 * always resolves to a real L0 event.
 */
function sourceReferenceFor(
  cited: unknown,
  sessionId: string,
  events: readonly L0Event[],
): string {
  const positions = new Set(events.map((event) => event.position));
  const position =
    typeof cited === "number" && positions.has(cited)
      ? cited
      : (events.at(-1)?.position ?? 0);
  return `session:${sessionId}#${position}`;
}

function proposalsFrom(
  reply: ParsedModelReply,
  sessionId: string,
  events: readonly L0Event[],
): OfflineExtractionRunnerOutput["proposals"] {
  const entries = entriesFor(reply);
  const proposals: OfflineExtractionRunnerOutput["proposals"] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const content = typeof entry.content === "string" ? entry.content.trim() : "";
    const kind = typeof entry.kind === "string" ? entry.kind : "";
    if (!content || !isMemoryKind(kind)) continue;
    proposals.push({
      confidence: confidenceFor(entry.confidence),
      content,
      kind,
      sourceReference: sourceReferenceFor(entry.sourceEvent, sessionId, events),
    });
  }
  return proposals;
}

/**
 * Build the default runner. The returned runner never throws the timeout
 * sentinel by accident: it re-throws `OFFLINE_EXTRACTION_TIMEOUT_MESSAGE` so
 * the boundary classifies its own bound as `timed-out` rather than `failed`.
 */
export function createSessionModelRunner(
  options: SessionModelRunnerOptions,
): OfflineExtractionRunner {
  const maxOutputTokens =
    options.maxOutputTokens ?? DEFAULT_OFFLINE_EXTRACTION_MAX_OUTPUT_TOKENS;
  const model = options.model;
  return async (
    input: OfflineExtractionRunnerInput,
  ): Promise<OfflineExtractionRunnerOutput> => {
    if (model === undefined || model === null) {
      return {
        proposals: [],
        unavailable: "no-model",
      };
    }
    const transcript = transcriptFor(input.events, input.maxInputChars);
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const expired = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(OFFLINE_EXTRACTION_TIMEOUT_MESSAGE));
      }, options.timeoutMs);
    });
    try {
      const message = await Promise.race([
        options.client.complete(
          model,
          {
            systemPrompt: EXTRACTION_SYSTEM_PROMPT,
            messages: [
              {
                content: transcript,
                role: "user",
                timestamp: Date.now(),
              },
            ],
          },
          {
            maxTokens: maxOutputTokens,
            signal: controller.signal,
          },
        ),
        expired,
      ]);
      const parsed = parseStructured(assistantText(message));
      if (parsed === undefined)
        return {
          invalidOutput: true,
          proposals: [],
        };
      return {
        proposals: proposalsFrom(parsed, input.sessionId, input.events),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
