/**
 * Search registry assembly (Tasks 13.1, 13.4): builds backends from config +
 * routing context and exposes them for selection and status reporting.
 */

import type { RoutingContext } from "../banks.js";
import type { SearchBackendSetting } from "../config.js";
import type { BackendName, SearchQuery } from "./backend.js";
import { isBackendName } from "./backend.js";
import { MnemosyneBackend } from "./mnemosyne-backend.js";
import { QmdBackend } from "./qmd-backend.js";
import { RipgrepBackend } from "./ripgrep-backend.js";
import type { BackendRegistry, RunSearchOptions, SearchOutcome } from "./selector.js";
import { BackendMetrics, createSearchRunner } from "./selector.js";

export interface SearchRuntime {
  metrics: BackendMetrics;
  /** Preferred backend from config ("auto" → undefined = chain order). */
  preferred: BackendName | undefined;
  registry: BackendRegistry;
  runSearch(query: SearchQuery, options?: RunSearchOptions): Promise<SearchOutcome>;
}

export function backendNames(setting: SearchBackendSetting): BackendName[] {
  if (setting === "auto")
    return [
      "mnemosyne",
      "ripgrep",
      "qmd",
    ];
  const rest = (
    [
      "mnemosyne",
      "ripgrep",
      "qmd",
    ] as BackendName[]
  ).filter((name) => name !== setting);
  return [
    setting,
    ...rest,
  ];
}

/** Mnemosyne CLI runner; injectable for tests. */
export type MnemosyneRun = (
  args: string[],
  options?: {
    bank?: string;
    dataDir?: string;
  },
) => Promise<string>;

export function createSearchRuntime(
  context: RoutingContext,
  setting: SearchBackendSetting,
  runMnemosyne: MnemosyneRun,
  qmdCollections: string[] = [],
): SearchRuntime {
  const metrics = new BackendMetrics();
  const byName = new Map<string, MnemosyneBackend | RipgrepBackend | QmdBackend>();
  byName.set("mnemosyne", new MnemosyneBackend(context, runMnemosyne));
  byName.set("ripgrep", new RipgrepBackend(context.dataDir));
  byName.set("qmd", new QmdBackend(qmdCollections));
  const names = backendNames(setting);
  const registry: BackendRegistry = {
    all: () =>
      names
        .map((name) => byName.get(name))
        .filter((backend): backend is MnemosyneBackend | RipgrepBackend | QmdBackend =>
          Boolean(backend),
        ),
    get: (name) => byName.get(name),
  };
  const preferred: BackendName | undefined = isBackendName(setting)
    ? setting
    : undefined;
  return {
    metrics,
    preferred,
    registry,
    runSearch: createSearchRunner(registry, metrics),
  };
}
