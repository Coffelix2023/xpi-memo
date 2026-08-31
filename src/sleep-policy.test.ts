import { describe, expect, it } from "vitest";

import { decideSleep, type SleepRequest } from "./sleep-policy.js";

describe("T1 sleep authorization policy", () => {
  it("denies sleep by default", () => {
    expect(
      decideSleep({
        authorized: false,
        trigger: "explicit-user",
      }),
    ).toEqual({
      allowed: false,
      reason: "sleep-disabled-by-default",
    });
  });

  it("allows only explicit user authorization", () => {
    expect(
      decideSleep({
        authorized: true,
        trigger: "explicit-user",
      }),
    ).toEqual({
      allowed: true,
      reason: "explicit-user-authorization",
    });
  });

  it.each([
    "status",
    "recall",
    "auto-write",
    "background",
    "session-end",
  ] as const)("denies implicit %s trigger even when authorized", (trigger) => {
    const request: SleepRequest = {
      authorized: true,
      trigger,
    };

    expect(decideSleep(request)).toEqual({
      allowed: false,
      reason: "implicit-trigger-not-allowed",
    });
  });

  it("does not allow a non-user trigger when authorization is omitted", () => {
    expect(
      decideSleep({
        trigger: "background",
      }),
    ).toEqual({
      allowed: false,
      reason: "implicit-trigger-not-allowed",
    });
  });
});
