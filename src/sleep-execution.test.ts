import { describe, expect, it } from "vitest";

import { executeSleep, type SleepExecutionRequest } from "./sleep-execution.js";

describe("T1 dedicated sleep model capability", () => {
  const authorizedRequest: SleepExecutionRequest = {
    authorization: {
      authorized: true,
      trigger: "explicit-user",
    },
    capability: {
      dedicatedModelSupported: false,
      reason: "upstream-sleep-has-no-independent-model-entrypoint",
      sleepCommandSupported: true,
    },
  };

  it("returns a capability error when a dedicated model is configured", async () => {
    const calls: string[][] = [];
    const result = await executeSleep(
      {
        ...authorizedRequest,
        dedicatedModel: "small-local-model",
      },
      async (args: string[]) => {
        calls.push(args);
        return "should not run";
      },
    );

    expect(result).toEqual({
      executed: false,
      reason: "dedicated-sleep-model-unsupported",
    });
    expect(calls).toEqual([]);
  });

  it("rejects authorized sleep when the upstream capability is unavailable", async () => {
    const calls: string[][] = [];
    const result = await executeSleep(authorizedRequest, async (args: string[]) => {
      calls.push(args);
      return "should not run";
    });

    expect(result).toEqual({
      executed: false,
      reason: "dedicated-sleep-model-unsupported",
    });
    expect(calls).toEqual([]);
  });

  it("does not silently fall back to the primary model", async () => {
    const calls: string[][] = [];
    const result = await executeSleep(
      {
        ...authorizedRequest,
        dedicatedModel: "unsupported-model",
        primaryModel: "primary-model",
      },
      async (args: string[]) => {
        calls.push(args);
        return "primary model must not run";
      },
    );

    expect(result.executed).toBe(false);
    expect(result.reason).toBe("dedicated-sleep-model-unsupported");
    expect(calls).toEqual([]);
  });

  it("requires explicit authorization before capability evaluation", async () => {
    const calls: string[][] = [];
    const result = await executeSleep(
      {
        ...authorizedRequest,
        dedicatedModel: "unsupported-model",
        authorization: {
          authorized: false,
          trigger: "explicit-user",
        },
      },
      async (args: string[]) => {
        calls.push(args);
        return "should not run";
      },
    );

    expect(result).toEqual({
      executed: false,
      reason: "sleep-disabled-by-default",
    });
    expect(calls).toEqual([]);
  });

  it("rejects implicit triggers without calling the runner", async () => {
    const calls: string[][] = [];
    const result = await executeSleep(
      {
        ...authorizedRequest,
        dedicatedModel: undefined,
        authorization: {
          authorized: true,
          trigger: "session-end",
        },
      },
      async (args: string[]) => {
        calls.push(args);
        return "should not run";
      },
    );

    expect(result).toEqual({
      executed: false,
      reason: "implicit-trigger-not-allowed",
    });
    expect(calls).toEqual([]);
  });
});
