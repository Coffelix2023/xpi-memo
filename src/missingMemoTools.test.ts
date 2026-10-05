import { describe, expect, it } from "vitest";
import { missingMemoTools } from "./index.ts";

describe("missingMemoTools", () => {
  it("returns every memo tool when nothing is active", () => {
    expect(missingMemoTools([])).toHaveLength(8);
  });

  it("returns only the dormant tools when residents are active", () => {
    const missing = missingMemoTools([
      "read",
      "bash",
      "xpi_memo_remember",
      "xpi_memo_recall",
      "xpi_memo_feedback",
    ]);
    expect(missing).toEqual([
      "xpi_memo_dna_write",
      "xpi_memo_forget",
      "xpi_memo_init",
      "xpi_memo_show_injected",
      "xpi_memo_sleep",
    ]);
  });

  it("returns empty when all memo tools are already active (idempotent)", () => {
    expect(
      missingMemoTools([
        ...Object.values({
          dna: "xpi_memo_dna_write",
          feedback: "xpi_memo_feedback",
          forget: "xpi_memo_forget",
          init: "xpi_memo_init",
          injected: "xpi_memo_show_injected",
          recall: "xpi_memo_recall",
          remember: "xpi_memo_remember",
          sleep: "xpi_memo_sleep",
        }),
      ]),
    ).toEqual([]);
  });
});
