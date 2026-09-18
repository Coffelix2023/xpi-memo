/**
 * Auto-admission acceptance (tasks 9.1-9.4): offline extraction proposals
 * flow through the real governance boundary (`governOfflineExtractionOutput`)
 * into the real file-backed candidate lifecycle, audit log, and L0
 * coordinator. The mnemosyne CLI boundary is an in-memory mock; kind
 * verifiers are injected for determinism (real rg matching is covered by
 * tool-verification.test.ts).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";

import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createAuditLog } from "./audit.js";
import { createCandidateStore } from "./candidate-lifecycle.js";
import { DEFAULT_XPI_MEMO_CONFIG } from "./config.js";
import type { MemoryKind } from "./kinds.js";
import { createL0Coordinator } from "./l0/l0-runtime.js";
import {
  governOfflineExtractionOutput,
  type OfflineExtractionGovernanceRuntime,
} from "./offline-extraction.js";
import type {
  MnemosyneAdapter,
  MnemosyneRunner,
  T1MemoryOperation,
} from "./operations.js";
import { VERIFIERS, type VerifierFn } from "./tool-verification.js";
import type { VerificationResult } from "./types.js";

const temporaryDirectories: string[] = [];
const BANK = "project-p-test";
const GENE_CONTENT = "The extension loads src/index.ts directly.";

const VERIFIED: VerificationResult = {
  excerpt: "Pi 直接加载 src/index.ts TypeScript 源码。",
  filePath: "AGENTS.md",
  line: 12,
  status: "verified",
  timestamp: "2026-01-02T00:00:00.000Z",
};

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-auto-admission-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory)
      rmSync(directory, {
        force: true,
        recursive: true,
      });
  }
});

function createAdapter(): {
  adapter: MnemosyneAdapter;
  stored: T1MemoryOperation[];
} {
  const stored: T1MemoryOperation[] = [];
  return {
    adapter: {
      async store(operation) {
        stored.push(operation);
        return {
          id: `memory-${stored.length}`,
          operation,
          output: `Stored: memory-${stored.length}`,
        };
      },
    },
    stored,
  };
}

function createRuntime(options: {
  env?: NodeJS.ProcessEnv;
  /** Config-file value for the admission switch; defaults to the real default. */
  autoAdmit?: boolean;
  verifiers?: ReadonlyMap<MemoryKind, VerifierFn>;
}): OfflineExtractionGovernanceRuntime & {
  auditPath: string;
  candidatesPath: string;
  stored: T1MemoryOperation[];
} {
  const dataDir = createTemporaryDirectory();
  // Materialize the project bank so `ensureProjectBank` sees it without
  // calling the runner (same convention as activation-loop.integration).
  mkdirSync(join(dataDir, "banks", BANK), {
    recursive: true,
  });
  const auditPath = join(dataDir, "audit.json");
  const candidatesPath = join(dataDir, "candidates.json");
  const { adapter, stored } = createAdapter();
  const run: MnemosyneRunner = async () => "";
  // ONE audit + ONE l0 instance — separate instances on the same file clobber
  // each other (last writer wins).
  const audit = createAuditLog({
    statePath: auditPath,
  });
  const l0 = createL0Coordinator({
    dataDir,
    enabled: true,
  });
  return {
    adapter,
    audit,
    candidates: createCandidateStore({
      adapter,
      auditLog: audit,
      env: options.env ?? {},
      config: {
        ...DEFAULT_XPI_MEMO_CONFIG,
        autoAdmit: options.autoAdmit ?? true,
      },
      l0,
      statePath: candidatesPath,
      verifiers: options.verifiers ?? new Map(),
    }),
    l0,
    config: {
      dataDir,
      paused: false,
    },
    context: {
      dataDir,
      identity: "git",
      projectBank: BANK,
    },
    run,
    stored,
    auditPath,
    candidatesPath,
  };
}

function proposal(kind: string, content: string): Record<string, unknown> {
  return {
    confidence: 0.9,
    content,
    kind,
    sourceReference: "session:s1#12",
  };
}

function readCandidates(path: string): Array<{
  candidate: {
    evidence: {
      type: string;
    };
  };
}> {
  return Object.values(JSON.parse(readFileSync(path, "utf8")).candidates);
}

function findAudit(path: string, action: string) {
  return createAuditLog({
    statePath: path,
  })
    .list()
    .find((item) => item.action === action);
}

