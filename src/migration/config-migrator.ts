import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

/**
 * Migrate legacy memoharness user config to xpi-memo.
 * Translates MEMOHARNESS_* env-var-style keys to XPI_MEMO_* equivalents.
 * Unknown keys are passed through untouched; sensitive keys are never copied.
 */
export interface ConfigMigrationResult {
  /** translated config written to target */
  config: Record<string, unknown>;
  /** keys skipped because they hold secrets */
  ignoredKeys: string[];
  /** keys renamed during translation */
  renamedKeys: string[];
}

const SENSITIVE_KEYS = new Set([
  "apiKey",
  "credential",
  "password",
  "secret",
  "token",
]);
const ENV_KEY_PREFIX = "MEMOHARNESS_";
const NEW_ENV_KEY_PREFIX = "XPI_MEMO_";

export function translateConfig(
  legacyConfig: Record<string, unknown>,
): ConfigMigrationResult {
  const config: Record<string, unknown> = {};
  const renamedKeys: string[] = [];
  const ignoredKeys: string[] = [];

  for (const [key, value] of Object.entries(legacyConfig)) {
    if (SENSITIVE_KEYS.has(key)) {
      ignoredKeys.push(key);
      continue;
    }
    if (key.startsWith(ENV_KEY_PREFIX)) {
      const newKey = `${NEW_ENV_KEY_PREFIX}${key.slice(ENV_KEY_PREFIX.length)}`;
      config[newKey] = value;
      renamedKeys.push(`${key} -> ${newKey}`);
      continue;
    }
    config[key] = value;
  }

  return {
    config,
    renamedKeys,
    ignoredKeys: ignoredKeys.sort(),
  };
}

export function migrateConfigFile(
  legacyPath: string,
  targetPath: string,
): ConfigMigrationResult | null {
  if (!existsSync(legacyPath)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(legacyPath, "utf8"));
  } catch {
    // Corrupt legacy config: fail closed by treating it as empty rather than crashing.
    return {
      config: {},
      ignoredKeys: [],
      renamedKeys: [],
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      config: {},
      ignoredKeys: [],
      renamedKeys: [],
    };
  }
  const result = translateConfig(parsed as Record<string, unknown>);
  mkdirSync(dirname(targetPath), {
    mode: 0o700,
    recursive: true,
  });
  const temporaryPath = `${targetPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(result.config, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, targetPath);
  return result;
}
