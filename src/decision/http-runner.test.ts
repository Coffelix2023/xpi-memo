import { describe, expect, it, vi } from "vitest";
import {
  createHttpDecisionRunner,
  TYPESAFE_API_KEY_ENV,
  TYPESAFE_API_URL_ENV,
} from "./http-runner.js";

const INPUT = {
  maxInputChars: 1_000,
  questions: [],
  state: "{}",
};

const ENDPOINT = "https://systemone.example.test/v1/systemone";

function okResponse(
  body: unknown = {
    answers: [],
  },
): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

describe("default HTTP decision runner (task 1.3)", () => {
  it("refuses to build a runner without an explicitly configured endpoint", () => {
    // The reference snapshot documents `POST /v1/systemone` but no host, so
    // there is no default: an unconfigured boundary has no runner at all.
    expect(
      createHttpDecisionRunner({
        env: {},
      }),
    ).toBeUndefined();
    expect(
      createHttpDecisionRunner({
        env: {
          [TYPESAFE_API_KEY_ENV]: "secret",
        },
      }),
    ).toBeUndefined();
  });

  it("reads the key from the environment at call time, never from config", async () => {
    const env: NodeJS.ProcessEnv = {
      [TYPESAFE_API_URL_ENV]: ENDPOINT,
    };
    const fetchImpl = vi.fn(async () => okResponse());
    const runner = createHttpDecisionRunner({
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    if (!runner) throw new Error("runner should exist with an endpoint configured");
    // No key configured yet: the boundary classifies this as unavailable.
    expect(await runner(INPUT)).toEqual({
      unavailable: "missing-api-key",
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    // A key that appears later is picked up without rebuilding the runner.
    env[TYPESAFE_API_KEY_ENV] = "  secret-key-value  ";
    await runner(INPUT);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("keeps the key out of the body and the URL", async () => {
    const calls: Array<{
      init: RequestInit | undefined;
      url: string;
    }> = [];
    const runner = createHttpDecisionRunner({
      fetchImpl: (async (url: string, init?: RequestInit) => {
        calls.push({
          init,
          url: String(url),
        });
        return okResponse();
      }) as unknown as typeof fetch,
      env: {
        [TYPESAFE_API_KEY_ENV]: "secret-key-value",
        [TYPESAFE_API_URL_ENV]: ENDPOINT,
      },
    });
    if (!runner) throw new Error("runner should exist with an endpoint configured");
    await runner({
      ...INPUT,
      state: "provider state",
    });
    const call = calls[0];
    expect(call?.url).toBe(ENDPOINT);
    expect(call?.url).not.toContain("secret-key-value");
    expect(String(call?.init?.body)).not.toContain("secret-key-value");
    expect(call?.init?.body).toContain("provider state");
    expect(
      (call?.init?.headers as Record<string, string> | undefined)?.authorization,
    ).toBe("Bearer secret-key-value");
  });

  it("prefers the environment endpoint over an injected one", async () => {
    const urls: string[] = [];
    const runner = createHttpDecisionRunner({
      fetchImpl: (async (url: string) => {
        urls.push(String(url));
        return okResponse();
      }) as unknown as typeof fetch,
      url: "https://injected.example.test/v1/systemone",
      env: {
        [TYPESAFE_API_KEY_ENV]: "k",
        [TYPESAFE_API_URL_ENV]: ENDPOINT,
      },
    });
    if (!runner) throw new Error("runner should exist with an endpoint configured");
    await runner(INPUT);
    expect(urls[0]).toBe(ENDPOINT);
  });

  it("falls back to the injected endpoint when the environment is silent", async () => {
    const urls: string[] = [];
    const runner = createHttpDecisionRunner({
      fetchImpl: (async (url: string) => {
        urls.push(String(url));
        return okResponse();
      }) as unknown as typeof fetch,
      url: ENDPOINT,
      env: {
        [TYPESAFE_API_KEY_ENV]: "k",
      },
    });
    if (!runner) throw new Error("runner should exist with an endpoint configured");
    await runner(INPUT);
    expect(urls[0]).toBe(ENDPOINT);
  });

  it("reports a non-2xx response as unavailable instead of throwing", async () => {
    const runner = createHttpDecisionRunner({
      fetchImpl: (async () =>
        ({
          ok: false,
          status: 503,
          json: async () => ({}),
        }) as unknown as Response) as unknown as typeof fetch,
      env: {
        [TYPESAFE_API_KEY_ENV]: "k",
        [TYPESAFE_API_URL_ENV]: ENDPOINT,
      },
    });
    if (!runner) throw new Error("runner should exist with an endpoint configured");
    expect(await runner(INPUT)).toEqual({
      unavailable: "http-503",
    });
  });
});
