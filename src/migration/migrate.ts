import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { loadConfig } from "../config.js";
import { migrateConfigFile } from "./config-migrator.js";
import { previewConfigTranslation } from "./config-preview.js";
import {
  buildCopyPlan,
  type CopyPlanItem,
  discoverLegacyData,
  executeCopy,
  type LegacyDataSummary,
  legacyConfigPath,
} from "./legacy-data.js";

export interface MigrateOptions {
  apply?: boolean;
  /** override XDG config home (defaults to ~/.config) */
  configHome?: string;
  dryRun?: boolean;
  /** legacy memoharness data dir, default ~/.pi/agent/memoharness */
  from?: string;
  log?: (message: string) => void;
  /** override target data dir (defaults to resolved xpi-memo config) */
  targetDataDir?: string;
}

export interface MigrateReport {
  configIgnoredKeys: string[];
  configRenamedKeys: string[];
  copied: number;
  failed: string[];
  found: LegacyDataSummary;
  mode: "dry-run" | "apply";
  plan: CopyPlanItem[];
  reportPath?: string;
  sourceDataDir: string;
  targetDataDir: string;
  validations: ValidationResult[];
  warnings: string[];
}

export interface ValidationResult {
  detail: string;
  name: string;
  ok: boolean;
}

interface MigratePaths {
  configHome: string;
  legacyConfigFile: string;
  sourceDataDir: string;
  targetConfigFile: string;
  targetDataDir: string;
}

