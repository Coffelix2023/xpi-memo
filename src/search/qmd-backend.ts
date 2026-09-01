/**
 * QmdBackend (Task 12.3): optional semantic search via the external `qmd` CLI
 * (tobi/qmd). qmd combines vector search, BM25, and reranking (hybrid mode).
 *
 * CLI contract (verified against qmd README/docs):
 *   qmd search "<query>" --json -n <limit>
 * JSON result: [{ docid, score, file, title, snippet }]
 *
 * Scope mapping (Task 12.4): qmd searches its index, not arbitrary paths;
 * targets are informational (recorded in source.path as qmd:// URIs already
 * carry them). Scope restriction uses collections when configured via
 * XPI_MEMO_QMD_COLLECTIONS; otherwise all collections are searched.
 */

import { spawn } from "node:child_process";
import type {
  BackendCapabilities,
  SearchBackend,
  SearchQuery,
  SearchResult,
} from "./backend.js";
import { isCommandInstalled } from "./backend.js";

export type QmdRunner = (args: string[]) => Promise<string>;

export const QMD_INSTALL_HINT =
  "qmd is not installed (optional backend). Install: https://github.com/tobi/qmd#installation";

interface QmdRow {
  docid?: unknown;
  file?: unknown;
  score?: unknown;
  snippet?: unknown;
  title?: unknown;
}

function buildArgs(query: SearchQuery, collections: string[]): string[] {
  const args = [
    "search",
    query.query,
    "--json",
    "-n",
    String(query.limit),
  ];
  for (const collection of collections) args.push("-c", collection);
  return args;
}

function parseRows(output: string): SearchResult[] {
  let rows: QmdRow[] = [];
  try {
    const parsed = JSON.parse(output) as unknown;
    if (Array.isArray(parsed)) rows = parsed as QmdRow[];
  } catch {
    rows = [];
  }
  const results: SearchResult[] = [];
  for (const row of rows) {
    const snippet = typeof row.snippet === "string" ? row.snippet : "";
    const title = typeof row.title === "string" ? row.title : "";
    const content = snippet || title;
    if (!content) continue;
    results.push({
      content,
      score: typeof row.score === "number" ? row.score : 0,
      source: {
        ...(typeof row.file === "string"
          ? {
              path: row.file,
            }
          : {}),
      },
    });
  }
  return results;
}

export class QmdBackend implements SearchBackend {
  readonly name = "qmd";

  constructor(
    private readonly collections: string[],
    private readonly run: QmdRunner = defaultRunner,
  ) {}

  capabilities(): BackendCapabilities {
    const installed = isCommandInstalled("qmd");
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

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const output = await this.run(buildArgs(query, this.collections));
    // Limit enforcement (Task 12.5): -n passed to qmd; truncate anyway.
    return parseRows(output).slice(0, query.limit);
  }
}

function defaultRunner(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("qmd", args, {
      stdio: [
        "ignore",
        "pipe",
        "pipe",
      ],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("qmd timed out"));
      }
    }, 20_000);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(new Error(`${QMD_INSTALL_HINT} (${error.message})`));
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `qmd exited with code ${code}`));
    });
  });
}

export { parseRows };
