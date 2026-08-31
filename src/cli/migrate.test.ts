import { describe, expect, it } from "vitest";
import { MIGRATE_USAGE, parseMigrateArgs, runMigrateCommand } from "./migrate.js";

describe("parseMigrateArgs", () => {
  it("parses --from, --dry-run, and --apply flags", () => {
    const parsed = parseMigrateArgs([
      "--from",
      "/tmp/legacy",
      "--apply",
    ]);
    expect(parsed.from).toBe("/tmp/legacy");
    expect(parsed.apply).toBe(true);
    expect(parsed.dryRun).toBe(false);
    expect(parsed.invalid).toEqual([]);
  });

  it("flags unknown arguments", () => {
    const parsed = parseMigrateArgs([
      "--bogus",
    ]);
    expect(parsed.invalid).toEqual([
      "--bogus",
    ]);
  });

  it("requires a value after --from", () => {
    const parsed = parseMigrateArgs([
      "--from",
    ]);
    expect(parsed.invalid).toContain("--from requires a directory");
  });
});

describe("runMigrateCommand", () => {
  it("shows complete usage with path examples on --help", async () => {
    const output = await runMigrateCommand([
      "--help",
    ]);
    expect(output).toContain(
      "xpi-memo migrate --from ~/.pi/agent/memoharness --dry-run",
    );
    expect(output).toContain("xpi-memo migrate --from ~/.pi/agent/memoharness --apply");
    expect(output).toContain("--dry-run");
    expect(output).toContain("--apply");
    expect(output).toContain("migration-report-");
  });

  it("shows usage when no mode flag is given", async () => {
    const output = await runMigrateCommand([]);
    expect(output).toBe(MIGRATE_USAGE);
  });

  it("rejects unknown arguments with usage", async () => {
    const output = await runMigrateCommand([
      "--nope",
    ]);
    expect(output).toContain("Unknown arguments: --nope");
    expect(output).toContain("Usage:");
  });
});
