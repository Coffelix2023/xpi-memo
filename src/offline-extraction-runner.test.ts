import { describe, expect, it, vi } from "vitest";
import type { L0Event } from "./l0/types.js";
import { createL0Event } from "./l0/types.js";
import { OFFLINE_EXTRACTION_TIMEOUT_MESSAGE } from "./offline-extraction.js";
import {
  createSessionModelRunner,
  type OfflineExtractionModelClient,
  type OfflineExtractionRunnerOutput,
} from "./offline-extraction-runner.js";

/**
 * Default runner unit tests (track-b-real-validation task 2.1).
 *
 * The client seam is faked, so these tests never touch a provider: they pin the
 * four outcomes the runner must distinguish (success, timeout, thrown error,
 * no model) plus the input bound and the source-reference contract.
 */

function events(count: number): L0Event[] {
  return Array.from(
    {
      length: count,
    },
    (_value, index) =>
      createL0Event("user_message", index + 1, {
        text: `line ${index + 1}`,
      }),
  );
}

function textReply(payload: unknown): unknown {
  return {
    role: "assistant",
    content: [
      {
        text: typeof payload === "string" ? payload : JSON.stringify(payload),
        type: "text",
      },
    ],
  };
}

const PROPOSAL_REPLY = {
  proposals: [
    {
      confidence: 0.8,
      content: "use L0 ids to trace injected memory",
      kind: "project_decision",
      sourceEvent: 2,
    },
  ],
};

describe("createSessionModelRunner", () => {
  it("normalises a structured reply into the proposal shape", async () => {
    const complete = vi.fn(async () => textReply(PROPOSAL_REPLY));
    const runner = createSessionModelRunner({
      client: {
        complete,
      } as unknown as OfflineExtractionModelClient,
      timeoutMs: 50,
      model: {
        id: "fake-model",
      },
    });

    const output = (await runner({
      events: events(3),
      maxInputChars: 1_000,
      sessionId: "s1",
    })) as OfflineExtractionRunnerOutput;

    expect(output.proposals).toEqual([
      {
        confidence: 0.8,
        content: "use L0 ids to trace injected memory",
        kind: "project_decision",
        sourceReference: "session:s1#2",
      },
    ]);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("parses a fenced reply and falls back to the newest position for a bad citation", async () => {
    const runner = createSessionModelRunner({
      client: {
        complete: async () =>
          textReply(
            `\`\`\`json\n${JSON.stringify({
              proposals: [
                {
                  content: "interaction uses ctx.ui only",
                  kind: "project_constraint",
                  sourceEvent: 999,
                },
              ],
            })}\n\`\`\``,
          ),
      } as unknown as OfflineExtractionModelClient,
      model: {},
      timeoutMs: 50,
    });

    const output = (await runner({
      events: events(4),
      maxInputChars: 1_000,
      sessionId: "s2",
    })) as OfflineExtractionRunnerOutput;

    expect(output.proposals).toEqual([
      {
        confidence: 0.5,
        content: "interaction uses ctx.ui only",
        kind: "project_constraint",
        sourceReference: "session:s2#4",
      },
    ]);
  });

  it("returns no proposals for unparsable output instead of throwing", async () => {
    const runner = createSessionModelRunner({
      client: {
        complete: async () => textReply("I could not find anything durable."),
      } as unknown as OfflineExtractionModelClient,
      model: {},
      timeoutMs: 50,
    });

    const output = (await runner({
      events: events(2),
      maxInputChars: 1_000,
      sessionId: "s3",
    })) as OfflineExtractionRunnerOutput;

    expect(output).toEqual({
      invalidOutput: true,
      proposals: [],
    });
  });

  it("bounds the request and aborts the call when the timeout elapses", async () => {
    let seenSignal: AbortSignal | undefined;
    let seenPromptChars = 0;
    const client = {
      complete: async (
        _model: unknown,
        prompt: {
          messages: Array<{
            content: string;
          }>;
        },
        options: {
          signal: AbortSignal;
        },
      ) => {
        seenSignal = options.signal;
        seenPromptChars = prompt.messages[0]?.content.length ?? 0;
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      },
    } as unknown as OfflineExtractionModelClient;
    const runner = createSessionModelRunner({
      client,
      model: {},
      timeoutMs: 10,
    });

    await expect(
      runner({
        events: events(50),
        maxInputChars: 120,
        sessionId: "s4",
      }),
    ).rejects.toThrow(OFFLINE_EXTRACTION_TIMEOUT_MESSAGE);
    expect(seenPromptChars).toBeLessThanOrEqual(120);
    expect(seenSignal?.aborted).toBe(true);
  });

  it("propagates a client error so the boundary reports `failed`", async () => {
    const runner = createSessionModelRunner({
      client: {
        complete: async () => {
          throw new Error("provider-unauthenticated");
        },
      } as unknown as OfflineExtractionModelClient,
      model: {},
      timeoutMs: 50,
    });

    await expect(
      runner({
        events: events(2),
        maxInputChars: 1_000,
        sessionId: "s5",
      }),
    ).rejects.toThrow("provider-unauthenticated");
  });

  it("makes no request when the session has no model", async () => {
    const complete = vi.fn(async () => textReply(PROPOSAL_REPLY));
    const runner = createSessionModelRunner({
      client: {
        complete,
      } as unknown as OfflineExtractionModelClient,
      model: undefined,
      timeoutMs: 50,
    });

    const output = (await runner({
      events: events(2),
      maxInputChars: 1_000,
      sessionId: "s6",
    })) as OfflineExtractionRunnerOutput;

    expect(output).toEqual({
      proposals: [],
      unavailable: "no-model",
    });
    expect(complete).not.toHaveBeenCalled();
  });
});
