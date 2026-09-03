import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AUDIT_ACTIONS, type AuditMetadata, createAuditLog } from "./audit.js";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-audit-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe("bounded T1 audit metadata", () => {
  it("supports all governed operation actions", () => {
    expect(AUDIT_ACTIONS).toEqual([
      "write",
      "candidate",
      "confirmation",
      "rejection",
      "recall",
      "fallback",
      "sleep-authorization",
      "cross-layer-promotion",
      "extraction",
    ]);
  });
  it.each(AUDIT_ACTIONS)("records bounded metadata for %s", (action) => {
    const statePath = join(createTemporaryDirectory(), "audit.json");
    const audit = createAuditLog({
      statePath,
    });

    audit.record(action, {
      bank: "default",
      fallback: false,
      kind: "project_gene",
      reason: "bounded-reason",
      scope: "global",
      status: "completed",
      trigger: "explicit-user",
    });

    expect(audit.list()[0]).toMatchObject({
      action,
      metadata: {
        bank: "default",
        fallback: false,
        kind: "project_gene",
        reason: "bounded-reason",
        scope: "global",
        status: "completed",
        trigger: "explicit-user",
      },
    });
  });

  it("records safe metadata without raw payload fields", () => {
    const statePath = join(createTemporaryDirectory(), "audit.json");
    const audit = createAuditLog({
      statePath,
      maxEntries: 10,
    });
    const metadata: AuditMetadata = {
      bank: "project-p-0123456789ab",
      fallback: true,
      kind: "project_gene",
      reason: "embedding-unavailable",
      scope: "global",
      status: "completed",
    };

    audit.record("fallback", metadata);

    expect(audit.list()).toEqual([
      expect.objectContaining({
        action: "fallback",
        metadata,
      }),
    ]);
    const persisted = readFileSync(statePath, "utf8");
    expect(persisted).toContain("embedding-unavailable");
    expect(persisted).not.toContain("content");
    expect(persisted).not.toContain("query");
    expect(persisted).not.toContain("token");
  });

  it("ignores raw payload fields and keeps only the metadata allowlist", () => {
    const statePath = join(createTemporaryDirectory(), "audit.json");
    const audit = createAuditLog({
      statePath,
    });

    audit.record("rejection", {
      content: "api_key=must-not-appear",
      query: "secret query must-not-appear",
      rawPayload: "raw output must-not-appear",
      reason: "secret-like-content",
      token: "token must-not-appear",
    } as AuditMetadata & Record<string, unknown>);

    const serialized = JSON.stringify(audit.list());
    expect(serialized).toContain("secret-like-content");
    expect(serialized).not.toContain("must-not-appear");
  });

  it("bounds audit history by removing the oldest metadata entry", () => {
    const statePath = join(createTemporaryDirectory(), "audit.json");
    const audit = createAuditLog({
      maxEntries: 2,
      statePath,
    });

    audit.record("write", {
      status: "first",
    });
    audit.record("recall", {
      status: "second",
    });
    audit.record("fallback", {
      status: "third",
    });

    expect(audit.list()).toHaveLength(2);
    expect(audit.list().map(({ metadata }) => metadata.status)).toEqual([
      "second",
      "third",
    ]);
  });

  it("does not create an audit file until the first event", () => {
    const statePath = join(createTemporaryDirectory(), "audit.json");
    createAuditLog({
      statePath,
    });

    expect(existsSync(statePath)).toBe(false);
  });
  it("loads a pre-existing audit file and continues appending (task 7.2)", () => {
    const statePath = join(createTemporaryDirectory(), "audit.json");
    // Simulate a historical v1 audit file written before this change: an old
    // action and minimal metadata, no new fields.
    writeFileSync(
      statePath,
      JSON.stringify({
        version: 1,
        entries: [
          {
            action: "write",
            timestamp: "2024-01-01T00:00:00.000Z",
            metadata: {
              bank: "default",
              kind: "global_preference",
              status: "stored",
            },
          },
        ],
      }),
    );

    const audit = createAuditLog({
      statePath,
    });
    expect(audit.list()).toHaveLength(1);
    expect(audit.list()[0]).toEqual({
      action: "write",
      timestamp: "2024-01-01T00:00:00.000Z",
      metadata: {
        bank: "default",
        kind: "global_preference",
        status: "stored",
      },
    });

    audit.record("rejection", {
      identity: "uninitialized",
      kind: "project_decision",
      outcome: "rejected",
      reason: "project-identity-required",
      scope: "project",
    });
    expect(audit.list()).toHaveLength(2);
    expect(audit.list()[1]?.metadata.reason).toBe("project-identity-required");
  });
});
