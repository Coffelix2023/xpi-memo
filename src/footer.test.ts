import { describe, expect, it } from "vitest";

import {
  clearFooterStatus,
  FOOTER_ACTIVE,
  FOOTER_PAUSED,
  FOOTER_PULSE,
  footerEventText,
  footerText,
  setFooterStatus,
} from "./footer.js";

describe("XpiMemo footer", () => {
  it("renders active, pulse, and paused copy", () => {
    expect(footerText(false)).toBe(FOOTER_ACTIVE);
    expect(footerText(false, true)).toBe(FOOTER_PULSE);
    expect(footerText(true, true)).toBe(FOOTER_PAUSED);
  });
  it("renders a bounded one-line event status (task 2.1)", () => {
    expect(
      footerEventText({
        injectedCount: 2,
        kind: "injected",
        operationId: "abcdef123456",
        scope: "global",
        sourceRef: "x",
        timestamp: "t",
      }),
    ).toBe(`${FOOTER_ACTIVE} · injected ×2 global #abcdef`);
  });
  it("swallows writes to a stale ctx instead of crashing the process", async () => {
    const ctx = {
      get ui(): never {
        throw new Error(
          "This extension ctx is stale after session replacement or reload.",
        );
      },
    } as unknown as Parameters<typeof setFooterStatus>[0];

    setFooterStatus(ctx, false, true);
    clearFooterStatus(ctx);
    // The deferred pulse write is what actually crashed pi: it fires after
    // the session was replaced, so it must be a no-op.
    await new Promise((resolve) => setTimeout(resolve, 1_100));
  });
});
