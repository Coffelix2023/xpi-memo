/**
 * Repository Markdown memory export + governed re-import (tasks 6.1-6.4).
 *
 * The global SQLite bank stays the only machine-state write and recall
 * engine. Explicit export derives stable, privacy-filtered Markdown under
 * `<projectRoot>/.pi/memory/<kind>.md`; a cloned project can be re-imported
 * from those files as `repo-export` evidence through the normal candidate
 * governance path. Orphan project banks are reported read-only.
 */

import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { AuditLog } from "./audit.js";
import type { RoutingContext } from "./banks.js";
import type { CandidateStore } from "./candidate-lifecycle.js";
import { classifyProhibitedContent } from "./content-policy.js";
import { markExactDuplicates } from "./duplicate-report.js";
import { createEvidenceRecord } from "./evidence.js";
import {
  describeMemoryKind,
  isMemoryKind,
  type MemoryKind,
  type MemoryScope,
} from "./kinds.js";
import type { L0Coordinator } from "./l0/l0-runtime.js";
import { redactSensitive } from "./markdown-export/transformer.js";
import { contentFingerprint } from "./memory-idempotency.js";
import type { MnemosyneRunner, T1MemoryOperation } from "./operations.js";
import { decodeSourceMetadata } from "./operations.js";
import {
  generatePendingCandidate,
  type PendingCandidateReason,
} from "./pending-candidate.js";
import { routeMemoryKind } from "./routing.js";

/** Project-scoped kinds that may leave the machine state into `.pi/memory/`. */
const PROJECT_KINDS: readonly MemoryKind[] = [
  "project_constraint",
  "project_decision",
  "project_gene",
  "project_gotcha",
];

const MARKDOWN_SUFFIX = /\.md$/;

export function repoMemoryDir(projectRoot: string): string {
  return join(projectRoot, ".pi", "memory");
}

export interface RepoMemoryEntry {
  content: string;
  /** Stable T1 memory id (anchor for idempotent re-import). */
  id: string;
  kind: MemoryKind;
  scope: MemoryScope;
  /** Original source metadata string (kind=…;ev=…;prov=…;ts=…;src=…). */
  source: string;
  supersededBy?: string;
  /** ISO timestamp of the row. */
  timestamp: string;
}

export interface CollectResult {
  entries: RepoMemoryEntry[];
  /** Count of rows skipped by content policy (never exported). */
  rejected: number;
}

interface RawExportRow {
  content?: unknown;
  id?: unknown;
  importance?: unknown;
  source?: unknown;
  superseded_by?: unknown;
  timestamp?: unknown;
}

interface RawExportPayload {
  working_memory?: unknown;
}

/** Parse the export file at its boundary; returns null on any read/parse failure. */
function parseExportFile(outputPath: string): RawExportPayload | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(outputPath, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const payload = parsed as RawExportPayload;
    if (!Array.isArray(payload.working_memory)) return null;
    return {
      working_memory: payload.working_memory,
    };
  } catch {
    return null;
  }
}

/**
 * Collect governed project memory from the live project bank via
 * `mnemosyne export` (the machine state is the single source of truth).
 */
export async function collectProjectMemory(
  run: MnemosyneRunner,
  dataDir: string,
  projectBank: string,
): Promise<CollectResult> {
  const outputPath = join(tmpdir(), `xpi-memo-repo-export-${randomUUID()}.json`);
  await run(
    [
      "export",
      outputPath,
    ],
    {
      bank: projectBank,
      dataDir,
    },
  );
  const parsed = parseExportFile(outputPath);
  const rows = (parsed?.working_memory as RawExportRow[] | undefined) ?? [];
  const entries: RepoMemoryEntry[] = [];
  let rejected = 0;
  for (const row of rows) {
    if (typeof row.content !== "string" || row.content.trim().length === 0) continue;
    if (row.superseded_by !== null && row.superseded_by !== undefined) continue;
    const decoded =
      typeof row.source === "string" ? decodeSourceMetadata(row.source) : null;
    const kind = decoded?.kind;
    if (!kind || !isMemoryKind(kind) || !PROJECT_KINDS.includes(kind)) continue;
    if (
      classifyProhibitedContent({
        content: row.content,
      })
    ) {
      rejected += 1;
      continue;
    }
    const id =
      typeof row.id === "string" && row.id.length > 0
        ? row.id
        : `m-${contentFingerprint(row.content).slice(0, 12)}`;
    entries.push({
      content: row.content,
      id,
      kind,
      scope: describeMemoryKind(kind).scope,
      source: typeof row.source === "string" ? row.source : "",
      timestamp:
        typeof row.timestamp === "string" ? row.timestamp : new Date().toISOString(),
    });
  }
  return {
    entries,
    rejected,
  };
}

