import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrateConfigFile, translateConfig } from "./config-migrator.js";
import { previewConfigTranslation } from "./config-preview.js";
import { migrate } from "./migrate.js";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir)
      rmSync(dir, {
        force: true,
        recursive: true,
      });
  }
});

describe("translateConfig", () => {
  it("renames MEMOHARNESS_* keys to XPI_MEMO_*", () => {
    const result = translateConfig({
      MEMOHARNESS_LIMIT: "10",
      MEMOHARNESS_PAUSED: "false",
    });
    expect(result.config).toEqual({
      XPI_MEMO_LIMIT: "10",
      XPI_MEMO_PAUSED: "false",
    });
    expect(result.renamedKeys).toHaveLength(2);
  });

  it("passes unknown keys through untouched", () => {
    const result = translateConfig({
      customKey: "keep",
      limit: 5,
    });
    expect(result.config).toEqual({
      customKey: "keep",
      limit: 5,
    });
    expect(result.renamedKeys).toEqual([]);
  });

  it("never copies sensitive keys", () => {
    const result = translateConfig({
      apiKey: "key",
      token: "secret-value",
    });
    expect(result.config).toEqual({});
    expect(result.ignoredKeys).toEqual([
      "apiKey",
      "token",
    ]);
  });
});

describe("migrateConfigFile", () => {
  it("migrates a sample legacy config and translates env-var keys", () => {
    const home = makeTempDir("xpi-memo-migrate-config-");
    const legacyPath = join(home, "memoharness", "config.json");
    const targetPath = join(home, "xpi-memo", "config.json");
    mkdirSync(join(home, "memoharness"), {
      recursive: true,
    });
    writeFileSync(
      legacyPath,
      JSON.stringify({
        MEMOHARNESS_LIMIT: "7",
        paused: true,
      }),
    );

    const result = migrateConfigFile(legacyPath, targetPath);
    expect(result).not.toBeNull();
    expect(result?.config).toEqual({
      paused: true,
      XPI_MEMO_LIMIT: "7",
    });

    const written = JSON.parse(readFileSync(targetPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(written).toEqual({
      paused: true,
      XPI_MEMO_LIMIT: "7",
    });
  });

  it("returns null for missing legacy config", () => {
    const home = makeTempDir("xpi-memo-migrate-missing-");
    expect(
      migrateConfigFile(join(home, "nope.json"), join(home, "out.json")),
    ).toBeNull();
  });

  it("treats corrupt legacy config as empty instead of crashing", () => {
    const home = makeTempDir("xpi-memo-migrate-corrupt-");
    const legacyPath = join(home, "memoharness", "config.json");
    mkdirSync(join(home, "memoharness"), {
      recursive: true,
    });
    writeFileSync(legacyPath, "{not valid json");
    const result = migrateConfigFile(legacyPath, join(home, "xpi-memo", "config.json"));
    expect(result?.config).toEqual({});
  });
});

describe("previewConfigTranslation", () => {
  it("reports renames without writing files", () => {
    const home = makeTempDir("xpi-memo-migrate-preview-");
    const legacyPath = join(home, "memoharness", "config.json");
    mkdirSync(join(home, "memoharness"), {
      recursive: true,
    });
    writeFileSync(
      legacyPath,
      JSON.stringify({
        MEMOHARNESS_LIMIT: "3",
        token: "t",
      }),
    );

    const preview = previewConfigTranslation(legacyPath);
    expect(preview?.renamedKeys).toEqual([
      "MEMOHARNESS_LIMIT -> XPI_MEMO_LIMIT",
    ]);
    expect(preview?.ignoredKeys).toEqual([
      "token",
    ]);
    expect(preview?.ignoredKeys.length).toBe(1);
  });
});

describe("migrate", () => {
  it("dry-run plans copies without modifying any files", async () => {
    const configHome = makeTempDir("xpi-memo-migrate-dry-cfg-");
    const source = makeTempDir("xpi-memo-migrate-dry-src-");
    const target = makeTempDir("xpi-memo-migrate-dry-tgt-");
    writeFileSync(
      join(source, "audit.json"),
      JSON.stringify({
        entries: [],
        version: 1,
      }),
    );
    writeFileSync(
      join(source, "candidates.json"),
      JSON.stringify({
        candidates: {},
        version: 1,
      }),
    );
    mkdirSync(join(configHome, "memoharness"), {
      recursive: true,
    });
    writeFileSync(
      join(configHome, "memoharness", "config.json"),
      JSON.stringify({
        MEMOHARNESS_LIMIT: "5",
      }),
    );

    const report = await migrate({
      configHome,
      dryRun: true,
      from: source,
      targetDataDir: target,
    });

    expect(report.mode).toBe("dry-run");
    expect(report.plan.length).toBeGreaterThanOrEqual(2);
    expect(report.copied).toBe(0);
    expect(report.reportPath).toBeUndefined();
    // dry-run must not write
    const exists = (p: string) => {
      try {
        return readFileSync(p, "utf8").length > 0;
      } catch {
        return false;
      }
    };
    expect(exists(join(target, "audit.json"))).toBe(false);
  });

  it("apply copies data, translates config, writes report, and does not touch originals", async () => {
    const configHome = makeTempDir("xpi-memo-migrate-apply-cfg-");
    const source = makeTempDir("xpi-memo-migrate-apply-src-");
    const target = makeTempDir("xpi-memo-migrate-apply-tgt-");
    const auditContent = JSON.stringify({
      entries: [],
      version: 1,
    });
    writeFileSync(join(source, "audit.json"), auditContent);
    writeFileSync(
      join(source, "candidates.json"),
      JSON.stringify({
        candidates: {},
        version: 1,
      }),
    );
    mkdirSync(join(configHome, "memoharness"), {
      recursive: true,
    });
    writeFileSync(
      join(configHome, "memoharness", "config.json"),
      JSON.stringify({
        MEMOHARNESS_LIMIT: "9",
        secret: "do-not-copy",
      }),
    );

    const report = await migrate({
      apply: true,
      configHome,
      from: source,
      targetDataDir: target,
    });

    expect(report.mode).toBe("apply");
    expect(report.copied).toBe(report.plan.length);
    expect(report.failed).toEqual([]);
    expect(report.validations.every((v) => v.ok)).toBe(true);
    expect(report.configRenamedKeys).toContain("MEMOHARNESS_LIMIT -> XPI_MEMO_LIMIT");
    expect(report.configIgnoredKeys).toContain("secret");
    expect(report.reportPath).toBeDefined();
    if (report.reportPath) {
      const reportText = readFileSync(report.reportPath, "utf8");
      expect(reportText).toContain("# xpi-memo Migration Report");
    }

    // originals untouched, content preserved verbatim (provenance values stay)
    expect(readFileSync(join(source, "audit.json"), "utf8")).toBe(auditContent);
    expect(readFileSync(join(target, "audit.json"), "utf8")).toBe(auditContent);
    expect(readFileSync(join(target, "candidates.json"), "utf8")).toContain(
      "candidates",
    );
  });

  it("warns when no legacy data exists", async () => {
    const configHome = makeTempDir("xpi-memo-migrate-empty-cfg-");
    const source = makeTempDir("xpi-memo-migrate-empty-src-");
    const target = makeTempDir("xpi-memo-migrate-empty-tgt-");
    const report = await migrate({
      configHome,
      dryRun: true,
      from: source,
      targetDataDir: target,
    });
    expect(report.warnings.some((w) => w.includes("No legacy memoharness data"))).toBe(
      true,
    );
    expect(report.plan).toEqual([]);
  });
});
