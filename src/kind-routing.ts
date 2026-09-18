import {
  type AdmissionEvidenceFloor,
  type AdmissionSourceScope,
  autoAdmitFromEnv,
  type XpiMemoConfig,
} from "./config.js";
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
 * Resolved admission preferences (change
 * admission-preferences-and-pending-rescan): the per-kind switches plus the
 * scalar floors. `loadConfig` already applied environment-over-config
 * precedence, so these are the effective values.
 */
export interface AdmissionPreferences {
  allowKinds: Readonly<Record<MemoryKind, boolean>>;
  evidenceFloor: AdmissionEvidenceFloor;
  maxAgeDays: number;
  minConfidence: number;
  sourceScope: AdmissionSourceScope;
}

/**
 * Project a loaded config onto the admission preferences. The defaults are the
 * config defaults, which are liberal: every kind admits unless the user turns
 * it off. `KIND_ADMISSION_POLICIES` no longer gates admission — it now only
 * decides whether a kind runs repository-fact verification.
 */
export function admissionPreferences(config: XpiMemoConfig): AdmissionPreferences {
  return {
    evidenceFloor: config.admissionEvidenceFloor,
    maxAgeDays: config.admissionMaxAgeDays,
    minConfidence: config.admissionMinConfidence,
    sourceScope: config.admissionSourceScope,
    allowKinds: {
      global_preference: config.admissionAllowGlobalPreference,
      global_workflow: config.admissionAllowGlobalWorkflow,
      project_constraint: config.admissionAllowProjectConstraint,
      project_decision: config.admissionAllowProjectDecision,
      project_gene: config.admissionAllowProjectGene,
      project_gotcha: config.admissionAllowProjectGotcha,
      session_context: config.admissionAllowSessionContext,
    },
  };
}

/**
 * Auto-admission rollout (change optimize-offline-extraction-and-auto-admit,
 * design Decision 2). The kill switch wins; an explicitly set
 * `XPI_MEMO_AUTO_ADMIT` then decides on its own, so an env value never mixes
 * with the config file. Unset falls back to `config.autoAdmit`, which the
 * config file defaults to `true`.
 *
 * Parsing goes through `autoAdmitFromEnv`, the same helper `loadConfig` uses,
 * so the settings panel value and this decision cannot disagree.
 *
 * With the rollout on, `kind` narrows the decision to that kind's preference;
 * omitting it reports the rollout itself. The full precedence is therefore:
 * kill switch → explicit environment → config file → per-kind preference.
 */
export function autoAdmitEnabled(
  config: XpiMemoConfig,
  env: NodeJS.ProcessEnv = process.env,
  kind?: MemoryKind,
): boolean {
  const override = env.XPI_MEMO_AUTO_VERIFY;
  if (override === "false" || override === "0") return false;
  const rollout = autoAdmitFromEnv(env.XPI_MEMO_AUTO_ADMIT) ?? config.autoAdmit;
  if (!rollout) return false;
  if (kind === undefined) return true;
  return admissionPreferences(config).allowKinds[kind];
}
