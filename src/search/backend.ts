/**
 * Pluggable search backend abstraction (Tasks 11.1-11.2, design Decision 5).
 *
 * One interface, three implementations: mnemosyne (vector/FTS5 via its CLI),
 * ripgrep (full-text over Markdown exports + JSONL logs), qmd (semantic via
 * external CLI). T1 recall works identically regardless of the active backend.
 */

import { spawnSync } from "node:child_process";

import type { MemoryKind } from "../kinds.js";

/** T1 memory scopes; mapped to backend-specific targets by each backend. */
export type SearchScope = "global" | "project" | "session";

export interface SearchQuery {
  limit: number;
  query: string;
  scope: SearchScope;
  /** Current L0 session id; used to isolate session-scoped rows (task 2.3). */
  sessionId?: string;
}

/**
 * Backend-agnostic result. Each result includes content, score, and source
 * metadata; backends may add kind when they can decode it.
 */
export interface SearchResult {
  /** Confidence (0-1) when the backend reports one, e.g. mnemosyne `importance` (task 5.3). */
  confidence?: number;
  content: string;
  /** Real backend memory ID when the result is deletable (Mnemosyne only). */
  id?: string;
  kind?: MemoryKind | null;
  /** Canonical semantic scope derived from kind metadata (task 2.4). */
  scope?: "global" | "project" | "session";
  /** Relevance score in the backend's own scale; callers interpret quality per result. */
  score: number;
  /** Where the match came from. */
  /** L0 session discriminator when the row is session-scoped (task 2.3). */
  sessionId?: string;
  source: {
    /** mnemosyne bank name, when applicable */
    bank?: string;
    /** file path (ripgrep hit, qmd file, JSONL log) */
    path?: string;
    /** L0 event position for JSONL matches */
    position?: number;
  };
  /** Non-null when the backend reports this memory as superseded (task 5.3). */
  supersededBy?: string | null;
  /** ISO timestamp of the memory, when the backend reports one (recency ranking). */
  timestamp?: string;
}

/**
 * Feature + health report used by availability checks and status output.
 */
export interface BackendCapabilities {
  /** BM25 / full-text matching */
  fullText: boolean;
  /** Is the underlying CLI/tool present and functional? */
  installed: boolean;
  /** Embedding-based semantic matching */
  semantic: boolean;
  /** Vector matching distinct from semantic reranking */
  vector: boolean;
}

export interface SearchBackend {
  capabilities(): BackendCapabilities;
  isAvailable(): Promise<boolean>;
  name: string;
  /**
   * Bank names this backend would query for the given scope, independent of
   * results. Reported as queriedBanks even when the search returns empty
   * (spec: recall observability). Backends without bank semantics omit it.
   */
  plannedBanks?(query: SearchQuery): string[];
  search(query: SearchQuery): Promise<SearchResult[]>;
}

/**
 * Reason a preferred backend was skipped, surfaced in status reporting and
 * fallback warnings (spec: fallback tracking).
 */
export interface BackendAttempt {
  backend: string;
  error?: string;
  ok: boolean;
}

/** Canonical fallback chain: configured → mnemosyne → ripgrep → qmd. */
export const BACKEND_FALLBACK_CHAIN = [
  "mnemosyne",
  "ripgrep",
  "qmd",
] as const;

export type BackendName = (typeof BACKEND_FALLBACK_CHAIN)[number];

export function isBackendName(value: unknown): value is BackendName {
  return (
    typeof value === "string" &&
    (BACKEND_FALLBACK_CHAIN as readonly string[]).includes(value)
  );
}

/** Metric recorded after every executed search (spec: query latency tracking). */
export interface BackendMetric {
  backend: string;
  durationMs: number;
  resultCount: number;
  timestamp: string;
}

/** True when a tool is on PATH. Availability is cached per process. */
export function isCommandInstalled(command: string): boolean {
  const cached = whichCache.get(command);
  if (cached !== undefined) return cached;
  let found = false;
  try {
    found =
      spawnSync(
        "which",
        [
          command,
        ],
        {
          encoding: "utf8",
        },
      ).status === 0;
  } catch {
    found = false;
  }
  whichCache.set(command, found);
  return found;
}

// ponytail: availability cached per process; restart picks up new installs.
// Clear via refreshCommandCache() when installing mid-session.
const whichCache = new Map<string, boolean>();

export function refreshCommandCache(command?: string): void {
  if (command) whichCache.delete(command);
  else whichCache.clear();
}
