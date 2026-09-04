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

  it("fails closed when no sleep mode is configured (task 5.1)", async () => {
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
      mode: "disabled",
      reason: "sleep-mode-not-configured",
    });
    expect(calls).toEqual([]);
  });

  it("fails closed when the sleep mode is explicitly disabled (task 5.1)", async () => {
    const calls: string[][] = [];
    const result = await executeSleep(
      {
        ...authorizedRequest,
        sleepMode: "disabled",
      },
      async (args: string[]) => {
        calls.push(args);
        return "should not run";
      },
    );

    expect(result).toEqual({
      executed: false,
      mode: "disabled",
      reason: "sleep-mode-not-configured",
    });
    expect(calls).toEqual([]);
  });

  it("rejects a dedicated mode when the upstream capability is unavailable", async () => {
    const calls: string[][] = [];
    const result = await executeSleep(
      {
        ...authorizedRequest,
        sleepMode: "dedicated",
      },
      async (args: string[]) => {
        calls.push(args);
        return "should not run";
      },
    );

    expect(result).toEqual({
      executed: false,
      mode: "none",
      reason: "dedicated-sleep-model-unsupported",
    });
    expect(calls).toEqual([]);
  });

  it("does not silently fall back to the primary model for a dedicated request", async () => {
    const calls: string[][] = [];
    const result = await executeSleep(
      {
        ...authorizedRequest,
        dedicatedModel: "unsupported-model",
        primaryModel: "primary-model",
        sleepMode: "dedicated",
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
        sleepMode: "dedicated",
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
      mode: "disabled",
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
        sleepMode: "session-model",
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
      mode: "disabled",
      reason: "implicit-trigger-not-allowed",
    });
    expect(calls).toEqual([]);
  });

  it("executes an explicit session-model fallback and names the actual mode (task 5.2)", async () => {
    const calls: string[][] = [];
    const result = await executeSleep(
      {
        ...authorizedRequest,
        sleepMode: "session-model",
      },
      async (args: string[]) => {
        calls.push(args);
        return "consolidated";
      },
    );

    expect(result).toEqual({
      executed: true,
      mode: "session-model",
      reason: "sleep-executed",
    });
    expect(calls).toEqual([
      [
        "sleep",
      ],
    ]);
  });

  it("runs mechanical sleep as local maintenance without the sleep CLI", async () => {
    const calls: string[][] = [];
    const maintained: string[] = [];
    const result = await executeSleep(
      {
        ...authorizedRequest,
        sleepMode: "mechanical",
        capability: {
          dedicatedModelSupported: false,
          reason: "upstream-sleep-command-unavailable",
          sleepCommandSupported: false,
        },
      },
      async (args: string[]) => {
        calls.push(args);
        return "should not run";
      },
      async () => {
        maintained.push("export");
      },
    );

    expect(result).toEqual({
      executed: true,
      mode: "mechanical",
      reason: "sleep-executed",
    });
    expect(calls).toEqual([]);
    expect(maintained).toEqual([
      "export",
    ]);
  });
});
