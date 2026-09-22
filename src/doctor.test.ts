import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildMemoryDoctorReport,
  classifyEmptyMemory,
  detectMemoryRootSurfaces,
  recallZeroStreak,
} from "./doctor.js";

const base = {
  bankRows: 0,
  inFlightAttempts: 0,
  l0T1WriteEvents: 0,
  pendingCandidates: 0,
  rejectedAttempts: 0,
  storedWrites: 0,
};

describe("classifyEmptyMemory", () => {
  it("classifies no evidence as NEVER_CALLED", () => {
    expect(classifyEmptyMemory(base)).toBe("NEVER_CALLED");
  });

  it("classifies waiting candidates as PENDING even with other evidence", () => {
    expect(
      classifyEmptyMemory({
        ...base,
        pendingCandidates: 1,
        rejectedAttempts: 3,
        storedWrites: 5,
      }),
    ).toBe("PENDING");
  });

  it("classifies stored rows with empty recall view as RECALL_EMPTY", () => {
    expect(
      classifyEmptyMemory({
        ...base,
        storedWrites: 2,
      }),
    ).toBe("RECALL_EMPTY");
    expect(
      classifyEmptyMemory({
        ...base,
        bankRows: 7,
      }),
    ).toBe("RECALL_EMPTY");
  });

  it("classifies audit attempts without rows as WRITE_FAILED", () => {
    expect(
      classifyEmptyMemory({
        ...base,
        rejectedAttempts: 1,
      }),
    ).toBe("WRITE_FAILED");
    expect(
      classifyEmptyMemory({
        ...base,
        inFlightAttempts: 2,
      }),
    ).toBe("WRITE_FAILED");
  });

  it("treats L0 t1_memory_write events without rows as WRITE_FAILED", () => {
    // Dual-write: L0 records the attempt before the T1 row exists, so an
    // event count without any row means the write failed.
    expect(
      classifyEmptyMemory({
        ...base,
        l0T1WriteEvents: 4,
      }),
    ).toBe("WRITE_FAILED");
  });

  it("prefers PENDING over WRITE_FAILED and RECALL_EMPTY over attempts", () => {
    expect(
      classifyEmptyMemory({
        ...base,
        inFlightAttempts: 1,
        l0T1WriteEvents: 2,
        pendingCandidates: 1,
      }),
    ).toBe("PENDING");
    expect(
      classifyEmptyMemory({
        ...base,
        l0T1WriteEvents: 3,
        storedWrites: 1,
      }),
    ).toBe("RECALL_EMPTY");
  });
});

