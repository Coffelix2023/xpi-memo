import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { promisify } from "node:util";
import { getAdmissionPolicy } from "./kind-routing.js";
import type { MemoryKind } from "./kinds.js";
import type { VerificationCandidate, VerificationResult } from "./types.js";

/** Signature every kind verifier implements (task 3.1). */
export type VerifierFn = (
  candidate: VerificationCandidate,
  options?: {
    root?: string;
  },
) => Promise<VerificationResult>;

const execFileAsync = promisify(execFile);

/**
 * Injectable subprocess seam so tests can simulate a hanging git without
 * spawning one (revision-check timeout scenario).
 */
type ExecFileFn = (
  file: string,
  args: string[],
  options: {
    killSignal: NodeJS.Signals;
    timeout: number;
  },
) => Promise<{
  stdout: string;
}>;

const VERIFICATION_TIMEOUT_MS = 500;
/** Bounded excerpt echo keeps audit entries small (task 4.1). */
const MAX_EXCERPT_CHARS = 200;
const MAX_FACT_PATH_CHARS = 256;
const MAX_REVISION_CHARS = 64;

/**
 * Conservative comment-prefix detection by file extension (design Decision
 * 2: comment-derived excerpts are not repository facts). Unknown extensions
 * fall back to the full prefix set — uncertain means pending (fail-closed).
 */
const COMMENT_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  css: ["/*", "*"],
  go: ["//", "/*", "*"],
  html: ["<!--"],
  java: ["//", "/*", "*"],
  js: ["//", "/*", "*"],
  json: ["//"],
  jsx: ["//", "/*", "*"],
  kt: ["//", "/*", "*"],
  lua: ["--"],
  md: ["<!--"],
  mdx: ["<!--"],
  php: ["//", "#", "/*", "*"],
  py: ["#"],
  rb: ["#"],
  rs: ["//", "/*", "*"],
  sh: ["#"],
  sql: ["--"],
  swift: ["//", "/*", "*"],
  ts: ["//", "/*", "*"],
  tsx: ["//", "/*", "*"],
  xml: ["<!--"],
  yaml: ["#"],
  yml: ["#"],
};
const DEFAULT_COMMENT_PREFIXES = [
  "//",
  "/*",
  "*",
  "<!--",
  "#",
  "--",
  ";",
] as const;

function failed(reason: string): VerificationResult {
  return {
    reason,
    status: "failed",
  };
}

function isCommentLine(line: string, filePath: string): boolean {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  const prefixes = COMMENT_PREFIXES[extension] ?? DEFAULT_COMMENT_PREFIXES;
  const trimmed = line.trimStart();
  return prefixes.some((prefix) => trimmed.startsWith(prefix));
}

function classifyGitError(error: unknown): string {
  if (!(error instanceof Error)) return "git-error";
  const { code, killed, signal } = error as {
    code?: string | number;
    killed?: boolean;
    signal?: NodeJS.Signals;
  };
  if (killed || signal) return "timeout";
  if (code === "ENOENT") return "git-unavailable";
  return "revision-unavailable";
}

/**
 * Verify a `project_gene` candidate against its structured repository-fact
 * declaration (change stabilize-candidate-auto-admission, tasks 3.1): the
 * declaration names a repo-relative file, a verbatim excerpt and an optional
 * revision. The excerpt must appear verbatim in a non-comment line of the
 * current working tree; a declared revision must match the current HEAD.
 * Anything else fails verification and the candidate stays in the review
 * queue — the candidate's own prose is never used as a search term.
 */
