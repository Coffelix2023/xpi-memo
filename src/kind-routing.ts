import type { XpiMemoConfig } from "./config.js";
import type { MemoryKind } from "./kinds.js";

import type { KindAdmissionPolicy } from "./types.js";

/**
 * Kind-level admission policy (change candidate-admission-autopilot,
 * tasks 2.1/2.2). tool-verify = verify with a tool before storing;
 * accumulate = evidence accumulation (reserved, not implemented this round);
 * manual-confirm = the existing Store/Later/Reject queue.
 */
export const KIND_ADMISSION_POLICIES: Readonly<
  Record<MemoryKind, KindAdmissionPolicy>
> = {
  global_preference: "accumulate",
  global_workflow: "manual-confirm",
  project_constraint: "tool-verify",
  project_decision: "manual-confirm",
  project_gene: "tool-verify",
  project_gotcha: "manual-confirm",
  session_context: "manual-confirm",
};

/**
 * Resolve the admission policy for a kind. Setting `XPI_MEMO_AUTO_VERIFY`
 * to `false` (or `0`) disables every tool-verification path globally and
 * routes all kinds to manual confirmation (task 2.3) — the kill switch for
 * rolling the auto-admission path back.
 */
export function getAdmissionPolicy(
  kind: MemoryKind,
  env: NodeJS.ProcessEnv = process.env,
): KindAdmissionPolicy {
  const override = env.XPI_MEMO_AUTO_VERIFY;
  if (override === "false" || override === "0") return "manual-confirm";
  return KIND_ADMISSION_POLICIES[kind];
}

/**
 * Auto-admission rollout (change optimize-offline-extraction-and-auto-admit,
 * design Decision 2). The kill switch wins; an explicitly set
 * `XPI_MEMO_AUTO_ADMIT` then decides on its own, so an env value never mixes
 * with the config file. Unset falls back to `config.autoAdmit`, which the
 * config file defaults to `true`.
 */
export function autoAdmitEnabled(
  config: XpiMemoConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const override = env.XPI_MEMO_AUTO_VERIFY;
  if (override === "false" || override === "0") return false;
  if (env.XPI_MEMO_AUTO_ADMIT !== undefined) return env.XPI_MEMO_AUTO_ADMIT === "true";
  return config.autoAdmit;
}
