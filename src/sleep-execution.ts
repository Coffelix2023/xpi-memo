import type { SleepModeSetting } from "./config.js";
import type { SleepCapabilityResult } from "./sleep-capability.js";
import { decideSleep, type SleepRequest } from "./sleep-policy.js";

export interface SleepExecutionRequest {
  authorization: SleepRequest;
  capability: SleepCapabilityResult;
  dedicatedModel?: string;
  primaryModel?: string;
  /** Explicitly configured execution mode (task 5.1). Absent or "disabled"
   * fails closed: no fallback is ever substituted silently. */
  sleepMode?: SleepModeSetting;
}

export type SleepExecutionMode =
  | "dedicated"
  | "session-model"
  | "mechanical"
  | "none"
  | "disabled";

export interface SleepExecutionResult {
  executed: boolean;
  /** Actual execution mode (task 3.4/5.2): never labels a fallback as
   * dedicated. "disabled" = authorization or configuration rejected;
   * "none" = authorized but no mode is usable. */
  mode: SleepExecutionMode;
  reason?:
    | "dedicated-sleep-model-unsupported"
    | "implicit-trigger-not-allowed"
    | "sleep-command-unavailable"
    | "sleep-disabled-by-default"
    | "sleep-mode-not-configured"
    | "upstream-sleep-command-unavailable"
    | "upstream-sleep-has-no-independent-model-entrypoint"
    | "sleep-executed";
}

export type SleepRunner = (args: string[]) => Promise<string>;

export type SleepMaintenance = () => Promise<void>;

export async function executeSleep(
  request: SleepExecutionRequest,
  run: SleepRunner,
  maintain?: SleepMaintenance,
): Promise<SleepExecutionResult> {
  const authorization = decideSleep(request.authorization);
  if (!authorization.allowed) {
    return {
      executed: false,
      mode: "disabled",
      reason:
        request.authorization.trigger === "explicit-user"
          ? "sleep-disabled-by-default"
          : "implicit-trigger-not-allowed",
    };
  }

  const mode = request.sleepMode;
  // Fail closed (task 5.1): no explicit mode means SLEEP_DISABLED, never a
  // silent substitution for the primary model or a guessed fallback.
  if (mode === undefined || mode === "disabled") {
    return {
      executed: false,
      mode: "disabled",
      reason: "sleep-mode-not-configured",
    };
  }

  if (mode === "mechanical") {
    await maintain?.();
    return {
      executed: true,
      mode: "mechanical",
      reason: "sleep-executed",
    };
  }

  if (!request.capability.sleepCommandSupported) {
    return {
      executed: false,
      mode: "none",
      reason: "sleep-command-unavailable",
    };
  }

  if (mode === "dedicated") {
    if (!request.capability.dedicatedModelSupported) {
      // Keep the pre-existing reason-code contract: a dedicated request
      // without a dedicated model is never downgraded to another mode.
      return {
        executed: false,
        mode: "none",
        reason: "dedicated-sleep-model-unsupported",
      };
    }
    await run([
      "sleep",
    ]);
    return {
      executed: true,
      mode: "dedicated",
      reason: "sleep-executed",
    };
  }

  await run([
    "sleep",
  ]);
  return {
    executed: true,
    mode,
    reason: "sleep-executed",
  };
}
