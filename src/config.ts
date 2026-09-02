import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { RecallPolicy } from "./recall-policy.js";
export const DEFAULT_XPI_MEMO_CONFIG = {
  autoExport: false,
  dataDir: join(homedir(), ".pi", "agent", "xpi-memo"),
  excludeToolResults: false,
  globalLimit: 5,
  l0Enabled: true,
  limit: 5,
  offlineExtractionEnabled: false,
  paused: false,
  privacy: false,
  projectLimit: 5,
  recallPolicy: "high-value-auto",
  retrievalMode: "hybrid",
  searchBackend: "auto",
} as const;

export type RetrievalMode = "fts5" | "hybrid";

/**
 * Search backend selection (Task 13.1). "auto" walks the fallback chain
 * (mnemosyne → ripgrep → qmd); a pinned name uses that backend first.
 */
export type SearchBackendSetting = "auto" | "mnemosyne" | "ripgrep" | "qmd";

export interface XpiMemoConfig {
  autoExport: boolean;
  dataDir: string;
  excludeToolResults: boolean;
  globalLimit: number;
  l0Enabled: boolean;
  limit: number;
  offlineExtractionEnabled: boolean;
  paused: boolean;
  privacy: boolean;
  projectLimit: number;
  recallPolicy: RecallPolicy;
  retrievalMode: RetrievalMode;
  /** "auto" walks the fallback chain; a backend name pins it. */
  searchBackend: SearchBackendSetting;
}

export interface UserConfig {
  autoExport?: unknown;
  dataDir?: unknown;
  excludeToolResults?: unknown;
  globalLimit?: unknown;
  l0Enabled?: unknown;
  limit?: unknown;
  offlineExtractionEnabled?: unknown;
  paused?: unknown;
  privacy?: unknown;
  projectLimit?: unknown;
  recallPolicy?: unknown;
  retrievalMode?: unknown;
  searchBackend?: unknown;
  [key: string]: unknown;
}

export interface LoadConfigOptions {
  configHome?: string;
  env?: NodeJS.ProcessEnv;
}

export interface LoadConfigResult {
  config: XpiMemoConfig;
  ignoredKeys: string[];
}

const CONFIG_DIRECTORY = "xpi-memo";
const CONFIG_FILE = "config.json";
const SENSITIVE_KEYS = new Set([
  "apiKey",
  "credential",
  "password",
  "secret",
  "token",
]);

function configFilePath(configHome: string): string {
  return join(configHome, CONFIG_DIRECTORY, CONFIG_FILE);
}

function readUserConfig(path: string): {
  config: UserConfig;
  ignoredKeys: string[];
} {
  if (!existsSync(path))
    return {
      config: {},
      ignoredKeys: [],
    };
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        config: {},
        ignoredKeys: [],
      };
    }
    const config = parsed as UserConfig;
    return {
      config,
      ignoredKeys: Object.keys(config)
        .filter((key) => SENSITIVE_KEYS.has(key))
        .sort(),
    };
  } catch {
    return {
      config: {},
      ignoredKeys: [],
    };
  }
}

export interface SaveUserConfigOptions {
  configHome?: string;
  env?: NodeJS.ProcessEnv;
  values: Partial<
    Pick<
      XpiMemoConfig,
      | "globalLimit"
      | "l0Enabled"
      | "limit"
      | "offlineExtractionEnabled"
      | "paused"
      | "projectLimit"
      | "recallPolicy"
      | "retrievalMode"
      | "searchBackend"
    >
  >;
}

const WRITABLE_KEYS = new Set([
  "autoExport",
  "excludeToolResults",
  "globalLimit",
  "l0Enabled",
  "limit",
  "offlineExtractionEnabled",
  "paused",
  "privacy",
  "projectLimit",
  "recallPolicy",
  "retrievalMode",
  "searchBackend",
]);
const ENV_KEYS: Record<string, string> = {
  autoExport: "XPI_MEMO_AUTO_EXPORT",
  excludeToolResults: "XPI_MEMO_EXCLUDE_TOOL_RESULTS",
  globalLimit: "XPI_MEMO_GLOBAL_LIMIT",
  l0Enabled: "XPI_MEMO_L0_ENABLED",
  limit: "XPI_MEMO_LIMIT",
  offlineExtractionEnabled: "XPI_MEMO_OFFLINE_EXTRACTION_ENABLED",
  paused: "XPI_MEMO_PAUSED",
  privacy: "XPI_MEMO_PRIVACY",
  projectLimit: "XPI_MEMO_PROJECT_LIMIT",
  recallPolicy: "XPI_MEMO_RECALL_POLICY",
  retrievalMode: "XPI_MEMO_RETRIEVAL_MODE",
  searchBackend: "XPI_MEMO_SEARCH_BACKEND",
};