function kindFileName(kind: MemoryKind): string {
  return `${kind}.md`;
}

function anchorLine(entry: RepoMemoryEntry, sourceSummary: string): string {
  const superseded =
    entry.supersededBy === undefined ? "" : ` · supersededBy \`${entry.supersededBy}\``;
  return [
    `  <sub>memory \`${entry.id}\` · kind \`${entry.kind}\` · scope \`${entry.scope}\` · source \`${sourceSummary}\` · updated \`${entry.timestamp}\`${superseded}</sub>`,
  ].join("");
}

/**
 * Deterministic per-kind Markdown rendering: stable anchor, canonical
 * kind/scope metadata, stable ordering by memory id (never by write time, so
 * an unchanged bank regenerates an identical file).
 */
export function renderRepoMemoryMarkdown(
  entries: RepoMemoryEntry[],
): Record<string, string> {
  const files: Record<string, string> = {};
  const marked = markExactDuplicates(
    entries.map((entry) => ({
      ...entry,
      bank: "project",
    })),
    (entry) => Date.parse(entry.timestamp) || 0,
  );
  const byKind = new Map<MemoryKind, typeof marked>();
  for (const entry of marked) {
    const bucket = byKind.get(entry.kind);
    if (bucket) bucket.push(entry);
    else
      byKind.set(entry.kind, [
        entry,
      ]);
  }
  const orderedKinds = PROJECT_KINDS.filter((kind) => byKind.has(kind));
  for (const kind of orderedKinds) {
    const rows = (byKind.get(kind) ?? []).sort((a, b) => a.id.localeCompare(b.id));
    const lines = [
      `# ${describeMemoryKind(kind).sectionTitle}`,
      "",
      `<!-- xpi-memo repo-export · kind \`${kind}\` · scope \`project\` · machine state stays in the global SQLite bank -->`,
      "",
    ];
    for (const entry of rows) {
      const sourceSummary = entry.source.slice(0, 160);
      lines.push(`- ${entry.content}`, anchorLine(entry, sourceSummary), "");
    }
    files[kindFileName(kind)] = lines.join("\n");
  }
  return files;
}