describe("recallZeroStreak (plan-note-03 RECALL_ZERO_STREAK)", () => {
  const noRecalls = {
    auditActions: [],
    auditStatuses: [] as string[],
  };

  it("counts consecutive empty recalls", () => {
    expect(
      recallZeroStreak([
        {
          action: "recall",
          resultCount: 0,
        },
        {
          action: "write",
        },
        {
          action: "recall",
          resultCount: 0,
        },
        {
          action: "recall",
        },
      ]),
    ).toEqual({
      alert: false,
      count: 3,
    });
  });

  it("resets on any recall with hits", () => {
    expect(
      recallZeroStreak([
        {
          action: "recall",
          resultCount: 0,
        },
        {
          action: "recall",
          resultCount: 0,
        },
        {
          action: "recall",
          resultCount: 2,
        },
        {
          action: "recall",
          resultCount: 0,
        },
      ]),
    ).toEqual({
      alert: false,
      count: 1,
    });
  });

  it("alerts at the threshold of 10 consecutive zero-hit recalls", () => {
    const zeros = Array.from(
      {
        length: 10,
      },
      () => ({
        action: "recall",
        resultCount: 0,
      }),
    );
    expect(recallZeroStreak(zeros)).toEqual({
      alert: true,
      count: 10,
    });
    expect(recallZeroStreak(zeros.slice(0, 9))).toEqual({
      alert: false,
      count: 9,
    });
  });

  it("reports zero when no recall audit entries exist", () => {
    expect(
      recallZeroStreak([
        {
          action: "write",
        },
      ]),
    ).toEqual({
      alert: false,
      count: 0,
    });
  });

  it("surfaces the streak through buildMemoryDoctorReport", () => {
    const report = buildMemoryDoctorReport(
      {
        auditActions: [],
        auditStatuses: [],
        l0T1WriteEvents: 0,
        pendingCandidates: 0,
        auditEntries: [
          {
            action: "recall",
            resultCount: 0,
          },
          {
            action: "recall",
            resultCount: 0,
          },
        ],
        bankRows: {
          default: 0,
        },
      },
      [],
    );
    expect(report.recallZeroStreak).toEqual({
      alert: false,
      count: 2,
    });
  });

  it("keeps the doctor report empty-streak-compatible without auditEntries", () => {
    const report = buildMemoryDoctorReport(
      {
        ...noRecalls,
        bankRows: {},
        l0T1WriteEvents: 0,
        pendingCandidates: 0,
      },
      [],
    );
    expect(report.recallZeroStreak).toEqual({
      alert: false,
      count: 0,
    });
  });
});
describe("buildMemoryDoctorReport", () => {
  it("emits audit counts, L0 counts, bank rows, and pending candidates", () => {
    const report = buildMemoryDoctorReport(
      {
        l0T1WriteEvents: 2,
        pendingCandidates: 1,
        auditActions: [
          "write",
          "write",
          "rejection",
          "recall",
        ],
        auditStatuses: [
          "stored",
          "stored",
          "rejected",
          undefined,
        ],
        bankRows: {
          default: 3,
          "project-acme": 0,
        },
      },
      [],
    );
    expect(report.state).toBe("PENDING");
    expect(report.evidence).toMatchObject({
      degraded: 0,
      l0T1WriteEvents: 2,
      pendingCandidates: 1,
      routingRejections: 0,
      audit: {
        recall: 1,
        rejection: 1,
        write: 2,
      },
      bankRows: {
        default: 3,
        "project-acme": 0,
      },
    });
  });

  it("carries the bounded decision counters and defaults them to zero", () => {
    const withCounters = buildMemoryDoctorReport(
      {
        auditActions: [],
        auditStatuses: [],
        bankRows: {},
        l0T1WriteEvents: 0,
        pendingCandidates: 0,
        decision: {
          calls: 3,
          failures: 1,
          gateSkips: 2,
        },
      },
      [],
    );
    expect(withCounters.evidence.decision).toEqual({
      calls: 3,
      failures: 1,
      gateSkips: 2,
    });
    // Counts only: the report never carries a judged state or an answer.
    expect(JSON.stringify(withCounters.evidence.decision)).not.toContain("state");
    const withoutCounters = buildMemoryDoctorReport(
      {
        auditActions: [],
        auditStatuses: [],
        bankRows: {},
        l0T1WriteEvents: 0,
        pendingCandidates: 0,
      },
      [],
    );
    expect(withoutCounters.evidence.decision).toEqual({
      calls: 0,
      failures: 0,
      gateSkips: 0,
    });
  });

  it("counts routing rejections and degraded storage failures from audit statuses (task 3.3)", () => {
    const report = buildMemoryDoctorReport(
      {
        l0T1WriteEvents: 0,
        pendingCandidates: 0,
        auditActions: [
          "rejection",
          "rejection",
          "fallback",
          "write",
        ],
        auditStatuses: [
          "routing_rejected",
          "routing_rejected",
          "degraded",
          "stored",
        ],
        bankRows: {
          default: 1,
        },
      },
      [],
    );
    expect(report.evidence.routingRejections).toBe(2);
    expect(report.evidence.degraded).toBe(1);
  });

  it("reports bounded security diagnostics separately from backend and storage failures", () => {
    const report = buildMemoryDoctorReport(
      {
        auditActions: [],
        auditStatuses: [],
        l0T1WriteEvents: 0,
        pendingCandidates: 0,
        bankRows: {
          default: 0,
        },
        security: {
          backendNoHitCount: 2,
          backendNotRunCount: 1,
          policyVersion: "memory-boundary-v1",
          recallBlocked: 3,
          recallOmitted: 4,
          routingRejectionCount: 5,
          storageFailureCount: 6,
        },
      },
      [],
    );
    expect(report.evidence.security).toMatchObject({
      backendNoHitCount: 2,
      recallBlocked: 3,
      routingRejectionCount: 5,
      storageFailureCount: 6,
    });
    expect(JSON.stringify(report)).not.toContain("memory body");
  });

  it("treats null stats for every bank as no visible rows", () => {
    const report = buildMemoryDoctorReport(
      {
        auditActions: [],
        auditStatuses: [],
        l0T1WriteEvents: 0,
        pendingCandidates: 0,
        bankRows: {
          default: null,
        },
      },
      [],
    );
    expect(report.state).toBe("NEVER_CALLED");
  });

  it("exposes bounded feedback counters with defaults and no bodies (task 4.4)", () => {
    const withFeedback = buildMemoryDoctorReport(
      {
        auditActions: [],
        auditStatuses: [],
        l0T1WriteEvents: 0,
        pendingCandidates: 0,
        bankRows: {
          default: 1,
        },
        feedback: {
          conflicts: 2,
          explicit: 3,
          helpful: 4,
          irrelevant: 5,
          passive: 6,
          supersessions: 7,
          wrong: 8,
        },
      },
      [],
    );
    expect(withFeedback.evidence.feedback).toEqual({
      conflicts: 2,
      explicit: 3,
      helpful: 4,
      irrelevant: 5,
      passive: 6,
      supersessions: 7,
      wrong: 8,
    });

    const withoutFeedback = buildMemoryDoctorReport(
      {
        auditActions: [],
        auditStatuses: [],
        feedback: undefined,
        l0T1WriteEvents: 0,
        pendingCandidates: 0,
        bankRows: {
          default: 1,
        },
      },
      [],
    );
    expect(withoutFeedback.evidence.feedback).toMatchObject({
      passive: 0,
    });
    expect(JSON.stringify(withFeedback)).not.toContain("content");
  });

  it("contains no memory body text — counts and names only", () => {
    const report = buildMemoryDoctorReport(
      {
        l0T1WriteEvents: 0,
        pendingCandidates: 0,
        auditActions: [
          "write",
          "rejection",
        ],
        auditStatuses: [
          "stored",
          "rejected",
        ],
        bankRows: {
          default: 0,
        },
      },
      [
        {
          inode: 111,
          path: "/tmp/configured",
          present: true,
          role: "configured",
        },
        {
          inode: 222,
          path: "/home/u/.hermes/mnemosyne/data",
          present: true,
          role: "cli-default",
        },
        {
          inode: null,
          path: "/home/u/xpi-memo",
          present: false,
          role: "stale",
        },
      ],
    );
    expect(report.evidence.roots).toHaveLength(3);
    expect(JSON.stringify(report)).not.toContain("content");
  });
});

