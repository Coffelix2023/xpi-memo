import { randomUUID } from "node:crypto";
import { shouldAutoStore } from "./auto-store-policy.js";
import type { RoutingContext } from "./banks.js";
import type { EvidenceRecord } from "./evidence.js";
import type { MemoryKind } from "./kinds.js";
import { type PanelLanguage, panelText } from "./panel-text.js";
import { routeMemoryKind } from "./routing.js";
import type { RepositoryFact } from "./types.js";

const PENDING_CANDIDATE_REASONS = [
  "project-decision",
  "ambiguous-preference",
  "broad-gotcha",
  "cross-project-relevance",
  "high-impact-durable",
] as const;

/**
 * The fixed reasons a candidate can carry.
 *
 * The sentence is what lands in `candidates.json`, and `rationaleText` localizes
 * it at render time. A producer and the lookup are bound to the same constant
 * rather than to two copies of the text, so the queue and the dictionary cannot
 * drift apart.
 */
export const RATIONALE_T1_GOVERNANCE =
  "This memory requires T1 write governance before persistence.";
export const RATIONALE_REPO_IMPORT =
  "Imported from repository Markdown; requires T1 write governance.";
export const RATIONALE_OFFLINE_EXTRACTION =
  "Proposed by offline extraction; requires T1 write governance.";
export const RATIONALE_USER_STATED = "The user stated this as a durable preference.";

/** Which dictionary key each fixed reason renders as. */
const RATIONALE_KEYS: Readonly<Record<string, string>> = {
  [RATIONALE_OFFLINE_EXTRACTION]: "rationale.offlineExtraction",
  [RATIONALE_REPO_IMPORT]: "rationale.repoImport",
  [RATIONALE_T1_GOVERNANCE]: "rationale.t1Governance",
  [RATIONALE_USER_STATED]: "rationale.userStated",
};

/**
 * A candidate's reason, in the panel's language.
 *
 * A rationale the table does not know — one written by an older build, or by a
 * producer that never adopted a constant — renders as stored rather than as a
 * missing key: the queue is a record of what happened, not a template.
 */
export function rationaleText(rationale: string, language: PanelLanguage): string {
  const key = RATIONALE_KEYS[rationale];
  return key === undefined ? rationale : panelText(key, language);
}

export type PendingCandidateReason = (typeof PENDING_CANDIDATE_REASONS)[number];

export interface PendingCandidateInput {
  /** Force candidate creation even when the auto-store policy would store directly. */
  allowAutoStore?: boolean;
  content: string;
  context: RoutingContext;
  evidence: EvidenceRecord;
  explicitStable?: boolean;
  kind: MemoryKind;
  rationale: string;
  reason: PendingCandidateReason;
  /** Structured repository-fact declaration (offline extraction only). */
  repositoryFact?: RepositoryFact;
}

export interface PendingCandidate {
  /** Set when the record was archived; absent on records written earlier. */
  archivedAt?: string;
  conflictState: "none" | "reported";
  content: string;
  createdAt: string;
  evidence: EvidenceRecord;
  evidenceSummary: string;
  /**
   * Retention deadline, only meaningful together with the archived status.
   * Stored on the record so a later configuration change never re-times an
   * entry that was already archived.
   */
  expiresAt?: string;
  id: string;
  kind: MemoryKind;
  rationale: string;
  reason: PendingCandidateReason;
  /** Structured repository-fact declaration carried to the verifier. */
  repositoryFact?: RepositoryFact;
  status: "archived" | "pending";
  targetBank: string;
  targetScope: "global" | "project" | "session";
}

export function evidenceSummary(evidence: EvidenceRecord): string {
  return `${evidence.type} from ${evidence.source} (${evidence.provenance})`;
}

export function generatePendingCandidate(
  input: PendingCandidateInput,
): PendingCandidate | null {
  if (
    input.allowAutoStore !== false &&
    shouldAutoStore({
      contentLength: input.content.length,
      evidence: input.evidence,
      explicitStable: input.explicitStable,
      kind: input.kind,
    })
  ) {
    return null;
  }

  const route = routeMemoryKind(input.kind, input.context);
  return {
    conflictState: "none",
    content: input.content,
    createdAt: new Date().toISOString(),
    evidence: input.evidence,
    evidenceSummary: evidenceSummary(input.evidence),
    id: randomUUID(),
    kind: input.kind,
    rationale: input.rationale,
    reason: input.reason,
    ...(input.repositoryFact
      ? {
          repositoryFact: input.repositoryFact,
        }
      : {}),
    status: "pending",
    targetBank: route.bank,
    targetScope: route.scope,
  };
}