describe("offline extraction auto-admission (tasks 9.1-9.4)", () => {
  it("auto-stores a tool-verified gene proposal by default: no env var needed (stabilize 2.1/4.2)", async () => {
    const setup = createRuntime({
      verifiers: new Map([
        [
          "project_gene",
          async () => VERIFIED,
        ],
      ]),
    });

    const results = await governOfflineExtractionOutput(
      [
        proposal("project_gene", GENE_CONTENT),
      ],
      setup,
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      kind: "project_gene",
      status: "stored",
    });
    // `autoAdmit: true` is the config default, so no env var is required.
    expect(setup.stored).toHaveLength(1);
    expect(setup.stored[0]?.source.evidenceType).toBe("verified-repository-fact");
    const entry = findAudit(setup.auditPath, "tool-verified");
    expect(entry?.metadata.candidateId).toBeDefined();
    expect(entry?.metadata.decision).toBe("auto-stored");
    // Nothing left pending.
    expect(readCandidates(setup.candidatesPath)).toHaveLength(0);
  });

  it("lets XPI_MEMO_AUTO_ADMIT override a config file that disables auto-admit (stabilize 3.2/4.2)", async () => {
    const setup = createRuntime({
      autoAdmit: false,
      verifiers: new Map([
        [
          "project_gene",
          async () => VERIFIED,
        ],
      ]),
      env: {
        XPI_MEMO_AUTO_ADMIT: "true",
      },
    });

    const results = await governOfflineExtractionOutput(
      [
        proposal("project_gene", GENE_CONTENT),
      ],
      setup,
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      kind: "project_gene",
      status: "stored",
    });
    // Mnemosyne holds the memory with upgraded evidence in the project bank.
    expect(setup.stored).toHaveLength(1);
    expect(setup.stored[0]?.targetBank).toBe(BANK);
    expect(setup.stored[0]?.content).toBe(GENE_CONTENT);
    expect(setup.stored[0]?.source.evidenceType).toBe("verified-repository-fact");
    // audit.json carries the verification evidence, keyed by candidate.
    const entry = findAudit(setup.auditPath, "tool-verified");
    expect(entry?.metadata.candidateId).toBeDefined();
    expect(entry?.metadata.filePath).toBe("AGENTS.md");
    expect(entry?.metadata.decision).toBe("auto-stored");
    expect(Number.isNaN(Date.parse(entry?.timestamp ?? ""))).toBe(false);
    // Nothing left pending.
    expect(readCandidates(setup.candidatesPath)).toHaveLength(0);
  });

  it("holds every candidate when XPI_MEMO_AUTO_ADMIT=false overrides the config default", async () => {
    const setup = createRuntime({
      autoAdmit: false,
      verifiers: new Map([
        [
          "project_gene",
          async () => VERIFIED,
        ],
      ]),
      env: {
        XPI_MEMO_AUTO_ADMIT: "false",
      },
    });

    const results = await governOfflineExtractionOutput(
      [
        proposal("project_gene", GENE_CONTENT),
      ],
      setup,
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      kind: "project_gene",
      status: "candidate",
    });
    expect(setup.stored).toHaveLength(0);
    // The candidate is held before verification runs, so no verification
    // result is recorded either.
    expect(findAudit(setup.auditPath, "tool-verified")).toBeUndefined();
    // The candidate survives for manual Store/Later/Reject.
    expect(readCandidates(setup.candidatesPath)).toHaveLength(1);
  });

  it("admits a gene proposal that has no repository-fact declaration", async () => {
    // Real verifier (no mocks): a proposal without a declaration cannot be
    // verified, and the default preference admits it anyway.
    const setup = createRuntime({
      verifiers: VERIFIERS,
    });

    const results = await governOfflineExtractionOutput(
      [
        proposal("project_gene", GENE_CONTENT),
      ],
      setup,
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      status: "stored",
    });
    expect(readCandidates(setup.candidatesPath)).toHaveLength(0);
    expect(setup.stored).toHaveLength(1);
    // The unverifiable declaration is still visible on the audit trail.
    expect(
      findAudit(setup.auditPath, "tool-verification-failed")?.metadata.reason,
    ).toBe("no-declaration");
  });

  it("admits a gene proposal whose tool verification failed (task 9.2)", async () => {
    const setup = createRuntime({
      verifiers: new Map([
        [
          "project_gene",
          async (): Promise<VerificationResult> => ({
            reason: "no-match",
            status: "failed",
          }),
        ],
      ]),
    });

    const results = await governOfflineExtractionOutput(
      [
        proposal("project_gene", GENE_CONTENT),
      ],
      setup,
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      status: "stored",
    });
    // No upgrade without a passing verification, but the write still happens.
    expect(setup.stored).toHaveLength(1);
    expect(setup.stored[0]?.source.evidenceType).toBe("l0-conclusion");
    expect(readCandidates(setup.candidatesPath)).toHaveLength(0);
    // audit.json records why verification failed.
    expect(
      findAudit(setup.auditPath, "tool-verification-failed")?.metadata.reason,
    ).toBe("no-match");
  });

  it("skips tool verification for decision proposals (task 9.3)", async () => {
    const setup = createRuntime({
      verifiers: new Map([
        [
          "project_decision",
          async () => {
            throw new Error("verifier must not run for decision kind");
          },
        ],
      ]),
    });

    const results = await governOfflineExtractionOutput(
      [
        proposal("project_decision", "We chose pnpm over npm for scripts."),
      ],
      setup,
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      status: "stored",
    });
    expect(readCandidates(setup.candidatesPath)).toHaveLength(0);
    expect(setup.stored).toHaveLength(1);
    expect(findAudit(setup.auditPath, "tool-verified")).toBeUndefined();
  });

  it("queues every proposal when XPI_MEMO_AUTO_VERIFY=false (task 9.4)", async () => {
    const setup = createRuntime({
      // Would verify if the kill switch did not short-circuit the policy.
      verifiers: new Map([
        [
          "project_gene",
          async () => VERIFIED,
        ],
      ]),
      env: {
        XPI_MEMO_AUTO_VERIFY: "false",
      },
    });

    const results = await governOfflineExtractionOutput(
      [
        proposal("project_gene", GENE_CONTENT),
      ],
      setup,
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      status: "candidate",
    });
    expect(readCandidates(setup.candidatesPath)).toHaveLength(1);
    expect(setup.stored).toHaveLength(0);
    expect(findAudit(setup.auditPath, "tool-verified")).toBeUndefined();
    expect(findAudit(setup.auditPath, "tool-verification-failed")).toBeUndefined();
  });
});
