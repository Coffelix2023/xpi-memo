import { type CliOptions, parseStoredId, runMnemosyne } from "./cli.ts";
import type { EvidenceType } from "./evidence.js";
import { isMemoryKind, type MemoryKind, type MemoryScope } from "./kinds.js";

/** Encoded into Mnemosyne `source` as kind=...;ev=...;prov=...;ts=...;src=...[;sid=...][;rev=...]. */
interface T1SourceMetadata {
  evidenceType: EvidenceType;
  revision?: string;
  /** L0 session discriminator for session-scoped memories (task 2.3). */
  sessionId?: string;
  source: string;
  timestamp: string;
}

export interface T1MemoryOperation {
  confidence: number;
  content: string;
  dataDir: string;
  kind: MemoryKind;
  provenance: string;
  /** Canonical semantic scope (task 1.2): global / project / session. */
  scope: MemoryScope;
  source: T1SourceMetadata;
  targetBank: string;
}

interface T1StoreResult {
  id: string | null;
  operation: T1MemoryOperation;
  output: string;
}

export type MnemosyneRunner = (args: string[], options?: CliOptions) => Promise<string>;

export interface MnemosyneAdapter {
  store(operation: T1MemoryOperation): Promise<T1StoreResult>;
}

export interface DecodedSourceMetadata {
  kind: MemoryKind | null;
  /** L0 session discriminator when the row is session-scoped (task 2.3). */
  sessionId: string | null;
  source: string;
}

function field(key: string, value: string): string {
  return `${key}=${encodeURIComponent(value)}`;
}

export function encodeSourceMetadata(operation: T1MemoryOperation): string {
  const fields = [
    field("kind", operation.kind),
    field("ev", operation.source.evidenceType),
    field("prov", operation.provenance),
    field("ts", operation.source.timestamp),
    field("src", operation.source.source),
  ];
  // Session-scoped rows carry the L0 session discriminator so recall can
  // isolate current-session context from unrelated sessions (task 2.3).
  if (operation.source.sessionId) fields.push(field("sid", operation.source.sessionId));
  if (operation.source.revision) fields.push(field("rev", operation.source.revision));
  return fields.join(";");
}

export function decodeSourceMetadata(raw: string): DecodedSourceMetadata {
  if (!raw.startsWith("kind="))
    return {
      kind: null,
      sessionId: null,
      source: raw,
    };
  const fields: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    fields[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1));
  }
  const kind = fields.kind;
  const sessionId = fields.sid ?? null;
  return {
    kind: kind && isMemoryKind(kind) ? kind : null,
    sessionId: sessionId && sessionId.length > 0 ? sessionId : null,
    source: fields.src ?? raw,
  };
}

/**
 * Mnemosyne's storage scope only distinguishes durable vs session. Canonical
 * `project` is durable, so it maps to `global` at the CLI boundary; the
 * semantic scope is preserved in `T1MemoryOperation.scope` and audit/L0 (task 1.2).
 */
function storageScopeFor(scope: MemoryScope): "global" | "session" {
  return scope === "session" ? "session" : "global";
}

function cliOptionsFor(operation: T1MemoryOperation): CliOptions {
  const options: CliOptions = {
    dataDir: operation.dataDir,
    scope: storageScopeFor(operation.scope),
  };
  if (operation.targetBank !== "default") options.bank = operation.targetBank;
  return options;
}

export function createMnemosyneAdapter(
  run: MnemosyneRunner = runMnemosyne,
): MnemosyneAdapter {
  return {
    async store(operation) {
      const output = await run(
        [
          "store",
          operation.content,
          encodeSourceMetadata(operation),
          String(operation.confidence),
        ],
        cliOptionsFor(operation),
      );
      return {
        id: parseStoredId(output),
        operation,
        output,
      };
    },
  };
}