export async function verifyProjectGene(
  candidate: VerificationCandidate,
  options: {
    execFile?: ExecFileFn;
    headRevision?: string;
    root?: string;
  } = {},
): Promise<VerificationResult> {
  const fact = candidate.repositoryFact;
  if (!fact) return failed("no-declaration");
  if (!isAbsolute(fact.path) && fact.path.length <= MAX_FACT_PATH_CHARS) {
    // fall through to containment check below
  } else {
    return failed("path-outside-root");
  }
  const root = options.root ?? process.cwd();
  const rootReal = resolve(root);
  const target = resolve(rootReal, fact.path);
  if (target !== rootReal && !target.startsWith(rootReal + sep)) {
    return failed("path-outside-root");
  }
  if (!existsSync(target)) return failed("file-not-found");

  let fileContent: string;
  try {
    fileContent = readFileSync(target, "utf8");
  } catch {
    return failed("file-not-found");
  }
  const excerptIndex = fileContent.indexOf(fact.excerpt);
  if (excerptIndex < 0) return failed("excerpt-not-found");
  const line =
    fileContent.slice(0, excerptIndex).split("\n").length;
  // Comment detection inspects the matched file lines, not the excerpt
  // itself — a declaration can legitimately quote a fragment that sits in
  // the middle of a commented-out line.
  const lineStart =
    fileContent.lastIndexOf("\n", excerptIndex) + 1;
  const lineEnd = fileContent.indexOf("\n", excerptIndex + fact.excerpt.length - 1);
  const firstMatchedLine = fileContent
    .slice(lineStart, lineEnd < 0 ? undefined : lineEnd)
    .split("\n")[0] ?? "";
  if (isCommentLine(firstMatchedLine, fact.path)) {
    return failed("comment-evidence");
  }

  if (fact.revision) {
    let head: string;
    if (options.headRevision !== undefined) {
      head = options.headRevision;
    } else {
      const run = options.execFile ?? execFileAsync;
      try {
        const { stdout } = await run(
          "git",
          ["-C", rootReal, "rev-parse", "HEAD"],
          {
            killSignal: "SIGKILL",
            timeout: VERIFICATION_TIMEOUT_MS,
          },
        );
        head = stdout.trim();
      } catch (error) {
        return failed(classifyGitError(error));
      }
    }
    if (head !== fact.revision.trim()) return failed("revision-mismatch");
  }

  return {
    excerpt: fact.excerpt.slice(0, MAX_EXCERPT_CHARS),
    filePath: relative(rootReal, target).split(sep).join("/"),
    line,
    status: "verified",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Verifier registry (task 3.3): kinds with repository-fact verifiable facts
 * map to a verifier. Registration never enables auto-storage — project facts
 * admitted through the lifecycle are shadow-verified unless the rollout
 * allows `project_gene` to auto-store. Unregistered kinds stay pending.
 */
export const VERIFIERS: ReadonlyMap<MemoryKind, VerifierFn> = new Map([
  [
    "project_constraint",
    verifyProjectGene,
  ],
  [
    "project_gene",
    verifyProjectGene,
  ],
]);

export interface VerifyCandidateOptions {
  /** Admission-policy override (XPI_MEMO_AUTO_VERIFY); defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Verifier registry override for tests; defaults to VERIFIERS. */
  verifiers?: ReadonlyMap<MemoryKind, VerifierFn>;
  /** Project root for containment checks and revision resolution. */
  root?: string;
}

/**
 * Route a candidate through its kind admission policy (task 3.4). Only the
 * tool-verify policy reaches a verifier; accumulate and manual-confirm skip
 * verification (`skipped`) and keep the candidate in the review queue.
 */
export async function verifyCandidateIfNeeded(
  candidate: VerificationCandidate,
  options: VerifyCandidateOptions = {},
): Promise<VerificationResult> {
  const policy = getAdmissionPolicy(candidate.kind, options.env);
  if (policy !== "tool-verify") {
    return {
      reason: `policy:${policy}`,
      status: "skipped",
    };
  }
  const verifier = (options.verifiers ?? VERIFIERS).get(candidate.kind);
  if (!verifier) return failed("verifier-not-registered");
  return verifier(candidate, { root: options.root });
}

export { MAX_EXCERPT_CHARS, MAX_FACT_PATH_CHARS, MAX_REVISION_CHARS };
