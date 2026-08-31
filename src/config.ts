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
  dataDir: join(homedir(), ".pi", "agent", "xpi-memo"),
  globalLimit: 5,
  limit: 5,
  paused: false,
  projectLimit: 5,
  recallPolicy: "high-value-auto",
  retrievalMode: "hybrid",
} as const;

const LEGACY_MEMOHARNESS_DATA_DIR = join(homedir(), ".local", "share", "memoharness");

export function legacyDataDirExists(): boolean {
  return existsSync(LEGACY_MEMOHARNESS_DATA_DIR);
}

export type RetrievalMode = "fts5" | "hybrid";

export interface XpiMemoConfig {
  dataDir: string;
  globalLimit: number;
  limit: number;
  paused: boolean;
  projectLimit: number;
  recallPolicy: RecallPolicy;
  retrievalMode: RetrievalMode;
}

export interface UserConfig {
  dataDir?: unknown;
  globalLimit?: unknown;
  limit?: unknown;
  paused?: unknown;
  projectLimit?: unknown;
  recallPolicy?: unknown;
  retrievalMode?: unknown;
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
      | "limit"
      | "paused"
      | "projectLimit"
      | "recallPolicy"
      | "retrievalMode"
    >
  >;
}

const WRITABLE_KEYS = new Set([
  "globalLimit",
  "limit",
  "paused",
  "projectLimit",
  "recallPolicy",
  "retrievalMode",
]);
const ENV_KEYS: Record<string, string> = {
  globalLimit: "XPI_MEMO_GLOBAL_LIMIT",
  limit: "XPI_MEMO_LIMIT",
  paused: "XPI_MEMO_PAUSED",
  projectLimit: "XPI_MEMO_PROJECT_LIMIT",
  recallPolicy: "XPI_MEMO_RECALL_POLICY",
  retrievalMode: "XPI_MEMO_RETRIEVAL_MODE",
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

export function loadConfig(options: LoadConfigOptions = {}): LoadConfigResult {
  const env = options.env ?? process.env;
  const configHome =
    options.configHome ??
    envString(env, "XDG_CONFIG_HOME") ??
    join(homedir(), ".config");
  const user = readUserConfig(configFilePath(configHome));
  const environmentRecallPolicy = envString(env, "XPI_MEMO_RECALL_POLICY");
  const environmentRetrievalMode = envString(env, "XPI_MEMO_RETRIEVAL_MODE");
  const environmentPaused = envString(env, "XPI_MEMO_PAUSED");
  const config: XpiMemoConfig = {
    dataDir:
      envString(env, "XPI_MEMO_DATA_DIR") ??
      (nonEmptyString(user.config.dataDir)
        ? user.config.dataDir.trim()
        : DEFAULT_XPI_MEMO_CONFIG.dataDir),
    globalLimit:
      envPositiveInteger(env, "XPI_MEMO_GLOBAL_LIMIT") ??
      (positiveInteger(user.config.globalLimit)
        ? user.config.globalLimit
        : DEFAULT_XPI_MEMO_CONFIG.globalLimit),
    limit:
      envPositiveInteger(env, "XPI_MEMO_LIMIT") ??
      (positiveInteger(user.config.limit)
        ? user.config.limit
        : DEFAULT_XPI_MEMO_CONFIG.limit),
    paused: (() => {
      if (environmentPaused === "true") return true;
      if (environmentPaused === "false") return false;
      return boolean(user.config.paused)
        ? user.config.paused
        : DEFAULT_XPI_MEMO_CONFIG.paused;
    })(),
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
  };

  return {
    config,
    ignoredKeys: user.ignoredKeys,
  };
}
