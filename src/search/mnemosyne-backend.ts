/**
 * MnemosyneBackend (Task 12.1): wraps the existing mnemosyne CLI recall.
 *
 * Scope mapping (Task 12.4): global → default bank; project → project bank
 * when it exists; session falls back to global (mnemosyne has no session bank).
 */

import type { RoutingContext } from "../banks.js";
import type { MemoryKind } from "../kinds.js";
import { decodeSourceMetadata } from "../operations.js";
import type {
  BackendCapabilities,
  SearchBackend,
  SearchQuery,
  SearchResult,
} from "./backend.js";
import { isCommandInstalled } from "./backend.js";

/** Matches recall.ts's RecallRunner so tests can stub the CLI. */
export type MnemosyneSearchRunner = (
  args: string[],
  options?: {
    dataDir?: string;
    bank?: string;
  },
) => Promise<string>;

interface RawRow {
  content?: unknown;
  id?: unknown;
  scope?: unknown;
  score?: unknown;
  source?: unknown;
}

interface RawPayload {
  results?: unknown;
}

function decodeKind(source: unknown): MemoryKind | null {
  if (typeof source !== "string") return null;
  return decodeSourceMetadata(source).kind;
}

function toResults(bank: string, output: string): SearchResult[] {
  let rows: RawRow[] = [];
  try {
    const parsed = JSON.parse(output) as RawPayload;
    if (Array.isArray(parsed.results))
      rows = parsed.results.filter(
        (row): row is RawRow => typeof row === "object" && row !== null,
      );
  } catch {
    rows = [];
  }
  const results: SearchResult[] = [];
  for (const row of rows) {
    if (typeof row.content !== "string") continue;
    results.push({
      content: row.content,
      kind: decodeKind(row.source),
      score: typeof row.score === "number" ? row.score : 0,
      source: {
        bank,
      },
    });
  }
  return results;
}

export class MnemosyneBackend implements SearchBackend {
  readonly name = "mnemosyne";

  constructor(
    private readonly context: RoutingContext,
    private readonly run: MnemosyneSearchRunner,
  ) {}

  capabilities(): BackendCapabilities {
    const installed = isCommandInstalled("mnemosyne");
    return {
      fullText: true,
      installed,
      semantic: true,
      vector: true,
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.capabilities().installed;
  }

  plannedBanks(query: SearchQuery): string[] {
    const banks = [
      "default",
    ];
    if (query.scope === "project" && this.context.projectBank)
      banks.unshift(this.context.projectBank);
    return banks;
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    // Spec scope mapping (recall.ts parity): project queries both the project
    // bank and the default bank; global and session query the default bank.
    const banks =
      query.scope === "project" && this.context.projectBank
        ? this.plannedBanks(query)
        : [
            "default",
          ];
    const batches = await Promise.all(
      banks.map(async (bank) => {
        const output = await this.run(
          [
            "recall",
            query.query,
            String(query.limit),
            "--explain",
            "--json",
          ],
          {
            bank: bank === "default" ? undefined : bank,
            dataDir: this.context.dataDir,
          },
        );
        return toResults(bank, output);
      }),
    );
    // Limit enforcement (Task 12.5): the CLI caps internally, truncate anyway.
    return batches.flat().slice(0, query.limit);
  }
}
