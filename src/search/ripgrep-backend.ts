/**
 * RipgrepBackend (Task 12.2): fast full-text search over Markdown exports and
 * JSONL session logs using the `rg` CLI.
 *
 * Scope mapping (Task 12.4):
 * - global   → <dataDir>/markdown (MEMORY.md + daily/)
 * - project  → <dataDir>/markdown + <dataDir>/sessions (JSONL)
 * - session  → <dataDir>/sessions (JSONL only)
 *
 * Case rules (spec): lowercase-only queries search case-insensitively; queries
 * containing uppercase are case-sensitive. Regex patterns pass through to rg.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { sessionsDirFor } from "../l0/l0-runtime.js";
import { markdownDirFor } from "../markdown-export/exporter.js";
import type {
  BackendCapabilities,
  SearchBackend,
  SearchQuery,
  SearchResult,
} from "./backend.js";
import { isCommandInstalled } from "./backend.js";

export type RipgrepRunner = (args: string[]) => Promise<string>;

export const RIPGREP_INSTALL_HINT =
  "ripgrep is not installed. Install it for full-text search: brew install ripgrep (macOS), dnf install ripgrep (Fedora), or https://github.com/BurntSushi/ripgrep#installation";

const MAX_OUTPUT_BYTES = 256_000;
const LOWERCASE_ONLY = /^[^A-Z]+$/;
const CONTEXT_LINES = 2;

/** rg JSON event for a match ("match") vs context lines. */
interface RgJsonEvent {
  data?: {
    lines?: {
      text?: string;
    };
    path?: {
      text?: string;
    };
    line_number?: number;
  };
  type?: string;
}

export function buildRipgrepArgs(query: SearchQuery, targets: string[]): string[] {
  const args = [
    "--json",
    "--max-count",
    "50",
    "-C",
    String(CONTEXT_LINES),
  ];
  // Spec: lowercase-only queries are case-insensitive; uppercase forces
  // case-sensitive (rg default is case-sensitive, so only add -i for lowercase).
  if (LOWERCASE_ONLY.test(query.query)) args.push("--ignore-case");
  args.push(query.query, "--", ...targets);
  return args;
}

export function ripgrepTargets(dataDir: string, scope: SearchQuery["scope"]): string[] {
  const markdown = markdownDirFor(dataDir);
  const sessions = sessionsDirFor(dataDir);
  const targets: string[] = [];
  if (scope !== "session" && existsSync(markdown)) targets.push(markdown);
  if (scope !== "global" && existsSync(sessions)) targets.push(sessions);
  return targets;
}

function parseEvents(output: string): SearchResult[] {
  const results: SearchResult[] = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    let event: RgJsonEvent;
    try {
      event = JSON.parse(line) as RgJsonEvent;
    } catch {
      continue;
    }
    if (event.type !== "match" || !event.data) continue;
    const text = event.data.lines?.text?.trim() ?? "";
    const path = event.data.path?.text;
    if (!text || !path) continue;
    results.push({
      content: text,
      score: 1,
      source: {
        path,
      },
    });
  }
  return results;
}

export class RipgrepBackend implements SearchBackend {
  readonly name = "ripgrep";

  constructor(
    private readonly dataDir: string,
    private readonly run: RipgrepRunner = defaultRunner,
  ) {}

  capabilities(): BackendCapabilities {
    const installed = isCommandInstalled("rg");
    return {
      fullText: true,
      installed,
      semantic: false,
      vector: false,
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.capabilities().installed;
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const targets = ripgrepTargets(this.dataDir, query.scope);
    if (targets.length === 0) return [];
    const output = await this.run(buildRipgrepArgs(query, targets));
    // Limit enforcement (Task 12.5).
    return parseEvents(output).slice(0, query.limit);
  }
}

function defaultRunner(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("rg", args, {
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
        reject(new Error("ripgrep timed out"));
      }
    }, 15_000);
    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length + chunk.length > MAX_OUTPUT_BYTES) child.kill("SIGKILL");
      else stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(new Error(`${RIPGREP_INSTALL_HINT} (${error.message})`));
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      // rg exit codes: 0 = matches, 1 = no matches, 2 = error.
      if (code === 0 || code === 1) resolve(stdout);
      else reject(new Error(stderr.trim() || `rg exited with code ${code}`));
    });
  });
}
