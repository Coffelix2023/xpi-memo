/**
 * DNA domain-memory schema (change add-dna-project-domain-memory, task 2.1).
 *
 * Typebox is the single source of truth for `.pi/DNA.yaml` shape: two fixed
 * domains (art/write), kebab-case entry ids, an explicit source label and a
 * three-tier confidence. Validation is fail-closed — unknown fields, type
 * mismatches and duplicate ids inside a domain are all rejected with bounded
 * field-path issues; no content is ever echoed back into diagnostics.
 */
import { type TSchema, Type } from "typebox";
import { Value } from "typebox/value";

export const DNA_DOMAINS = [
  "art",
  "write",
] as const;
export type DnaDomain = (typeof DNA_DOMAINS)[number];

export const DNA_SOURCES = [
  "agent-derived",
  "agent-translated-user-confirmed",
  "user-authored",
] as const;

export const DNA_CONFIDENCE = [
  "high",
  "low",
  "medium",
] as const;

export const DNA_ID_PATTERN = "^[a-z0-9]+(?:-[a-z0-9]+)*$";

export const MAX_DNA_ISSUES = 10;

export interface DnaIssue {
  message: string;
  path: string;
}

const DnaParamsSchema = Type.Record(
  Type.String({
    maxLength: 64,
  }),
  Type.Union([
    Type.String({
      maxLength: 300,
    }),
    Type.Number(),
    Type.Boolean(),
  ]),
);

export const DnaEntrySchema = Type.Object(
  {
    confidence: Type.Union(DNA_CONFIDENCE.map((level) => Type.Literal(level))),
    id: Type.String({
      maxLength: 64,
      pattern: DNA_ID_PATTERN,
    }),
    params: Type.Optional(DnaParamsSchema),
    semantic: Type.String({
      maxLength: 4000,
      minLength: 1,
    }),
    source: Type.Union(DNA_SOURCES.map((source) => Type.Literal(source))),
  },
  {
    additionalProperties: false,
  },
);

export const DnaFileSchema = Type.Object(
  {
    art: Type.Optional(
      Type.Array(DnaEntrySchema, {
        maxItems: 200,
      }),
    ),
    write: Type.Optional(
      Type.Array(DnaEntrySchema, {
        maxItems: 200,
      }),
    ),
  },
  {
    additionalProperties: false,
  },
);

// Types derive from the same const tuples the schemas are built from, so the
// enum layers cannot drift; the structural fields mirror DnaEntrySchema above.
export type DnaConfidence = (typeof DNA_CONFIDENCE)[number];
export type DnaSource = (typeof DNA_SOURCES)[number];

export interface DnaEntry {
  confidence: DnaConfidence;
  id: string;
  params?: Record<string, string | number | boolean>;
  semantic: string;
  source: DnaSource;
}

export interface DnaFile {
  art?: DnaEntry[];
  write?: DnaEntry[];
}

export type DnaValidation<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      issues: DnaIssue[];
    };

const ENTRY_KEYS = [
  "confidence",
  "id",
  "params",
  "semantic",
  "source",
];

function schemaIssues(schema: TSchema, value: unknown): DnaIssue[] {
  const issues: DnaIssue[] = [];
  // SAFETY: Value.Errors validates any TSchema-shaped object at runtime; the
  // double cast only bridges typebox's TProperties index-signature gap.
  const target = schema as unknown as Parameters<typeof Value.Errors>[0];
  for (const error of Value.Errors(target, value)) {
    if (issues.length >= MAX_DNA_ISSUES) break;
    issues.push({
      message: error.message.slice(0, 200),
      path: error.instancePath || "/",
    });
  }
  return issues;
}

function unknownKeyIssues(
  value: unknown,
  allowed: readonly string[],
  prefix: string,
): DnaIssue[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  const issues: DnaIssue[] = [];
  for (const key of Object.keys(value)) {
    if (allowed.includes(key)) continue;
    issues.push({
      message: "unknown field",
      path: `${prefix}/${key}`,
    });
  }
  return issues;
}

export function validateDnaEntry(value: unknown): DnaValidation<DnaEntry> {
  const issues = schemaIssues(DnaEntrySchema, value);
  issues.push(...unknownKeyIssues(value, ENTRY_KEYS, ""));
  if (issues.length > 0)
    return {
      issues: issues.slice(0, MAX_DNA_ISSUES),
      ok: false,
    };
  return {
    ok: true,
    value: value as DnaEntry,
  };
}

export function validateDnaFile(value: unknown): DnaValidation<DnaFile> {
  const issues = schemaIssues(DnaFileSchema, value);
  issues.push(...unknownKeyIssues(value, DNA_DOMAINS, ""));
  const root = value as Record<string, unknown> | null;
  for (const domain of DNA_DOMAINS) {
    const entries = root?.[domain];
    if (!Array.isArray(entries)) continue;
    const seen = new Set<string>();
    entries.forEach((entry, index) => {
      issues.push(...unknownKeyIssues(entry, ENTRY_KEYS, `/${domain}/${index}`));
      const id = (
        entry as {
          id?: unknown;
        } | null
      )?.id;
      if (typeof id === "string") {
        if (seen.has(id))
          issues.push({
            message: "duplicate id in domain",
            path: `/${domain}/${index}/id`,
          });
        seen.add(id);
      }
    });
  }
  if (issues.length > 0)
    return {
      issues: issues.slice(0, MAX_DNA_ISSUES),
      ok: false,
    };
  return {
    ok: true,
    value: value as DnaFile,
  };
}
