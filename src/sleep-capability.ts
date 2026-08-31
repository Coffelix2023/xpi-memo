export interface SleepCapabilityInspection {
  commandHelp: string;
  sourceSummary: string;
}

const SLEEP_COMMAND_PATTERN = /^\s*sleep\s+/m;
export interface SleepCapabilityResult {
  dedicatedModelSupported: false;
  reason:
    | "upstream-sleep-command-unavailable"
    | "upstream-sleep-has-no-independent-model-entrypoint";
  sleepCommandSupported: boolean;
}

function hasSleepCommand(commandHelp: string): boolean {
  return SLEEP_COMMAND_PATTERN.test(commandHelp);
}
// T1 never exposes a dedicated sleep model: the upstream independent-model
// contract is unverified end to end, so only sleep-command presence is detected.
export function inspectSleepCapability(
  inspection: SleepCapabilityInspection,
): SleepCapabilityResult {
  if (!hasSleepCommand(inspection.commandHelp)) {
    return {
      dedicatedModelSupported: false,
      reason: "upstream-sleep-command-unavailable",
      sleepCommandSupported: false,
    };
  }

  return {
    dedicatedModelSupported: false,
    reason: "upstream-sleep-has-no-independent-model-entrypoint",
    sleepCommandSupported: true,
  };
}
