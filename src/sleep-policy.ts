export const SLEEP_TRIGGERS = [
  "explicit-user",
  "status",
  "recall",
  "auto-write",
  "background",
  "session-end",
] as const;

export type SleepTrigger = (typeof SLEEP_TRIGGERS)[number];

export interface SleepRequest {
  authorized?: boolean;
  trigger: SleepTrigger;
}

export interface SleepDecision {
  allowed: boolean;
  reason:
    | "explicit-user-authorization"
    | "implicit-trigger-not-allowed"
    | "sleep-disabled-by-default";
}

export function decideSleep(request: SleepRequest): SleepDecision {
  if (request.trigger !== "explicit-user") {
    return {
      allowed: false,
      reason: "implicit-trigger-not-allowed",
    };
  }
  if (request.authorized !== true) {
    return {
      allowed: false,
      reason: "sleep-disabled-by-default",
    };
  }
  return {
    allowed: true,
    reason: "explicit-user-authorization",
  };
}