const ANCHOR_PATTERN =
  /memory\s+`([^`]+)`\s+·\s+kind\s+`([^`]+)`\s+·\s+scope\s+`([^`]+)`/;
const ENTRY_PATTERN = /^- (.+)$/;

/**
 * Parse one kind's Markdown file back into machine-readable entries.
 * Unparseable lines are skipped; nothing is ever written from a parse failure.
 */
export function parseRepoMemoryMarkdown(
  content: string,
  defaultKind: MemoryKind,
): RepoMemoryEntry[] {
  const entries: RepoMemoryEntry[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const entryMatch = ENTRY_PATTERN.exec(lines[i] ?? "");
    if (!entryMatch) continue;
    const anchorMatch = ANCHOR_PATTERN.exec(lines[i + 1] ?? "");
    const kind =
      anchorMatch?.[2] && isMemoryKind(anchorMatch[2])
        ? (anchorMatch[2] as MemoryKind)
        : defaultKind;
    if (!PROJECT_KINDS.includes(kind)) continue;
    entries.push({
      content: (entryMatch[1] ?? "").trim(),
      id: anchorMatch?.[1] ?? "",
      kind,
      scope: describeMemoryKind(kind).scope,
      source: "",
      timestamp: "",
    });
  }
  return entries;
}

export interface RepoExportResult {
  /** Written file names under `.pi/memory/`. */
  files: string[];
  /** Count of rows rejected by content policy. */
  rejected: number;
}

/**
 * Explicit export (task 6.1): regenerate `.pi/memory/<kind>.md` from the
 * live project bank. Never creates SQLite/WAL/SHM inside the repository.
 */
export async function exportProjectMemory(options: {
  dataDir: string;
  privacy?: boolean;
  projectBank: string;
  projectRoot: string;
  run: MnemosyneRunner;
}): Promise<RepoExportResult> {
  const { entries, rejected } = await collectProjectMemory(
    options.run,
    options.dataDir,
    options.projectBank,
  );
  const redacted = options.privacy
    ? entries.map((entry) => ({
        ...entry,
        content: redactSensitive(entry.content),
      }))
    : entries;
  const files = renderRepoMemoryMarkdown(redacted);
  const dir = repoMemoryDir(options.projectRoot);
  mkdirSync(dir, {
    recursive: true,
  });
  for (const [name, markdown] of Object.entries(files)) {
    const path = join(dir, name);
    const temporaryPath = `${path}.tmp`;
    writeFileSync(temporaryPath, markdown, {
      mode: 0o600,
    });
    renameSync(temporaryPath, path);
  }
  return {
    files: Object.keys(files),
    rejected,
  };
}

/** Discover `repo-export` entries from `.pi/memory/<kind>.md` files. */
export function discoverRepoExport(projectRoot: string): RepoMemoryEntry[] {
  const dir = repoMemoryDir(projectRoot);
  if (!existsSync(dir)) return [];
  const entries: RepoMemoryEntry[] = [];
  for (const name of readdirSync(dir).sort()) {
    const kindName = name.replace(MARKDOWN_SUFFIX, "");
    if (!isMemoryKind(kindName) || !PROJECT_KINDS.includes(kindName as MemoryKind))
      continue;
    const raw = readFileSync(join(dir, name), "utf8");
    entries.push(...parseRepoMemoryMarkdown(raw, kindName as MemoryKind));
  }
  return entries;
}

interface ReimportLedger {
  fingerprints: string[];
  ids: string[];
  version: 1;
}

function emptyLedger(): ReimportLedger {
  return {
    fingerprints: [],
    ids: [],
    version: 1,
  };
}

function readLedger(dataDir: string): ReimportLedger {
  const path = join(dataDir, "repo-reimport.json");
  if (!existsSync(path)) return emptyLedger();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<ReimportLedger>;
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.ids) ||
      !Array.isArray(parsed.fingerprints)
    )
      return emptyLedger();
    return {
      fingerprints: parsed.fingerprints,
      ids: parsed.ids,
      version: 1,
    };
  } catch {
    return emptyLedger();
  }
}

function saveLedger(dataDir: string, ledger: ReimportLedger): void {
  const path = join(dataDir, "repo-reimport.json");
  mkdirSync(dirname(path), {
    recursive: true,
  });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(ledger, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, path);
}

function pendingReasonFor(kind: MemoryKind): PendingCandidateReason {
  if (kind === "project_decision") return "project-decision";
  if (kind === "project_gotcha") return "broad-gotcha";
  return "high-impact-durable";
}

export interface ReimportRuntime {
  audit: AuditLog;
  candidates: CandidateStore;
  context: RoutingContext;
  dataDir: string;
  l0: L0Coordinator;
}

export interface ReimportResult {
  duplicates: number;
  imported: number;
  rejected: number;
}

/**
 * Governed re-import (task 6.3): discovered entries become candidates with
 * `repo-export` evidence. Never a direct T1 write; deduplicated by stable id
 * and content fingerprint across sessions.
 */
export async function reimportRepoExport(
  entries: RepoMemoryEntry[],
  runtime: ReimportRuntime,
): Promise<ReimportResult> {
  const ledger = readLedger(runtime.dataDir);
  let imported = 0;
  let duplicates = 0;
  let rejected = 0;
  for (const entry of entries) {
    const fingerprint = contentFingerprint(`${entry.kind}:${entry.content}`);
    if (
      (entry.id.length > 0 && ledger.ids.includes(entry.id)) ||
      ledger.fingerprints.includes(fingerprint)
    ) {
      duplicates += 1;
      continue;
    }
    const classification = classifyProhibitedContent({
      content: entry.content,
    });
    if (classification) {
      rejected += 1;
      runtime.audit.record("rejection", {
        evidenceType: "repo-export",
        kind: entry.kind,
        reason: `prohibited-content:${classification}`,
        scope: entry.scope,
        status: "rejected",
      });
      continue;
    }
    if (runtime.context.projectBank === null) {
      rejected += 1;
      runtime.audit.record("rejection", {
        evidenceType: "repo-export",
        identity: runtime.context.identity,
        kind: entry.kind,
        reason: "project-identity-required",
        scope: "project",
        status: "routing_rejected",
      });
      runtime.l0.recordSafe("routing_rejected", {
        evidenceType: "repo-export",
        identity: runtime.context.identity,
        kind: entry.kind,
        outcome: "routing_rejected",
        reason: "project-identity-required",
        scope: "project",
      });
      continue;
    }
    const evidence = createEvidenceRecord({
      confidence: 0.5,
      provenance: "reimport:repo-export",
      source: `repo:.pi/memory/${entry.kind}.md#${entry.id}`,
      type: "repo-export",
    });
    const operation: T1MemoryOperation = {
      confidence: evidence.confidence,
      content: entry.content,
      dataDir: runtime.dataDir,
      kind: entry.kind,
      provenance: evidence.provenance,
      scope: routeMemoryKind(entry.kind, runtime.context).scope,
      targetBank: routeMemoryKind(entry.kind, runtime.context).bank,
      source: {
        evidenceType: evidence.type,
        source: evidence.source,
        timestamp: evidence.timestamp,
      },
    };
    const candidate = generatePendingCandidate({
      allowAutoStore: false,
      content: entry.content,
      context: runtime.context,
      evidence,
      kind: entry.kind,
      rationale: "Imported from repository Markdown; requires T1 write governance.",
      reason: pendingReasonFor(entry.kind),
      verified: false,
    });
    if (!candidate) {
      rejected += 1;
      continue;
    }
    const added = runtime.candidates.add(candidate, operation);
    runtime.audit.record("candidate", {
      bank: candidate.targetBank,
      evidenceType: "repo-export",
      kind: candidate.kind,
      reason: candidate.reason,
      scope: candidate.targetScope,
      status: added.status,
    });
    runtime.l0.recordSafe("candidate_created", {
      bank: candidate.targetBank,
      candidateId: candidate.id,
      evidenceType: "repo-export",
      fingerprint,
      kind: candidate.kind,
      reason: candidate.reason,
      scope: candidate.targetScope,
      source: evidence.source,
    });
    ledger.ids.push(entry.id);
    ledger.fingerprints.push(fingerprint);
    imported += 1;
  }
  saveLedger(runtime.dataDir, ledger);
  return {
    duplicates,
    imported,
    rejected,
  };
}

export interface OrphanBank {
  bank: string;
  reason: string;
}

/**
 * Read-only orphan detection (task 6.4): project banks whose identity is not
 * in the local registry and is not the current project. Never deletes.
 */
export function detectOrphanBanks(options: {
  currentBank: string | null;
  dataDir: string;
  knownBanks: string[];
}): OrphanBank[] {
  const banksDir = join(options.dataDir, "banks");
  if (!existsSync(banksDir)) return [];
  const known = new Set(options.knownBanks);
  const orphans: OrphanBank[] = [];
  for (const name of readdirSync(banksDir).sort()) {
    if (!name.startsWith("project-")) continue;
    const bank = name;
    if (bank === options.currentBank) continue;
    if (known.has(bank)) continue;
    orphans.push({
      bank,
      reason: "no matching project identity in the local registry",
    });
  }
  return orphans;
}
