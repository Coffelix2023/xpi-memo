/**
 * Confidence calibration annotation (change add-typesafe-decision-hooks,
 * task 4.x).
 *
 * Calibration rewrites exactly one field — `confidence` — and marks where that
 * number came from. It deliberately does *not* add an evidence type and does
 * not touch `type`, so a calibrated value can never masquerade as an
 * `explicit-user-statement`, and the existing minimum-confidence preference is
 * the only consumer that has to change (it does not: it already reads
 * `confidence`).
 *
 * When calibration is off or the runner is unusable the record is returned
 * unchanged — not re-marked, not re-defaulted.
 */

import type { EvidenceRecord } from "../evidence.js";
import type { DecisionLedger } from "./observability.js";
import { noulProbability } from "./repeat-stability.js";
import { runDecision } from "./runner.js";
import type { DecisionRunner } from "./types.js";

/** Provenance suffix marking a calibrated confidence. */
export const CALIBRATION_MARK = "calibrated";

const CONFIDENCE_PROMPT =
  "Is this statement durable and worth remembering exactly as stated?";

/**
 * Pure annotation: clamp the calibrated value into `confidence` and append the
 * calibration mark to the provenance. `null` means "no calibration available",
 * which is the identity — never a re-default.
 */
export function applyCalibratedConfidence(
  evidence: EvidenceRecord,
  calibrated: number | null,
): EvidenceRecord {
  if (calibrated === null || !Number.isFinite(calibrated)) return evidence;
  const confidence = Math.min(1, Math.max(0, calibrated));
  const marked = `${evidence.provenance}+${CALIBRATION_MARK}`;
  return {
    ...evidence,
    confidence,
    provenance: evidence.provenance.endsWith(`+${CALIBRATION_MARK}`)
      ? evidence.provenance
      : marked,
    // `type` is intentionally untouched: calibration is a confidence source,
    // not an evidence classification.
  };
}

export interface CalibrationOptions {
  enabled: boolean;
  ledger?: DecisionLedger;
  runner?: DecisionRunner;
  timeoutMs?: number;
}

/**
 * Ask once for a calibrated confidence in a statement. Never throws: a
 * disabled or failing runner returns the original record, so the candidate
 * pipeline behaves exactly as before the feature existed.
 */
export async function calibrateEvidenceConfidence(
  evidence: EvidenceRecord,
  content: string,
  options: CalibrationOptions,
): Promise<EvidenceRecord> {
  if (!options.enabled) return evidence;
  options.ledger?.recordCall("calibration");
  const result = await runDecision({
    enabled: true,
    questions: [
      {
        id: "confidence",
        primitive: "noul",
        prompt: CONFIDENCE_PROMPT,
        options: [
          "no",
          "yes",
        ],
      },
    ],
    ...(options.runner
      ? {
          runner: options.runner,
        }
      : {}),
    state: JSON.stringify({
      statement: content,
    }),
    ...(options.timeoutMs === undefined
      ? {}
      : {
          timeoutMs: options.timeoutMs,
        }),
  });
  if (result.status !== "completed") {
    options.ledger?.recordFailure();
    return evidence;
  }
  const answer = result.output.answers[0];
  if (!answer) {
    options.ledger?.recordFailure();
    return evidence;
  }
  return applyCalibratedConfidence(
    evidence,
    noulProbability(answer.value, answer.confidence),
  );
}
