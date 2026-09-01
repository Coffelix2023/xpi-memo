import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * Discover legacy memoharness data: config, audit log, candidate queue,
 * global bank, and per-project banks.
 */
export interface LegacyDataSummary {
  /** audit.json */
  auditPath?: string;
  /** candidates.json */
  candidatesPath?: string;
  /** ~/.config/memoharness/config.json */
  configPath?: string;
  /** mnemosyne.db (global bank) */
  globalBankPath?: string;
  /** banks/<bank>/mnemosyne.db (project banks) */
  projectBanks: string[];
  /** total size of discovered files in bytes */
  totalBytes: number;
}

const LEGACY_CONFIG_DIR = "memoharness";

export function legacyConfigPath(configHome: string): string {
  return join(configHome, LEGACY_CONFIG_DIR, "config.json");
}

export function discoverLegacyData(
  dataDir: string,
  configHome: string,
): LegacyDataSummary {
  const summary: LegacyDataSummary = {
    projectBanks: [],
    totalBytes: 0,
  };

  const config = legacyConfigPath(configHome);
  if (existsSync(config)) {
    summary.configPath = config;
    summary.totalBytes += statSync(config).size;
  }

  const audit = join(dataDir, "audit.json");
  if (existsSync(audit)) {
    summary.auditPath = audit;
    summary.totalBytes += statSync(audit).size;
  }

  const candidates = join(dataDir, "candidates.json");
  if (existsSync(candidates)) {
    summary.candidatesPath = candidates;
    summary.totalBytes += statSync(candidates).size;
  }

  const globalBank = join(dataDir, "mnemosyne.db");
  if (existsSync(globalBank)) {
    summary.globalBankPath = globalBank;
    summary.totalBytes += statSync(globalBank).size;
  }

  const banksDir = join(dataDir, "banks");
  if (existsSync(banksDir)) {
    for (const entry of readdirSync(banksDir)) {
      const bankDb = join(banksDir, entry, "mnemosyne.db");
      if (existsSync(bankDb)) {
        summary.projectBanks.push(bankDb);
        summary.totalBytes += statSync(bankDb).size;
      }
    }
  }

  return summary;
}

export interface CopyPlanItem {
  bytes: number;
  from: string;
  to: string;
}

export function buildCopyPlan(
  summary: LegacyDataSummary,
  targetDataDir: string,
): CopyPlanItem[] {
  const plan: CopyPlanItem[] = [];
  if (summary.auditPath)
    plan.push({
      bytes: statSync(summary.auditPath).size,
      from: summary.auditPath,
      to: join(targetDataDir, "audit.json"),
    });
  if (summary.candidatesPath)
    plan.push({
      bytes: statSync(summary.candidatesPath).size,
      from: summary.candidatesPath,
      to: join(targetDataDir, "candidates.json"),
    });
  if (summary.globalBankPath)
    plan.push({
      bytes: statSync(summary.globalBankPath).size,
      from: summary.globalBankPath,
      to: join(targetDataDir, "mnemosyne.db"),
    });
  for (const bank of summary.projectBanks) {
    plan.push({
      bytes: statSync(bank).size,
      from: bank,
      to: join(targetDataDir, "banks", banksDirOf(bank), "mnemosyne.db"),
    });
  }
  return plan;
}

function banksDirOf(bankDbPath: string): string {
  // bankDbPath is <legacyDataDir>/banks/<projectDir>/mnemosyne.db
  return basename(dirname(bankDbPath));
}

export function executeCopy(plan: CopyPlanItem[]): {
  copied: number;
  failed: string[];
} {
  let copied = 0;
  const failed: string[] = [];
  for (const item of plan) {
    try {
      mkdirSync(join(item.to, ".."), {
        recursive: true,
      });
      copyFileSync(item.from, item.to);
      copied += 1;
    } catch (error) {
      failed.push(
        `${item.from}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return {
    copied,
    failed,
  };
}