export function saveUserConfig({
  configHome,
  env = process.env,
  values,
}: SaveUserConfigOptions): void {
  const home =
    configHome ?? envString(env, "XDG_CONFIG_HOME") ?? join(homedir(), ".config");
  const path = configFilePath(home);
  const existing = readUserConfig(path).config;
  const updates = Object.fromEntries(
    Object.entries(values).filter(
      ([key]) => WRITABLE_KEYS.has(key) && !envString(env, ENV_KEYS[key] ?? ""),
    ),
  );
  const next = Object.fromEntries(
    Object.entries({
      ...existing,
      ...updates,
    }).filter(([key]) => WRITABLE_KEYS.has(key)),
  );
  mkdirSync(dirname(path), {
    mode: 0o700,
    recursive: true,
  });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporaryPath, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort on platforms without POSIX permissions.
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function recallPolicy(value: unknown): value is RecallPolicy {
  return value === "active" || value === "assist" || value === "high-value-auto";
}

function retrievalMode(value: unknown): value is RetrievalMode {
  return value === "fts5" || value === "hybrid";
}

function searchBackend(value: unknown): value is SearchBackendSetting {
  return (
    value === "auto" || value === "mnemosyne" || value === "ripgrep" || value === "qmd"
  );
}

function envString(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return nonEmptyString(value) ? value.trim() : undefined;
}

function envPositiveInteger(env: NodeJS.ProcessEnv, name: string): number | undefined {
  const value = Number(env[name]);
  return positiveInteger(value) ? value : undefined;
}

function boolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function resolveRecallPolicy(
  environmentValue: string | undefined,
  userValue: unknown,
): RecallPolicy {
  if (recallPolicy(environmentValue)) return environmentValue;
  if (recallPolicy(userValue)) return userValue;
  return DEFAULT_XPI_MEMO_CONFIG.recallPolicy;
}

function resolveRetrievalMode(
  environmentValue: string | undefined,
  userValue: unknown,
): RetrievalMode {
  if (retrievalMode(environmentValue)) return environmentValue;
  if (retrievalMode(userValue)) return userValue;
  return DEFAULT_XPI_MEMO_CONFIG.retrievalMode;
}

function resolveSearchBackend(
  environmentValue: string | undefined,
  userValue: unknown,
): SearchBackendSetting {
  if (searchBackend(environmentValue)) return environmentValue;
  if (searchBackend(userValue)) return userValue;
  return DEFAULT_XPI_MEMO_CONFIG.searchBackend;
}

export function loadConfig(options: LoadConfigOptions = {}): LoadConfigResult {
  const env = options.env ?? process.env;
  const configHome =
    options.configHome ??
    envString(env, "XDG_CONFIG_HOME") ??
    join(homedir(), ".config");
  const user = readUserConfig(configFilePath(configHome));
  const environmentRecallPolicy = envString(env, "XPI_MEMO_RECALL_POLICY");
  const environmentRetrievalMode = envString(env, "XPI_MEMO_RETRIEVAL_MODE");
  const environmentSearchBackend = envString(env, "XPI_MEMO_SEARCH_BACKEND");
  const environmentPaused = envString(env, "XPI_MEMO_PAUSED");
  const envBool = (name: string, fallback: boolean): boolean => {
    const value = envString(env, name);
    if (value === "true") return true;
    if (value === "false") return false;
    return fallback;
  };
  const config: XpiMemoConfig = {
    autoExport: envBool(
      "XPI_MEMO_AUTO_EXPORT",
      boolean(user.config.autoExport)
        ? user.config.autoExport
        : DEFAULT_XPI_MEMO_CONFIG.autoExport,
    ),
    dataDir:
      envString(env, "XPI_MEMO_DATA_DIR") ??
      (nonEmptyString(user.config.dataDir)
        ? user.config.dataDir.trim()
        : DEFAULT_XPI_MEMO_CONFIG.dataDir),
    excludeToolResults: envBool(
      "XPI_MEMO_EXCLUDE_TOOL_RESULTS",
      boolean(user.config.excludeToolResults)
        ? user.config.excludeToolResults
        : DEFAULT_XPI_MEMO_CONFIG.excludeToolResults,
    ),
    globalLimit:
      envPositiveInteger(env, "XPI_MEMO_GLOBAL_LIMIT") ??
      (positiveInteger(user.config.globalLimit)
        ? user.config.globalLimit
        : DEFAULT_XPI_MEMO_CONFIG.globalLimit),
    l0Enabled: (() => {
      const environmentValue = envString(env, "XPI_MEMO_L0_ENABLED");
      if (environmentValue === "true") return true;
      if (environmentValue === "false") return false;
      return boolean(user.config.l0Enabled)
        ? user.config.l0Enabled
        : DEFAULT_XPI_MEMO_CONFIG.l0Enabled;
    })(),
    limit:
      envPositiveInteger(env, "XPI_MEMO_LIMIT") ??
      (positiveInteger(user.config.limit)
        ? user.config.limit
        : DEFAULT_XPI_MEMO_CONFIG.limit),
    offlineExtractionEnabled: envBool(
      "XPI_MEMO_OFFLINE_EXTRACTION_ENABLED",
      boolean(user.config.offlineExtractionEnabled)
        ? user.config.offlineExtractionEnabled
        : DEFAULT_XPI_MEMO_CONFIG.offlineExtractionEnabled,
    ),
    paused: (() => {
      if (environmentPaused === "true") return true;
      if (environmentPaused === "false") return false;
      return boolean(user.config.paused)
        ? user.config.paused
        : DEFAULT_XPI_MEMO_CONFIG.paused;
    })(),
    privacy: envBool(
      "XPI_MEMO_PRIVACY",
      boolean(user.config.privacy)
        ? user.config.privacy
        : DEFAULT_XPI_MEMO_CONFIG.privacy,
    ),
    projectLimit:
      envPositiveInteger(env, "XPI_MEMO_PROJECT_LIMIT") ??
      (positiveInteger(user.config.projectLimit)
        ? user.config.projectLimit
        : DEFAULT_XPI_MEMO_CONFIG.projectLimit),
    recallPolicy: resolveRecallPolicy(
      environmentRecallPolicy,
      user.config.recallPolicy,
    ),
    retrievalMode: resolveRetrievalMode(
      environmentRetrievalMode,
      user.config.retrievalMode,
    ),
    searchBackend: resolveSearchBackend(
      environmentSearchBackend,
      user.config.searchBackend,
    ),
  };

  return {
    config,
    ignoredKeys: user.ignoredKeys,
  };
}