function resolvePaths(options: MigrateOptions): MigratePaths {
  const configHome =
    options.configHome ?? process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return {
    configHome,
    legacyConfigFile: legacyConfigPath(configHome),
    sourceDataDir: options.from ?? join(homedir(), ".pi", "agent", "memoharness"),
    targetConfigFile: join(configHome, "xpi-memo", "config.json"),
    targetDataDir:
      options.targetDataDir ??
      loadConfig({
        configHome,
      }).config.dataDir,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function collectWarnings(
  found: LegacyDataSummary,
  plan: CopyPlanItem[],
  sourceDataDir: string,
  targetDataDir: string,
): string[] {
  const warnings: string[] = [];
  const empty =
    !found.configPath &&
    !found.auditPath &&
    !found.candidatesPath &&
    !found.globalBankPath &&
    found.projectBanks.length === 0;
  if (empty) warnings.push(`No legacy memoharness data found at ${sourceDataDir}`);
  if (existsSync(targetDataDir) && plan.some((item) => existsSync(item.to))) {
    warnings.push(
      "Target files already exist and will be OVERWRITTEN (previous migration or existing xpi-memo data)",
    );
  }
  return warnings;
}

interface ApplyResult {
  configIgnoredKeys: string[];
  configRenamedKeys: string[];
  copied: number;
  failed: string[];
}

function applyMigration(
  plan: CopyPlanItem[],
  paths: MigratePaths,
  log: (message: string) => void,
): ApplyResult {
  for (const item of plan) log(`copying ${item.from} -> ${item.to}`);
  const copyResult = executeCopy(plan);

  let configRenamedKeys: string[] = [];
  let configIgnoredKeys: string[] = [];
  const configResult = migrateConfigFile(
    paths.legacyConfigFile,
    paths.targetConfigFile,
  );
  if (configResult) {
    configRenamedKeys = configResult.renamedKeys;
    configIgnoredKeys = configResult.ignoredKeys;
  }
  return {
    ...copyResult,
    configIgnoredKeys,
    configRenamedKeys,
  };
}

function previewMigration(
  plan: CopyPlanItem[],
  paths: MigratePaths,
  log: (message: string) => void,
): ApplyResult {
  for (const item of plan)
    log(`[dry-run] would copy ${item.from} (${formatBytes(item.bytes)})`);
  const preview = previewConfigTranslation(paths.legacyConfigFile);
  return {
    configIgnoredKeys: preview?.ignoredKeys ?? [],
    configRenamedKeys: preview?.renamedKeys ?? [],
    copied: 0,
    failed: [],
  };
}

function validateMigration(plan: CopyPlanItem[]): ValidationResult[] {
  const missing = plan.filter((item) => !existsSync(item.to)).map((item) => item.to);
  const results: ValidationResult[] = [
    {
      detail:
        missing.length === 0
          ? `all ${plan.length} planned files present at target`
          : `missing at target: ${missing.join(", ")}`,
      name: "file-count",
      ok: missing.length === 0,
    },
  ];

  const sizeMismatches = plan
    .filter((item) => existsSync(item.to) && statSync(item.to).size !== item.bytes)
    .map((item) => item.to);
  results.push({
    detail:
      sizeMismatches.length === 0
        ? "all sizes match"
        : `size mismatch: ${sizeMismatches.join(", ")}`,
    name: "file-sizes",
    ok: sizeMismatches.length === 0,
  });
  return results;
}

function writeReport(report: MigrateReport): string {
  const lines = [
    "# xpi-memo Migration Report",
    "",
    `- Mode: ${report.mode}`,
    `- Source: ${report.sourceDataDir}`,
    `- Target: ${report.targetDataDir}`,
    `- Files copied: ${report.copied}/${report.plan.length}`,
    "",
    "## Plan",
    "",
    ...report.plan.map(
      (item) => `- ${item.from} -> ${item.to} (${formatBytes(item.bytes)})`,
    ),
    "",
    "## Config translation",
    "",
    ...(report.configRenamedKeys.length > 0
      ? report.configRenamedKeys.map((key) => `- renamed: ${key}`)
      : [
          "- no renamed keys",
        ]),
    ...report.configIgnoredKeys.map((key) => `- ignored (secret): ${key}`),
    "",
    "## Validation",
    "",
    ...(report.validations.length > 0
      ? report.validations.map((v) => `- [${v.ok ? "x" : " "}] ${v.name}: ${v.detail}`)
      : [
          "- (dry-run: skipped)",
        ]),
    "",
    "## Warnings",
    "",
    ...(report.warnings.length > 0
      ? report.warnings.map((w) => `- ${w}`)
      : [
          "- none",
        ]),
    "",
  ];
  const path = join(report.targetDataDir, `migration-report-${Date.now()}.md`);
  mkdirSync(dirname(path), {
    recursive: true,
  });
  writeFileSync(path, lines.join("\n"), {
    mode: 0o600,
  });
  return path;
}

export async function migrate(options: MigrateOptions = {}): Promise<MigrateReport> {
  const paths = resolvePaths(options);
  const found = discoverLegacyData(paths.sourceDataDir, paths.configHome);
  const plan = buildCopyPlan(found, paths.targetDataDir);
  const warnings = collectWarnings(
    found,
    plan,
    paths.sourceDataDir,
    paths.targetDataDir,
  );

  const isApply = options.apply === true && options.dryRun !== true;
  const mode: MigrateReport["mode"] = isApply ? "apply" : "dry-run";

  const log = options.log ?? (() => {});
  const outcome = isApply
    ? applyMigration(plan, paths, log)
    : previewMigration(plan, paths, log);
  const validations = isApply ? validateMigration(plan) : [];
  const allWarnings = [
    ...warnings,
    ...outcome.failed.map((item) => `Copy failed: ${item}`),
    ...validations
      .filter((v) => !v.ok)
      .map((v) => `Validation failed: ${v.name}: ${v.detail}`),
  ];

  const report: MigrateReport = {
    configIgnoredKeys: outcome.configIgnoredKeys,
    configRenamedKeys: outcome.configRenamedKeys,
    copied: outcome.copied,
    failed: outcome.failed,
    found,
    mode,
    plan,
    sourceDataDir: paths.sourceDataDir,
    targetDataDir: paths.targetDataDir,
    validations,
    warnings: allWarnings,
  };

  if (isApply) report.reportPath = writeReport(report);
  return report;
}