describe("detectMemoryRootSurfaces", () => {
  const created: string[] = [];

  afterEach(() => {
    for (const directory of created.splice(0))
      rmSync(directory, {
        force: true,
        recursive: true,
      });
  });

  it("reports the configured root with its real inode", () => {
    const configured = mkdtempSync(join(tmpdir(), "xpi-doctor-"));
    created.push(configured);
    const [configuredSurface] = detectMemoryRootSurfaces(configured);
    expect(configuredSurface?.role).toBe("configured");
    expect(configuredSurface?.present).toBe(true);
    expect(configuredSurface?.inode).toBe(statSync(configured).ino);
  });

  it("lists the three canonical surfaces with distinct inodes", () => {
    const surfaces = detectMemoryRootSurfaces(
      join(homedir(), ".pi", "agent", "xpi-memo"),
    );
    expect(surfaces.map((surface) => surface.role)).toEqual([
      "configured",
      "cli-default",
      "stale",
    ]);
    const inodes = surfaces.map((surface) => surface.inode);
    // Distinct present surfaces must not share an inode (no symlink merging).
    const present = surfaces.filter((surface) => surface.present);
    expect(new Set(present.map((surface) => surface.inode)).size).toBe(present.length);
    expect(new Set(inodes.filter((inode) => inode !== null)).size).toBeLessThanOrEqual(
      inodes.length,
    );
    expect(new Set(inodes.filter((inode) => inode !== null)).size).toBeLessThanOrEqual(
      inodes.length,
    );
  });

  it("detects a missing configured root read-only without creating it (task 6.4)", () => {
    const missing = join(tmpdir(), `xpi-doctor-missing-${Date.now()}`);
    expect(existsSync(missing)).toBe(false);

    const surfaces = detectMemoryRootSurfaces(missing);
    const configured = surfaces.find((surface) => surface.role === "configured");
    expect(configured?.present).toBe(false);
    expect(configured?.inode).toBeNull();

    // Read-only doctor: the missing path stays missing; no root was created.
    expect(existsSync(missing)).toBe(false);
  });

  it("does not create symlinks or merge roots during detection (task 6.4)", () => {
    const configured = mkdtempSync(join(tmpdir(), "xpi-doctor-"));
    created.push(configured);
    const before = readdirSync(configured);

    detectMemoryRootSurfaces(configured);

    // No migration, symlink, or auto-merge side effect in the visible root.
    expect(readdirSync(configured)).toEqual(before);
  });
});
