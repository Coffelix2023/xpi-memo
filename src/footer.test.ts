import { describe, expect, it } from "vitest";

import { FOOTER_ACTIVE, FOOTER_PAUSED, FOOTER_PULSE, footerText } from "./footer.js";

describe("XpiMemo footer", () => {
  it("renders active, pulse, and paused copy", () => {
    expect(footerText(false)).toBe(FOOTER_ACTIVE);
    expect(footerText(false, true)).toBe(FOOTER_PULSE);
    expect(footerText(true, true)).toBe(FOOTER_PAUSED);
  });
});
