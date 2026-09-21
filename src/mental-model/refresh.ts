/**
 * Refresh coordinator (change add-mental-model-projections, task 3.4).
 *
 * Walks the enabled definitions and refreshes exactly the ones that need it:
 * stale/absent, with safe non-empty sources, within the per-session budgets,
 * and never already attempted for the same digest. Every result is a bounded,
 * body-free `MentalModelRefreshResult`, so status output can distinguish "no
 * refresh needed" from "disabled" from "refused" without ever seeing a body.
 *
 * Atomic-commit rule: the successful digest advances only after the projection
 * file was written and validated; every failure preserves the old content and
 * leaves the same uncommitted source changes eligible on the next trigger.
 */

import type { BankStateReader } from "../markdown-export/bank-state.js";
import { deriveMentalModelState, isMentalModelRefreshEligible } from "./freshness.js";
import { type MentalModelSourceMemo, mentalModelMemoKey } from "./memo.js";
import { mentalModelOwnerBank, resolveMentalModelTarget } from "./owner.js";
import type {
  MentalModelRefreshLedger,
  MentalModelRefreshLedgerLimits,
} from "./refresh-ledger.js";
import { readMentalModelSources } from "./sources.js";
import {
  readMentalModelProjection,
  recordMentalModelFailure,
  writeMentalModelProjection,
} from "./store.js";
import {
  type MentalModelSynthesisRunner,
  type MentalModelSynthesisStatus,
  runMentalModelSynthesis,
} from "./synthesis.js";
import {
  DEFAULT_MENTAL_MODEL_TIMEOUT_MS,
  digestPrefix,
  MENTAL_MODEL_BUDGETS,
  type MentalModelDefinition,
  type MentalModelFailureCategory,
  type MentalModelRefreshOutcome,
  type MentalModelRefreshResult,
  type MentalModelState,
} from "./types.js";

export interface MentalModelRefreshContext {
  dataDir: string;
  /** All built-in definitions, in registry order. */
  definitions: readonly MentalModelDefinition[];
  /** Diagnosis-only generator metadata stored on a successful projection. */
  generator?: {
    model?: string;
    provider?: string;
  };
  /** Effective per-definition enablement from configuration. */
  isDefinitionEnabled: (definitionId: string) => boolean;
  ledger: MentalModelRefreshLedger;
  limits: MentalModelRefreshLedgerLimits;
  memo: MentalModelSourceMemo;
  /** Canonical project bank, or null when no project identity is recognized. */
  projectBank: string | null;
  /** Bounded bank-export reader; never SQLite. */
  read: BankStateReader;
  /** Injected or session-model runner; absence is a bounded `unavailable`. */
  runner?: MentalModelSynthesisRunner;
  sessionId: string;
  signal?: AbortSignal;
  /** Master synthesis switch; `false` keeps freshness local. */
  synthesisEnabled: boolean;
}

const SYNTHESIS_FAILURE_CATEGORY: Record<
  Exclude<MentalModelSynthesisStatus, "completed" | "disabled" | "source-empty">,
  MentalModelFailureCategory
> = {
  aborted: "aborted",
  failed: "failed",
  "invalid-output": "invalid-output",
  refused: "refused",
  "runner-unavailable": "runner-unavailable",
  "timed-out": "timed-out",
  "unsafe-output": "unsafe-output",
};

function failureCategoryFor(
  status: MentalModelSynthesisStatus,
): MentalModelFailureCategory | null {
  if (status === "completed" || status === "disabled" || status === "source-empty")
    return null;
  return SYNTHESIS_FAILURE_CATEGORY[status];
}

function result(
  definition: MentalModelDefinition,
  outcome: MentalModelRefreshOutcome,
  options: {
    boundary: number | null;
    digest: string | null;
    durationMs: number;
    outputChars: number;
    ownerKey: string;
    scope: "global" | "project";
    sourceCount: number;
    state: MentalModelState;
  },
): MentalModelRefreshResult {
  return {
    definitionId: definition.id,
    digestPrefix: digestPrefix(options.digest),
    durationMs: options.durationMs,
    outcome,
    outputChars: options.outputChars,
    ownerKey: options.ownerKey,
    scope: options.scope,
    sourceBoundary: options.boundary,
    sourceCount: options.sourceCount,
    state: options.state,
  };
}

