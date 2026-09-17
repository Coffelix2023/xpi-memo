import { execFile } from "node:child_process";

import { promisify } from "node:util";
import { getAdmissionPolicy } from "./kind-routing.js";
import type { MemoryKind } from "./kinds.js";
import type { VerificationCandidate, VerificationResult } from "./types.js";

/** Signature every kind verifier implements (task 3.1). */
export type VerifierFn = (
  candidate: VerificationCandidate,
) => Promise<VerificationResult>;

const execFileAsync = promisify(execFile);

/**
 * Injectable subprocess seam so tests can simulate a hanging rg without
 * spawning one (task 3.2 timeout scenario).
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
/** Bounded pattern/line sizes keep the subprocess argv and audit entries small. */
const MAX_PATTERN_CHARS = 160;
const MAX_MATCHED_LINE_CHARS = 200;
/** Design Risk 1 mitigation: never verify against test suites or lockfiles. */
const EXCLUDED_GLOBS = [
  "!**/{test,tests,__tests__,spec}/**",
  "!**/*.lock",
] as const;

const RG_OUTPUT_LINE_PATTERN = /^(.+?):(\d+):(.*)$/;

/**
 * The verifiable fragment of a candidate statement: its longest line,
 * matched as a fixed string. Heuristic ceiling: paraphrased statements that
 * do not quote the repository verbatim fail verification and fall back to
 * the review queue — safe by design (design Decision 3).
 */
function matchPatternFor(content: string): string {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort((a, b) => b.length - a.length);
  return (lines[0] ?? "").slice(0, MAX_PATTERN_CHARS);
}

function failed(reason: string): VerificationResult {
  return {
    reason,
    status: "failed",
  };
}

function classifyRgError(error: unknown): string {
  if (!(error instanceof Error)) return "rg-error";
  const { code, killed, signal } = error as {
    code?: string | number;
    killed?: boolean;
    signal?: NodeJS.Signals;
  };
  if (killed || signal) return "timeout";
  if (code === 1) return "no-match";
  if (code === "ENOENT") return "rg-unavailable";
  return "rg-error";
}

/**
 * Verify a `project_gene` candidate by fixed-string searching the working
 * tree with ripgrep (task 3.2). A match proves the repository really
 * contains the claimed fact; anything else (no match, missing rg, timeout)
 * fails verification and the candidate stays in the review queue.
 */
export async function verifyProjectGene(
  candidate: VerificationCandidate,
  options: {
    execFile?: ExecFileFn;
    root?: string;
  } = {},
): Promise<VerificationResult> {
  const pattern = matchPatternFor(candidate.content);
  if (!pattern) return failed("no-verifiable-text");
  const run = options.execFile ?? execFileAsync;
  const args = [
    "-n",
    "--no-heading",
    "-m",
    "1",
    "-F",
    ...EXCLUDED_GLOBS.flatMap((glob) => [
      "--glob",
      glob,
    ]),
    "--",
    pattern,
    options.root ?? process.cwd(),
  ];
  try {
    const { stdout } = await run("rg", args, {
      killSignal: "SIGKILL",
      timeout: VERIFICATION_TIMEOUT_MS,
    });
    const firstLine = stdout.split("\n")[0] ?? "";
    const match = RG_OUTPUT_LINE_PATTERN.exec(firstLine);
    if (!match) return failed("rg-error");
    const [, filePath, , matchedLine = ""] = match;
    return {
      filePath,
      matchedLine: matchedLine.slice(0, MAX_MATCHED_LINE_CHARS),
      status: "verified",
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return failed(classifyRgError(error));
  }
}

/**
 * Verifier registry (task 3.3): kinds with tool-verifiable facts map to a
 * verifier; constraint shares the gene verifier (same repository-fact
 * strategy). Unregistered kinds fail verification and stay pending.
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
  return verifier(candidate);
}
