import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { EvidenceType } from "./evidence.js";

export const AUDIT_ACTIONS = [
  "write",
  "candidate",
  "confirmation",
  "deletion",
  "rejection",
  "recall",
  "fallback",
  "feedback",
  "sleep-authorization",
  "cross-layer-promotion",
  "extraction",
  "tool-verified",
  "tool-verification-failed",
  "candidate-auto-admitted",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditMetadata {
  /** Search backend name that executed the recall (task 5.6). */
  backend?: string;
  bank?: string;
  /** Bounded recall safety diagnostics; never memory bodies. */
  blockedCount?: number;
  /** Bounded offline-extraction proposal counters; never memory bodies. */
  budgetRejectedCount?: number;
  candidateCount?: number;
  candidateId?: string;
  /** Bounded exact-ID read capability verdict (change memory-forget-exact-id):
   * a reason code, never a memory body. */
  capability?: string;
  confidence?: number;
  /** Admission decision (stabilize change, task 4.1): pending / shadow-verified / auto-stored. */
  decision?: string;
  evidenceType?: EvidenceType;
  /** Bounded verbatim excerpt of a verified repository fact (stabilize change, task 4.1). */
  excerpt?: string;
  fallback?: boolean;
  /** Body-free explicit/passive feedback classification. */
  feedback?: string;
  feedbackMode?: "explicit" | "passive";
  /** Bounded rg anchor of a tool-verified auto-store (task 7.1). */
  filePath?: string;
  /** Environment identity state at the failure boundary (task 3.1):
   * git / initialized-local / uninitialized / unknown. */
  identity?: string;
  /** Number of results actually injected after ranking and budgets (task 5.6). */
  injectedCount?: number;
  invalidProposals?: number;
  kind?: string;
  /** 1-based line number of a verified repository fact (stabilize change, task 4.1). */
  line?: number;
  matchedLine?: string;
  memoryId?: string;
  /** Actual sleep execution mode (task 3.4): dedicated / session-model / mechanical / none / disabled. */
  mode?: string;
  omittedCount?: number;
  /** Correlates a bounded lifecycle outcome without storing memory content. */
  operationId?: string;
  /** Bounded outcome of a failed operation (task 3.1): rejected / degraded. */
  outcome?: string;
  policyVersion?: string;
  proposalsTotal?: number;
  reason?: string;
  rejectedCount?: number;
  replacementMemoryId?: string;
  /** Number of results the backend returned (task 5.6). */
  resultCount?: number;
  safetyReasons?: string[];
  /** Canonical semantic scope (task 1.2): global / project / session. */
  scope?: "global" | "project" | "session";
  status?: string;
  storedCount?: number;
  supersedes?: string;
  targetMemoryId?: string;
  trigger?: string;
  usage?: "recalled" | "injected";
  validProposals?: number;
}

export interface AuditEntry {
  action: AuditAction;
  metadata: AuditMetadata;
  timestamp: string;
}

interface AuditState {
  entries: AuditEntry[];
  version: 1;
}

export interface AuditLog {
  list(): AuditEntry[];
  record(action: AuditAction, metadata?: AuditMetadata): void;
}

interface CreateAuditLogOptions {
  maxEntries?: number;
  statePath: string;
}

const DEFAULT_MAX_ENTRIES = 200;
const ALLOWED_METADATA_KEYS = new Set([
  "backend",
  "decision",
  "excerpt",
  "line",
  "operationId",
  "bank",
  "budgetRejectedCount",
  "candidateCount",
  "candidateId",
  "confidence",
  "evidenceType",
  "fallback",
  "filePath",
  "matchedLine",
  "identity",
  "feedback",
  "feedbackMode",
  "injectedCount",
  "blockedCount",
  "invalidProposals",
  "kind",
  "mode",
  "outcome",
  "proposalsTotal",
  "reason",
  "rejectedCount",
  "memoryId",
  "replacementMemoryId",
  "supersedes",
  "targetMemoryId",
  "usage",
  "omittedCount",
  "policyVersion",
  "safetyReasons",
  "capability",
  "resultCount",
  "scope",
  "status",
  "storedCount",
  "validProposals",
  "trigger",
]);

import { defaultMemoryEventBus, toMemoryEvent } from "./event-stream.js";

function emptyState(): AuditState {
  return {
    entries: [],
    version: 1,
  };
}

function loadState(path: string): AuditState {
  if (!existsSync(path)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<AuditState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return emptyState();
    const entries = parsed.entries.filter(
      (entry): entry is AuditEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof entry.action === "string" &&
        AUDIT_ACTIONS.includes(entry.action as AuditAction) &&
        typeof entry.metadata === "object" &&
        entry.metadata !== null &&
        typeof entry.timestamp === "string",
    );
    return {
      entries,
      version: 1,
    };
  } catch {
    return emptyState();
  }
}

function saveState(path: string, state: AuditState): void {
  mkdirSync(dirname(path), {
    mode: 0o700,
    recursive: true,
  });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort on platforms without POSIX permissions.
  }
}

function safeMetadata(metadata: AuditMetadata): AuditMetadata {
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => ALLOWED_METADATA_KEYS.has(key)),
  ) as AuditMetadata;
}

export function createAuditLog({
  maxEntries = DEFAULT_MAX_ENTRIES,
  statePath,
}: CreateAuditLogOptions): AuditLog {
  const state = loadState(statePath);
  const limit =
    Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : DEFAULT_MAX_ENTRIES;

  function record(action: AuditAction, metadata: AuditMetadata = {}): void {
    const entry: AuditEntry = {
      action,
      metadata: safeMetadata(metadata),
      timestamp: new Date().toISOString(),
    };
    state.entries.push(entry);
    if (state.entries.length > limit)
      state.entries.splice(0, state.entries.length - limit);
    saveState(statePath, state);
    // Body-free event projection (tasks 1.2/1.3): audit stays the durable
    // provenance record; the bus is presentation-only and fail-open.
    const event = toMemoryEvent(entry);
    if (event) defaultMemoryEventBus().emit(event);
  }

  function list(): AuditEntry[] {
    return state.entries.map((entry) => ({
      action: entry.action,
      timestamp: entry.timestamp,
      metadata: {
        ...entry.metadata,
      },
    }));
  }

  return {
    list,
    record,
  };
}
