/**
 * CLI parsing for `xpi-memo migrate`.
 *
 * Usage:
 *   xpi-memo migrate --from ~/.pi/agent/memoharness --dry-run
 *   xpi-memo migrate --from ~/.pi/agent/memoharness --apply
 *
 * Flags:
 *   --from <dir>    Legacy memoharness data dir (default ~/.pi/agent/memoharness)
 *   --dry-run       Show what would be copied without modifying any files
 *   --apply         Execute the migration and write a Markdown report
 *   --help          Show this usage text
 */

import { migrate } from "../migration/migrate.js";

export interface MigrateCliArgs {
  apply: boolean;
  dryRun: boolean;
  from?: string;
  help: boolean;
  invalid: string[];
}

export function parseMigrateArgs(args: string[]): MigrateCliArgs {
  const parsed: MigrateCliArgs = {
    apply: false,
    dryRun: false,
    help: false,
    invalid: [],
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--from") {
      const value = args[index + 1];
      if (value === undefined) parsed.invalid.push("--from requires a directory");
      else {
        parsed.from = value;
        index += 1;
      }
    } else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--apply") parsed.apply = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else parsed.invalid.push(arg);
  }
  return parsed;
}

export const MIGRATE_USAGE = `xpi-memo migrate — import data from memoharness

Usage:
  xpi-memo migrate --from ~/.pi/agent/memoharness --dry-run
  xpi-memo migrate --from ~/.pi/agent/memoharness --apply

Flags:
  --from <dir>   Legacy memoharness data dir
                 (default: ~/.pi/agent/memoharness)
  --dry-run      Show files to copy, config translations, and sizes
                 without modifying anything
  --apply        Copy banks, audit log, and candidates; translate
                 ~/.config/memoharness/config.json to
                 ~/.config/xpi-memo/config.json; write a report to
                 <dataDir>/migration-report-<timestamp>.md
  --help         Show this help

What gets migrated:
  - mnemosyne.db (global bank) and banks/project-*/mnemosyne.db
  - audit.json (provenance values preserved verbatim)
  - candidates.json (candidate state preserved)
  - User config with MEMOHARNESS_* keys renamed to XPI_MEMO_*`;

export async function runMigrateCommand(args: string[]): Promise<string> {
  const parsed = parseMigrateArgs(args);
  if (parsed.invalid.length > 0) {
    return `Unknown arguments: ${parsed.invalid.join(", ")}\n\n${MIGRATE_USAGE}`;
  }
  if (parsed.help || (!parsed.dryRun && !parsed.apply)) {
    return MIGRATE_USAGE;
  }

  const report = await migrate({
    apply: parsed.apply,
    dryRun: parsed.dryRun,
    from: parsed.from,
  });

  const lines = [
    `Mode: ${report.mode}`,
    `Source: ${report.sourceDataDir}`,
    `Target: ${report.targetDataDir}`,
    ...report.plan.map(
      (item) =>
        `  ${report.mode === "apply" ? "copied" : "would copy"} ${item.from} -> ${item.to}`,
    ),
  ];
  for (const key of report.configRenamedKeys) lines.push(`  config renamed: ${key}`);
  for (const key of report.configIgnoredKeys)
    lines.push(`  config ignored (secret): ${key}`);
  for (const warning of report.warnings) lines.push(`warning: ${warning}`);
  for (const validation of report.validations)
    lines.push(
      `  [${validation.ok ? "ok" : "FAIL"}] ${validation.name}: ${validation.detail}`,
    );
  if (report.reportPath) lines.push(`report: ${report.reportPath}`);
  lines.push(
    report.mode === "apply"
      ? `Migration complete: ${report.copied}/${report.plan.length} files copied.`
      : `Dry-run complete: ${report.plan.length} files would be copied. Re-run with --apply.`,
  );
  return lines.join("\n");
}
