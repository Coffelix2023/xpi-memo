/**
 * Trust-gated read of the project DNA file (change add-dna-project-domain-memory,
 * task 3.1).
 *
 * Disabled is the single outcome for "untrusted project", "file absent",
 * "file unparseable" and "schema violation": the capability is simply off.
 * Loading never creates the file and never falls back to another store.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDna } from "./parse.ts";
import type { DnaFile, DnaIssue } from "./schema.ts";

export const DNA_FILE_NAME = "DNA.yaml";

export function dnaFilePath(cwd: string): string {
  return join(cwd, ".pi", DNA_FILE_NAME);
}

export type DnaLoadResult =
  | {
      issues?: DnaIssue[];
      status: "disabled";
    }
  | {
      file: DnaFile;
      status: "ok";
    };

export function loadDna(options: { cwd: string; trusted: boolean }): DnaLoadResult {
  if (!options.trusted)
    return {
      status: "disabled",
    };
  let text: string;
  try {
    text = readFileSync(dnaFilePath(options.cwd), "utf8");
  } catch {
    return {
      status: "disabled",
    };
  }
  const parsed = parseDna(text);
  if (!parsed.ok)
    return {
      issues: parsed.issues,
      status: "disabled",
    };
  return {
    file: parsed.file,
    status: "ok",
  };
}
