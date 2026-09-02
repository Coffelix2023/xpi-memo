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
  "rejection",
  "recall",
  "fallback",
  "sleep-authorization",
  "cross-layer-promotion",
  "extraction",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditMetadata {
  /** Search backend name that executed the recall (task 5.6). */
  backend?: string;
  bank?: string;
  confidence?: number;
  evidenceType?: EvidenceType;
  fallback?: boolean;
  /** Number of results actually injected after ranking and budgets (task 5.6). */
  injectedCount?: number;
  kind?: string;
  reason?: string;
  /** Number of results the backend returned (task 5.6). */
  resultCount?: number;
  scope?: "global" | "session";
  status?: string;
  trigger?: string;
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
  "bank",
  "backend",
  "confidence",
  "evidenceType",
  "fallback",
  "injectedCount",
  "kind",
  "reason",
  "resultCount",
  "scope",
  "status",
  "trigger",
]);

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
    state.entries.push({
      action,
      metadata: safeMetadata(metadata),
      timestamp: new Date().toISOString(),
    });
    if (state.entries.length > limit)
      state.entries.splice(0, state.entries.length - limit);
    saveState(statePath, state);
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
