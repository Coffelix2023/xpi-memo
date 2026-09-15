import { describe, expect, it } from "vitest";

import {
  FOOTER_ACTIVE,
  FOOTER_PAUSED,
  FOOTER_PULSE,
  footerEventText,
  footerText,
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
});
