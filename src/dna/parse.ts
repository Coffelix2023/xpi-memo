/**
 * YAML parsing + schema validation as two fail-closed gates
 * (change add-dna-project-domain-memory, task 2.2).
 *
 * Parsing is read-only: a rejected file yields bounded field-path issues and
 * the original text is never mutated, rewritten or echoed into diagnostics.
 * The second gate (schema) runs on the parsed value, so a syntactically valid
 * but structurally wrong file is still rejected.
 */
import { parseDocument } from "yaml";

import {
  type DnaFile,
  type DnaIssue,
  MAX_DNA_ISSUES,
  validateDnaFile,
} from "./schema.ts";

export const MAX_DNA_FILE_CHARS = 200_000;

export type DnaParseResult =
  | {
      file: DnaFile;
      ok: true;
    }
  | {
      issues: DnaIssue[];
      ok: false;
    };

function fail(issues: DnaIssue[]): DnaParseResult {
  return {
    issues: issues.slice(0, MAX_DNA_ISSUES),
    ok: false,
  };
}

export function parseDna(text: string): DnaParseResult {
  if (text.length > MAX_DNA_FILE_CHARS)
    return fail([
      {
        message: "file exceeds size budget",
        path: "/",
      },
    ]);
  let contents: ReturnType<typeof parseDocument>;
  try {
    contents = parseDocument(text, {
      prettyErrors: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "yaml parse failure";
    return fail([
      {
        message: message.slice(0, 200),
        path: "/",
      },
    ]);
  }
  if (contents.errors.length > 0)
    return fail(
      contents.errors.slice(0, MAX_DNA_ISSUES).map((error) => ({
        message: error.message.slice(0, 200),
        path: String(error.pos?.[0] ?? "/"),
      })),
    );
  const value = contents.toJS();
  if (value === null || value === undefined)
    return {
      file: {},
      ok: true,
    };
  if (typeof value !== "object" || Array.isArray(value))
    return fail([
      {
        message: "root must be a mapping of art/write domains",
        path: "/",
      },
    ]);
  const validated = validateDnaFile(value);
  if (!validated.ok) return fail(validated.issues);
  return {
    file: validated.value,
    ok: true,
  };
}
