/**
 * Empty-memory diagnosis (fix-zero-memory-activation task 4, design Decision 1).
 *
 * Classifies "T1 looks empty" into exactly one state using evidence the status
 * command already gathers. Pure function — no I/O, no mutation; inputs come
 * from the audit log, the L0 session trace, and candidate/row counts.
 */
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type EmptyMemoryState =
  | "NEVER_CALLED"
  | "PENDING"
  | "RECALL_EMPTY"
  | "WRITE_FAILED";

export interface EmptyMemoryEvidenceInput {
  /** Bank rows visible to the active search backend. */
  bankRows: number;
  /** Remember attempts recorded as candidate/confirmation/fallback audit rows. */
  inFlightAttempts: number;
  /** T1 event count in the L0 session trace (t1_memory_write events). */
  l0T1WriteEvents: number;
  /** Candidates currently waiting in candidates.json. */
  pendingCandidates: number;
  /** Remember attempts that finished as a rejected tool result (audit). */
  rejectedAttempts: number;
  /** Governed remember attempts that ended in a stored T1 row (audit). */
  storedWrites: number;
}

/**
 * State precedence (design.md Decision 1, first match wins):
 * 1. PENDING       — candidates exist and never got a decision.
 * 2. WRITE_FAILED  — remember attempts happened but no T1 row exists.
 * 3. NEVER_CALLED  — no remember/candidate evidence at all.
 * 4. RECALL_EMPTY  — data exists somewhere but the queried banks came back empty.
 */
export function classifyEmptyMemory(input: EmptyMemoryEvidenceInput): EmptyMemoryState {
  const stored = input.storedWrites > 0 || input.bankRows > 0;
  if (input.pendingCandidates > 0) return "PENDING";
  // Rows exist somewhere but the recall view is empty.
  if (stored) return "RECALL_EMPTY";
  // L0 t1_memory_write is written BEFORE the T1 row (dual-write), so it is
  // attempt evidence: an event without a row means the write failed.
  const attempted =
    input.rejectedAttempts > 0 ||
    input.inFlightAttempts > 0 ||
    input.l0T1WriteEvents > 0;
  if (attempted) return "WRITE_FAILED";
  return "NEVER_CALLED";
}

export interface MemoryDoctorInput {
  /** Audit entries (read-only) for counting remember outcomes. */
  auditActions: string[];
  /** Audit statuses paired 1:1 with auditActions (same index). */
  auditStatuses: Array<string | undefined>;
  /** Row counts per queried bank, null when stats were unavailable. */
  bankRows: Record<string, number | null>;
  /** t1_memory_write event count from the L0 session trace. */
  l0T1WriteEvents: number;
  /** Candidates waiting in candidates.json. */
  pendingCandidates: number;
}

export interface MemoryRootSurface {
  /** Distinct filesystem identity; surfaces sharing an inode are one root. */
  inode: number | null;
  path: string;
  /** Directory or db exists on disk. */
  present: boolean;
  role: "cli-default" | "configured" | "stale";
}

export interface MemoryDoctorReport {
  evidence: {
    audit: Record<string, number>;
    bankRows: Record<string, number | null>;
    /** Pre-candidate routing rejection count (task 3.3). */
    degraded: number;
    l0T1WriteEvents: number;
    pendingCandidates: number;
    roots: MemoryRootSurface[];
    /** Pre-candidate routing rejection count (task 3.3). */
    routingRejections: number;
  };
  state: EmptyMemoryState;
}

const REMEMBER_ATTEMPT_ACTIONS = new Set([
  "candidate",
  "confirmation",
  "fallback",
  "write",
] as const);

function countAudit(
  actions: string[],
  statuses: Array<string | undefined>,
): {
  counts: Record<string, number>;
  inFlight: number;
  rejected: number;
  stored: number;
} {
  const counts: Record<string, number> = {};
  let inFlight = 0;
  let rejected = 0;
  let stored = 0;
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index] as string;
    counts[action] = (counts[action] ?? 0) + 1;
    const status = statuses[index];
    if (REMEMBER_ATTEMPT_ACTIONS.has(action as never)) {
      if (status === "stored") stored += 1;
      else if (status === "rejected") rejected += 1;
      else inFlight += 1;
    }
  }
  return {
    counts,
    inFlight,
    rejected,
    stored,
  };
}

function classifyInput(report: {
  bankRows: Record<string, number | null>;
  inFlight: number;
  l0T1WriteEvents: number;
  pendingCandidates: number;
  rejected: number;
  stored: number;
}): EmptyMemoryState {
  return classifyEmptyMemory({
    bankRows: Object.values(report.bankRows).some((rows) => (rows ?? 0) > 0) ? 1 : 0,
    inFlightAttempts: report.inFlight,
    l0T1WriteEvents: report.l0T1WriteEvents,
    pendingCandidates: report.pendingCandidates,
    rejectedAttempts: report.rejected,
    storedWrites: report.stored,
  });
}

/**
 * Build the read-only evidence bundle (task 4.2). Only the paths in the input
 * are touched; never writes, never repairs, and the report contains no memory
 * body text — counts and names only.
 */
export function buildMemoryDoctorReport(
  input: MemoryDoctorInput,
  surfaces: MemoryRootSurface[],
): MemoryDoctorReport {
  const audit = countAudit(input.auditActions, input.auditStatuses);
  let routingRejections = 0;
  let degraded = 0;
  for (let index = 0; index < input.auditActions.length; index += 1) {
    const status = input.auditStatuses[index];
    if (status === "routing_rejected") routingRejections += 1;
    if (status === "degraded") degraded += 1;
  }
  return {
    state: classifyInput({
      bankRows: input.bankRows,
      inFlight: audit.inFlight,
      l0T1WriteEvents: input.l0T1WriteEvents,
      pendingCandidates: input.pendingCandidates,
      rejected: audit.rejected,
      stored: audit.stored,
    }),
    evidence: {
      audit: audit.counts,
      bankRows: input.bankRows,
      degraded,
      l0T1WriteEvents: input.l0T1WriteEvents,
      pendingCandidates: input.pendingCandidates,
      roots: surfaces,
      routingRejections,
    },
  };
}

function surfaceFor(path: string, role: MemoryRootSurface["role"]): MemoryRootSurface {
  try {
    return {
      inode: statSync(path).ino,
      path,
      role,
      present: true,
    };
  } catch {
    return {
      inode: null,
      path,
      role,
      present: false,
    };
  }
}

/**
 * The three data-root surfaces (design Decision 5), detected read-only via
 * distinct inodes. Never creates directories or symlinks.
 */
export function detectMemoryRootSurfaces(
  configuredDataDir: string,
): MemoryRootSurface[] {
  const home = homedir();
  const surfaces = [
    surfaceFor(configuredDataDir, "configured"),
    surfaceFor(join(home, ".hermes", "mnemosyne", "data"), "cli-default"),
    surfaceFor(join(home, "xpi-memo"), "stale"),
  ];
  return surfaces;
}
