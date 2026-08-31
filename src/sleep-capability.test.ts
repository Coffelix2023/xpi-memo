import { describe, expect, it } from "vitest";

import {
  inspectSleepCapability,
  type SleepCapabilityInspection,
} from "./sleep-capability.js";

describe("Mnemosyne sleep capability", () => {
  it("records that the installed CLI has sleep but no independent sleep model", () => {
    const inspection: SleepCapabilityInspection = {
      commandHelp: "sleep                                  Run consolidation",
      sourceSummary: "BeamMemory.sleep uses the configured global LLM path.",
    };

    expect(inspectSleepCapability(inspection)).toEqual({
      dedicatedModelSupported: false,
      reason: "upstream-sleep-has-no-independent-model-entrypoint",
      sleepCommandSupported: true,
    });
  });

  it("does not mistake reindex model support for sleep model support", () => {
    const result = inspectSleepCapability({
      commandHelp: "sleep Run consolidation\nreindex --model NAME",
      sourceSummary: "The --model flag belongs to reindex.",
    });

    expect(result.sleepCommandSupported).toBe(true);
    expect(result.dedicatedModelSupported).toBe(false);
  });

  it("reports unsupported capability when sleep is absent", () => {
    expect(
      inspectSleepCapability({
        commandHelp: "stats Show statistics",
        sourceSummary: "No sleep entrypoint is available.",
      }),
    ).toEqual({
      dedicatedModelSupported: false,
      reason: "upstream-sleep-command-unavailable",
      sleepCommandSupported: false,
    });
  });
});
