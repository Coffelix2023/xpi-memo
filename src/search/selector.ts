/**
 * Backend selection with fallback chain (Tasks 11.3-11.5).
 *
 * Order: configured → mnemosyne → ripgrep → qmd → empty results with warning.
 * A backend that is unavailable (or throws mid-search) is recorded as a failed
 * attempt and the next candidate runs; metrics are recorded per executed query.
 */

import type {
  BackendAttempt,
  BackendMetric,
  BackendName,
  SearchBackend,
  SearchQuery,
  SearchResult,
} from "./backend.js";

export interface BackendRegistry {
  /** All known backends by name, in fallback order. */
  all(): SearchBackend[];
  get(name: BackendName): SearchBackend | undefined;
}

export interface SelectResult {
  attempts: BackendAttempt[];
  backend: SearchBackend | null;
}

export interface SearchOutcome {
  attempts: BackendAttempt[];
  /** null when no backend produced results (spec: no backend available) */
  backendName: string | null;
  results: SearchResult[];
  warning?: string;
}

export interface RunSearchOptions {
  /** Preferred backend from config; tried before the canonical chain. */
  preferred?: BackendName;
}

/** Cumulative metrics for observability; kept per selector instance. */
export class BackendMetrics {
  private readonly entries: BackendMetric[] = [];

  record(metric: BackendMetric): void {
    this.entries.push(metric);
  }

  list(): readonly BackendMetric[] {
    return this.entries;
  }

  last(): BackendMetric | null {
    return this.entries.at(-1) ?? null;
  }
}

/**
 * Try the preferred backend first, then every other backend in canonical
 * order. Returns the first available backend; unavailable/erroring backends
 * are recorded in attempts.
 */
export async function selectBackend(
  registry: BackendRegistry,
  options: RunSearchOptions = {},
): Promise<SelectResult> {
  const attempts: BackendAttempt[] = [];
  const ordered: SearchBackend[] = [];
  if (options.preferred) {
    const preferred = registry.get(options.preferred);
    if (preferred) ordered.push(preferred);
  }
  for (const backend of registry.all())
    if (!ordered.includes(backend)) ordered.push(backend);

  for (const backend of ordered) {
    let available = false;
    try {
      available = await backend.isAvailable();
    } catch (error) {
      attempts.push({
        backend: backend.name,
        error: error instanceof Error ? error.message : "availability-check-failed",
        ok: false,
      });
      continue;
    }
    if (!available) {
      attempts.push({
        backend: backend.name,
        ok: false,
      });
      continue;
    }
    attempts.push({
      backend: backend.name,
      ok: true,
    });
    return {
      attempts,
      backend,
    };
  }
  return {
    attempts,
    backend: null,
  };
}

export function createSearchRunner(registry: BackendRegistry, metrics: BackendMetrics) {
  return async function runSearch(
    query: SearchQuery,
    options: RunSearchOptions = {},
  ): Promise<SearchOutcome> {
    const { attempts, backend } = await selectBackend(registry, options);
    if (!backend) {
      return {
        attempts,
        backendName: null,
        results: [],
        warning:
          "no search backend available — recall returned empty; install mnemosyne (uv tool install mnemosyne-memory) or ripgrep, or configure xpi_memo.searchBackend",
      };
    }
    const started = Date.now();
    try {
      const results = await backend.search(query);
      metrics.record({
        backend: backend.name,
        durationMs: Date.now() - started,
        resultCount: results.length,
        timestamp: new Date().toISOString(),
      });
      return {
        attempts,
        backendName: backend.name,
        results,
      };
    } catch (error) {
      // Spec: backend failure isolation — record and continue down the chain.
      attempts.push({
        backend: backend.name,
        error: error instanceof Error ? error.message : "search-failed",
        ok: false,
      });
      for (const next of registry.all()) {
        if (next.name === backend.name) continue;
        let nextAvailable = false;
        try {
          nextAvailable = await next.isAvailable();
        } catch {
          nextAvailable = false;
        }
        if (!nextAvailable) {
          attempts.push({
            backend: next.name,
            ok: false,
          });
          continue;
        }
        attempts.push({
          backend: next.name,
          ok: true,
        });
        const nextStarted = Date.now();
        try {
          const results = await next.search(query);
          metrics.record({
            backend: next.name,
            durationMs: Date.now() - nextStarted,
            resultCount: results.length,
            timestamp: new Date().toISOString(),
          });
          return {
            attempts,
            backendName: next.name,
            results,
            warning: `backend ${backend.name} failed, fell back to ${next.name}`,
          };
        } catch (fallbackError) {
          attempts.push({
            backend: next.name,
            error:
              fallbackError instanceof Error ? fallbackError.message : "search-failed",
            ok: false,
          });
        }
      }
      return {
        attempts,
        backendName: null,
        results: [],
        warning: "all search backends failed — recall returned empty",
      };
    }
  };
}
