import type { SleepCapabilityResult } from "./sleep-capability.js";
import { decideSleep, type SleepRequest } from "./sleep-policy.js";

export interface SleepExecutionRequest {
  authorization: SleepRequest;
  capability: SleepCapabilityResult;
  dedicatedModel?: string;
  primaryModel?: string;
}

export interface SleepExecutionResult {
  executed: boolean;
  reason?:
    | "dedicated-sleep-model-unsupported"
    | "implicit-trigger-not-allowed"
    | "sleep-command-unavailable"
    | "sleep-disabled-by-default"
    | "sleep-executed";
}

export type SleepRunner = (args: string[]) => Promise<string>;

export async function executeSleep(
  request: SleepExecutionRequest,
  run: SleepRunner,
): Promise<SleepExecutionResult> {
  const authorization = decideSleep(request.authorization);
  if (!authorization.allowed) {
    return {
      executed: false,
      reason:
        request.authorization.trigger === "explicit-user"
          ? "sleep-disabled-by-default"
          : "implicit-trigger-not-allowed",
    };
  }

  if (!request.capability.dedicatedModelSupported) {
    return {
      executed: false,
      reason: "dedicated-sleep-model-unsupported",
    };
  }

  if (!request.capability.sleepCommandSupported) {
    return {
      executed: false,
      reason: "sleep-command-unavailable",
    };
  }

  await run([
    "sleep",
  ]);
  return {
    executed: true,
    reason: "sleep-executed",
  };
}
