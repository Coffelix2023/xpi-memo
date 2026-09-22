/**
 * Write pipeline for `.pi/DNA.yaml` (change add-dna-project-domain-memory,
 * tasks 4.1-4.3): schema gate → content safety → per-entry upsert.
 *
 * Fail-closed by construction: every rejection happens before any byte is
 * written, so a rejected write leaves the file untouched (byte-for-byte).
 * User-authored entries are immutable to the agent — an attempted update that
 * would change one is rejected as a conflict and the user version stays.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Document, parseDocument, YAMLMap, YAMLSeq } from "yaml";

import { classifyProhibitedContent, isPersistableContent } from "../content-policy.ts";
import { prepareExternalContent } from "../memory-safety.ts";
import { dnaFilePath } from "./load.ts";
import { MAX_DNA_FILE_CHARS, parseDna } from "./parse.ts";
import {
  type DnaDomain,
  type DnaEntry,
  type DnaIssue,
  validateDnaEntry,
} from "./schema.ts";

export type DnaWriteRejectReason =
  | "conflict"
  | "content-policy"
  | "io"
  | "parse"
  | "schema"
  | "untrusted"
  | "unsafe-external";

export type DnaWriteResult =
  | {
      domain: DnaDomain;
      id: string;
      status: "stored";
    }
  | {
      detail?: string;
      issues?: DnaIssue[];
      reason: DnaWriteRejectReason;
      status: "rejected";
    };

function reject(
  reason: DnaWriteRejectReason,
  extra: {
    detail?: string;
    issues?: DnaIssue[];
  } = {},
): DnaWriteResult {
  return {
    ...extra,
    reason,
    status: "rejected",
  };
}

function sameContent(left: DnaEntry, right: DnaEntry): boolean {
  return (
    left.semantic === right.semantic &&
    JSON.stringify(left.params ?? {}) === JSON.stringify(right.params ?? {})
  );
}

/** Redact credentials per field; refuse when safety cannot be confirmed. */
function sanitizeEntry(entry: DnaEntry):
  | {
      entry: DnaEntry;
    }
  | {
      reason: string;
    } {
  const semantic = prepareExternalContent(entry.semantic);
  if (semantic.status === "refused")
    return {
      reason: semantic.reason ?? "uncertain-credential",
    };
  const params: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(entry.params ?? {})) {
    if (typeof value !== "string") {
      params[key] = value;
      continue;
    }
    const safe = prepareExternalContent(value);
    if (safe.status === "refused")
      return {
        reason: safe.reason ?? "uncertain-credential",
      };
    params[key] = safe.content ?? value;
  }
  return {
    entry: {
      ...entry,
      ...(entry.params
        ? {
            params,
          }
        : {}),
      semantic: semantic.content ?? entry.semantic,
    },
  };
}

export function upsertDnaEntry(options: {
  cwd: string;
  domain: DnaDomain;
  entry: DnaEntry;
  trusted: boolean;
}): DnaWriteResult {
  const { cwd, domain } = options;
  if (!options.trusted) return reject("untrusted");
  const validated = validateDnaEntry(options.entry);
  if (!validated.ok)
    return reject("schema", {
      issues: validated.issues,
    });
  const sanitized = sanitizeEntry(validated.value);
  if ("reason" in sanitized)
    return reject("unsafe-external", {
      detail: sanitized.reason,
    });
  const entry = sanitized.entry;
  if (
    !isPersistableContent({
      content: entry.semantic,
    })
  ) {
    const classification = classifyProhibitedContent({
      content: entry.semantic,
    });
    return reject("content-policy", {
      detail: classification ?? "prohibited",
    });
  }

  let text = "";
  try {
    text = readFileSync(dnaFilePath(cwd), "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT")
      return reject("io", {
        detail: code ?? "read-failed",
      });
  }
  if (text.length > MAX_DNA_FILE_CHARS)
    return reject("parse", {
      issues: [
        {
          message: "file exceeds size budget",
          path: "/",
        },
      ],
    });
  const parsedExisting = parseDna(text);
  if (!parsedExisting.ok)
    return reject("parse", {
      issues: parsedExisting.issues,
    });
  const existing = (parsedExisting.file[domain] ?? []).find(
    (item) => item.id === entry.id,
  );
  if (existing?.source === "user-authored") {
    if (sameContent(existing, entry))
      return {
        domain,
        id: entry.id,
        status: "stored",
      };
    return reject("conflict", {
      detail: `entry ${entry.id} is user-authored; user version kept`,
    });
  }

  const doc =
    text.trim().length === 0
      ? parseDocument("art: []\nwrite: []\n")
      : parseDocument(text);
  if (doc.errors.length > 0)
    return reject("parse", {
      issues: doc.errors.slice(0, 10).map((error) => ({
        message: error.message.slice(0, 200),
        path: String(error.pos?.[0] ?? "/"),
      })),
    });
  if (doc.contents !== null && !(doc.contents instanceof YAMLMap))
    return reject("parse", {
      issues: [
        {
          message: "root must be a mapping",
          path: "/",
        },
      ],
    });
  const root = doc.contents ?? doc.createNode<Record<string, never>>({});
  const domainNode = (root as YAMLMap).get(domain, true);
  let sequence: YAMLSeq;
  if (domainNode instanceof YAMLSeq) {
    sequence = domainNode;
  } else {
    sequence = doc.createNode<unknown[]>([]) as YAMLSeq;
    (root as YAMLMap).set(domain, sequence);
  }
  const node = doc.createNode(entry);
  const index = sequence.items.findIndex(
    (item: unknown) => item instanceof YAMLMap && item.get("id") === entry.id,
  );
  if (index >= 0) sequence.items[index] = node;
  else sequence.items.push(node);
  const output = doc.toString();
  const roundTrip = parseDna(output);
  if (!roundTrip.ok)
    return reject("parse", {
      issues: roundTrip.issues,
    });
  try {
    mkdirSync(join(cwd, ".pi"), {
      recursive: true,
    });
    writeFileSync(dnaFilePath(cwd), output, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return reject("io", {
      detail: code ?? "write-failed",
    });
  }
  return {
    domain,
    id: entry.id,
    status: "stored",
  };
}

export type { Document };