/**
 * Refresh every eligible definition. Never throws: a single definition's
 * failure is a bounded result, and the caller runs this as best-effort work.
 */
export async function refreshMentalModels(
  context: MentalModelRefreshContext,
): Promise<MentalModelRefreshResult[]> {
  const results: MentalModelRefreshResult[] = [];
  for (const definition of context.definitions) {
    const started = Date.now();
    const target = resolveMentalModelTarget({
      dataDir: context.dataDir,
      definition,
      projectBank: context.projectBank,
    });
    // Missing project identity: skip silently — never fall back to the global
    // bank or to another project's projection.
    if (!target) continue;

    const ownerKey = target.owner.key;
    const durationMs = () => Date.now() - started;

    // 1. Sources: memoized bounded bank read; the memo covers only successful
    // evaluations so a failed read is never served twice as a stale success.
    const memoKey = mentalModelMemoKey(ownerKey, definition.id);
    const cached = context.memo.get(context.sessionId, memoKey);
    const sourceRead = cached
      ? {
          evaluation: cached,
          ok: true as const,
        }
      : await readMentalModelSources({
          bank: mentalModelOwnerBank(target.owner),
          dataDir: context.dataDir,
          definition,
          owner: target.owner,
          read: context.read,
        });
    if (sourceRead.ok)
      context.memo.set(context.sessionId, memoKey, sourceRead.evaluation);

    // Digest/boundary/count for the early (non-running) outcomes: available
    // only when the bank read succeeded.
    const early = sourceRead.ok
      ? {
          boundary: sourceRead.evaluation.boundary,
          digest: sourceRead.evaluation.digest,
          sourceCount: sourceRead.evaluation.rows.length,
        }
      : {
          boundary: null as number | null,
          digest: null as string | null,
          sourceCount: 0,
        };

    const projectionRead = readMentalModelProjection(target.path);
    const projection = projectionRead.ok ? projectionRead.projection : null;
    const state = deriveMentalModelState({
      definition,
      enabled: context.synthesisEnabled && context.isDefinitionEnabled(definition.id),
      projection,
      readFailed: !sourceRead.ok || !projectionRead.ok,
      sourceDigest: early.digest,
    });

    if (state === "fresh") {
      results.push(
        result(definition, "no-refresh-needed", {
          ...early,
          durationMs: durationMs(),
          outputChars: 0,
          ownerKey,
          scope: target.owner.scope,
          state,
        }),
      );
      continue;
    }
    if (!context.synthesisEnabled) {
      results.push(
        result(definition, "synthesis-disabled", {
          ...early,
          durationMs: durationMs(),
          outputChars: 0,
          ownerKey,
          scope: target.owner.scope,
          state,
        }),
      );
      continue;
    }
    if (!context.isDefinitionEnabled(definition.id)) {
      results.push(
        result(definition, "definition-disabled", {
          ...early,
          durationMs: durationMs(),
          outputChars: 0,
          ownerKey,
          scope: target.owner.scope,
          state,
        }),
      );
      continue;
    }
    if (!sourceRead.ok) {
      // Bank state unknown: fail closed, preserve any previous projection.
      recordMentalModelFailure(target.path, {
        at: new Date().toISOString(),
        category: "source-read-failed",
        definition,
        ownerKey,
        scope: target.owner.scope,
      });
      results.push(
        result(definition, "source-read-failed", {
          ...early,
          durationMs: durationMs(),
          outputChars: 0,
          ownerKey,
          scope: target.owner.scope,
          state,
        }),
      );
      continue;
    }
    const evaluation = sourceRead.evaluation;
    if (!isMentalModelRefreshEligible(state) || evaluation.rows.length === 0) {
      results.push(
        result(definition, "source-empty", {
          boundary: evaluation.boundary,
          digest: evaluation.digest,
          durationMs: durationMs(),
          outputChars: 0,
          ownerKey,
          scope: target.owner.scope,
          sourceCount: evaluation.rows.length,
          state,
        }),
      );
      continue;
    }
    const digest = evaluation.digest;

    // 2. Budgets: one attempt per (definition, digest), shared session caps.
    if (!context.ledger.attemptAllowed(definition.id, digest, context.limits)) {
      const budgetExhausted =
        context.ledger.attempts() >= context.limits.maxAttemptsPerSession ||
        context.ledger.chars() >= context.limits.maxCharsPerSession;
      results.push(
        result(definition, budgetExhausted ? "budget-exhausted" : "already-attempted", {
          boundary: evaluation.boundary,
          digest,
          durationMs: durationMs(),
          outputChars: 0,
          ownerKey,
          scope: target.owner.scope,
          sourceCount: evaluation.rows.length,
          state,
        }),
      );
      continue;
    }

    // 3. One bounded synthesis. The attempt is recorded first so a hang or a
    // timeout still counts against this session's budget.
    context.ledger.recordAttempt(definition.id, digest, 0);
    const synthesis = await runMentalModelSynthesis({
      definition,
      enabled: true,
      maxInputChars: MENTAL_MODEL_BUDGETS.maxSourceChars,
      maxOutputChars: MENTAL_MODEL_BUDGETS.maxGeneratedChars,
      runner: context.runner,
      signal: context.signal,
      sources: evaluation.rows,
      timeoutMs: DEFAULT_MENTAL_MODEL_TIMEOUT_MS,
    });

    if (synthesis.status !== "completed") {
      const category = failureCategoryFor(synthesis.status);
      if (category)
        recordMentalModelFailure(target.path, {
          at: new Date().toISOString(),
          category,
          definition,
          ownerKey,
          scope: target.owner.scope,
        });
      // `disabled` cannot occur here (we always run with enabled: true), but
      // report it defensively as a failed outcome rather than a status lie.
      // `disabled` cannot occur here (we always run with enabled: true), but
      // report it defensively as a failed outcome rather than a status lie.
      let outcome: MentalModelRefreshOutcome;
      if (synthesis.status === "disabled") outcome = "failed";
      else if (synthesis.status === "refused") outcome = "safety-refused";
      else outcome = synthesis.status;
      results.push(
        result(definition, outcome, {
          boundary: evaluation.boundary,
          digest,
          durationMs: durationMs(),
          outputChars: synthesis.diagnostics.outputChars,
          ownerKey,
          scope: target.owner.scope,
          sourceCount: evaluation.rows.length,
          state: deriveMentalModelState({
            definition,
            enabled: true,
            projection,
            readFailed: false,
            sourceDigest: digest,
          }),
        }),
      );
      continue;
    }

    // 4. Commit atomically: only now does the successful digest advance.
    const now = new Date().toISOString();
    const write = writeMentalModelProjection(target.path, {
      content: synthesis.output.content,
      definitionId: definition.id,
      definitionVersion: definition.version,
      generatedAt: projection?.generatedAt ?? now,
      generator: {
        ...(context.generator?.model
          ? {
              model: context.generator.model,
            }
          : {}),
        ...(context.generator?.provider
          ? {
              provider: context.generator.provider,
            }
          : {}),
        policyVersion: "memory-boundary-v1",
      },
      lastAttempt: {
        at: now,
        outcome: "refreshed",
      },
      ownerKey,
      refreshedAt: now,
      scope: target.owner.scope,
      sourceBoundary: evaluation.boundary,
      sourceDigest: digest,
      sourceIds: synthesis.output.sourceIds,
      version: 1,
    });

    if (!write.ok) {
      recordMentalModelFailure(target.path, {
        at: now,
        category: "persist-failed",
        definition,
        ownerKey,
        scope: target.owner.scope,
      });
      results.push(
        result(definition, "persist-failed", {
          boundary: evaluation.boundary,
          digest,
          durationMs: durationMs(),
          outputChars: synthesis.diagnostics.outputChars,
          ownerKey,
          scope: target.owner.scope,
          sourceCount: evaluation.rows.length,
          state: "failed",
        }),
      );
      continue;
    }
    context.ledger.recordAttempt(
      definition.id,
      digest,
      synthesis.output.content.length,
    );
    results.push(
      result(definition, "refreshed", {
        boundary: evaluation.boundary,
        digest,
        durationMs: durationMs(),
        outputChars: synthesis.output.content.length,
        ownerKey,
        scope: target.owner.scope,
        sourceCount: evaluation.rows.length,
        state: "fresh",
      }),
    );
  }
  return results;
}
