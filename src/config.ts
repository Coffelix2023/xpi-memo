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

import {
  formatMentalModelDefinitionList,
  mentalModelDefinitionIds,
  parseMentalModelDefinitionList,
} from "./mental-model/definitions.js";

import type { RecallPolicy } from "./recall-policy.js";

/**
 * Default enablement list for the built-in mental-model definitions.
 *
 * Derived from the registry so adding a definition cannot silently ship
 * disabled. Synthesis itself is still off by default, so this list costs
 * nothing until `mentalModelSynthesisEnabled` is turned on.
 */
const DEFAULT_MENTAL_MODEL_DEFINITIONS = formatMentalModelDefinitionList(
  mentalModelDefinitionIds(),
);

export const DEFAULT_XPI_MEMO_CONFIG = {
  admissionAllowGlobalPreference: true,
  admissionAllowGlobalWorkflow: true,
  admissionAllowProjectConstraint: true,
  admissionAllowProjectDecision: true,
  admissionAllowProjectGene: true,
  admissionAllowProjectGotcha: true,
  admissionAllowSessionContext: true,
  admissionEvidenceFloor: "session-conclusion",
  admissionMaxAgeDays: 30,
  admissionMinConfidence: 0.7,
  admissionSourceScope: "all",
  archiveRetentionDays: 30,
  autoAdmit: true,
  autoExport: true,
  confirmStore: false,
  dataDir: join(homedir(), ".pi", "agent", "xpi-memo"),
  embeddingApiUrl: "",
  embeddingMode: "off",
  embeddingModel: "",
  eventPresentation: true,
  excludeToolResults: false,
  globalLimit: 5,
  l0Enabled: true,
  language: "en",
  limit: 5,
  /** Comma-separated built-in definition ids; empty enables none. */
  mentalModelDefinitions: DEFAULT_MENTAL_MODEL_DEFINITIONS,
  /** Master switch for gated projection synthesis; off issues no model call. */
  mentalModelSynthesisEnabled: false,
  offlineExtractionEnabled: false,
  offlineExtractionModel: "session-model",
  passiveFeedback: true,
  paused: false,
  privacy: false,
  profileInjection: true,
  projectLimit: 5,
  recallPolicy: "high-value-auto",
  retrievalMode: "hybrid",
  searchBackend: "auto",
  sleepMode: "disabled",
} as const;

export type RetrievalMode = "fts5" | "hybrid";
export type Language = "en" | "zh";

/** Panel-owned embedding mode: none, a local model, or an external API. */
export type EmbeddingMode = "off" | "local" | "api";

/**
 * Admission evidence floor (change admission-preferences-and-pending-rescan):
 * `"session-conclusion"` accepts an unverified `l0-conclusion`, the stricter
 * value requires a repository fact.
 */
export type AdmissionEvidenceFloor = "repository-fact" | "session-conclusion";
/** Admission source scope: every bank, or only the current project's bank. */
export type AdmissionSourceScope = "all" | "current-project";
/**
 * Search backend selection (Task 13.1). "auto" walks the fallback chain
 * (mnemosyne → ripgrep → qmd); a pinned name uses that backend first.
 */
export type SearchBackendSetting = "auto" | "mnemosyne" | "ripgrep" | "qmd";
/** Sleep execution mode (task 5.1): explicit user choice, fail-closed on invalid input. */
export type SleepModeSetting =
  | "dedicated"
  | "session-model"
  | "mechanical"
  | "disabled";

export interface XpiMemoConfig {
  /** Auto-store a verified `project_gene`; `XPI_MEMO_AUTO_ADMIT` overrides it. */
  /** Per-kind automatic admission; all default to on. */
  admissionAllowGlobalPreference: boolean;
  admissionAllowGlobalWorkflow: boolean;
  admissionAllowProjectConstraint: boolean;
  admissionAllowProjectDecision: boolean;
  admissionAllowProjectGene: boolean;
  admissionAllowProjectGotcha: boolean;
  admissionAllowSessionContext: boolean;
  /** How strong the evidence must be before a candidate may auto-enter T1. */
  admissionEvidenceFloor: AdmissionEvidenceFloor;
  /** Candidates older than this are never auto-admitted. */
  admissionMaxAgeDays: number;
  /** Minimum extraction confidence, a ratio in [0, 1]. */
  admissionMinConfidence: number;
  admissionSourceScope: AdmissionSourceScope;
  /** Days an archived candidate stays recoverable before it expires. */
  archiveRetentionDays: number;
  autoAdmit: boolean;
  autoExport: boolean;
  confirmStore: boolean;
  dataDir: string;
  /** Endpoint the panel's `api` embedding mode calls; empty means mnemosyne's own. */
  embeddingApiUrl: string;
  /** `off` costs no embedding work; `local` and `api` mirror mnemosyne's switches. */
  embeddingMode: EmbeddingMode;
  /** Empty keeps mnemosyne's default model. */
  embeddingModel: string;
  /** Runtime surface: footer/status lifecycle event presentation. */
  eventPresentation: boolean;
  excludeToolResults: boolean;
  globalLimit: number;
  l0Enabled: boolean;
  language: Language;
  limit: number;
  /**
   * Comma-separated built-in mental-model definition ids that may project.
   * Code-owned ids only; an unknown token fails closed to the default list.
   */
  mentalModelDefinitions: string;
  /**
   * Master switch for gated mental-model synthesis. `false` (the default)
   * keeps deterministic freshness checks local and issues no model request.
   */
  mentalModelSynthesisEnabled: boolean;
  offlineExtractionEnabled: boolean;
  /**
   * Model used by gated offline extraction: `"session-model"` reuses the chat
   * model, anything else is a `provider/model-id` or a bare model id.
   */
  offlineExtractionModel: string;
  /** Runtime surface: passive usage feedback writes. */
  passiveFeedback: boolean;
  paused: boolean;
  privacy: boolean;
  /** Runtime surface: bounded preference-profile injection. */
  profileInjection: boolean;
  projectLimit: number;
  recallPolicy: RecallPolicy;
  retrievalMode: RetrievalMode;
  /** "auto" walks the fallback chain; a backend name pins it. */
  searchBackend: SearchBackendSetting;
  /** Sleep execution mode (task 5.1): dedicated / session-model / mechanical / disabled. */
  sleepMode: SleepModeSetting;
}

export interface UserConfig {
  admissionAllowGlobalPreference?: unknown;
  admissionAllowGlobalWorkflow?: unknown;
  admissionAllowProjectConstraint?: unknown;
  admissionAllowProjectDecision?: unknown;
  admissionAllowProjectGene?: unknown;
  admissionAllowProjectGotcha?: unknown;
  admissionAllowSessionContext?: unknown;
  admissionEvidenceFloor?: unknown;
  admissionMaxAgeDays?: unknown;
  admissionMinConfidence?: unknown;
  admissionSourceScope?: unknown;
  archiveRetentionDays?: unknown;
  autoAdmit?: unknown;
  autoExport?: unknown;
  confirmStore?: unknown;
  dataDir?: unknown;
  embeddingApiUrl?: unknown;
  embeddingMode?: unknown;
  embeddingModel?: unknown;
  eventPresentation?: unknown;
  excludeToolResults?: unknown;
  globalLimit?: unknown;
  l0Enabled?: unknown;
  language?: unknown;
  limit?: unknown;
  mentalModelDefinitions?: unknown;
  mentalModelSynthesisEnabled?: unknown;
  offlineExtractionEnabled?: unknown;
  offlineExtractionModel?: unknown;
  passiveFeedback?: unknown;
  paused?: unknown;
  privacy?: unknown;
  profileInjection?: unknown;
  projectLimit?: unknown;
  recallPolicy?: unknown;
  retrievalMode?: unknown;
  searchBackend?: unknown;
  sleepMode?: unknown;
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
      | "admissionAllowGlobalPreference"
      | "admissionAllowGlobalWorkflow"
      | "admissionAllowProjectConstraint"
      | "admissionAllowProjectDecision"
      | "admissionAllowProjectGene"
      | "admissionAllowProjectGotcha"
      | "admissionAllowSessionContext"
      | "admissionEvidenceFloor"
      | "admissionMaxAgeDays"
      | "admissionMinConfidence"
      | "admissionSourceScope"
      | "archiveRetentionDays"
      | "confirmStore"
      | "embeddingApiUrl"
      | "embeddingMode"
      | "embeddingModel"
      | "eventPresentation"
      | "globalLimit"
      | "l0Enabled"
      | "language"
      | "limit"
      | "mentalModelDefinitions"
      | "mentalModelSynthesisEnabled"
      | "offlineExtractionEnabled"
      | "paused"
      | "passiveFeedback"
      | "projectLimit"
      | "profileInjection"
      | "recallPolicy"
      | "retrievalMode"
      | "searchBackend"
      | "sleepMode"
    >
  >;
}

const WRITABLE_KEYS = new Set([
  "admissionAllowGlobalPreference",
  "admissionAllowGlobalWorkflow",
  "admissionAllowProjectConstraint",
  "admissionAllowProjectDecision",
  "admissionAllowProjectGene",
  "admissionAllowProjectGotcha",
  "admissionAllowSessionContext",
  "admissionEvidenceFloor",
  "admissionMaxAgeDays",
  "admissionMinConfidence",
  "admissionSourceScope",
  "archiveRetentionDays",
  "autoAdmit",
  "autoExport",
  "confirmStore",
  "embeddingApiUrl",
  "embeddingMode",
  "embeddingModel",
  "excludeToolResults",
  "eventPresentation",
  "globalLimit",
  "l0Enabled",
  "language",
  "limit",
  "mentalModelDefinitions",
  "mentalModelSynthesisEnabled",
  "offlineExtractionEnabled",
  "offlineExtractionModel",
  "paused",
  "passiveFeedback",
  "privacy",
  "profileInjection",
  "projectLimit",
  "recallPolicy",
  "retrievalMode",
  "searchBackend",
  "sleepMode",
]);
const ENV_KEYS: Record<string, string> = {
  admissionAllowGlobalPreference: "XPI_MEMO_ADMISSION_ALLOW_GLOBAL_PREFERENCE",
  admissionAllowGlobalWorkflow: "XPI_MEMO_ADMISSION_ALLOW_GLOBAL_WORKFLOW",
  admissionAllowProjectConstraint: "XPI_MEMO_ADMISSION_ALLOW_PROJECT_CONSTRAINT",
  admissionAllowProjectDecision: "XPI_MEMO_ADMISSION_ALLOW_PROJECT_DECISION",
  admissionAllowProjectGene: "XPI_MEMO_ADMISSION_ALLOW_PROJECT_GENE",
  admissionAllowProjectGotcha: "XPI_MEMO_ADMISSION_ALLOW_PROJECT_GOTCHA",
  admissionAllowSessionContext: "XPI_MEMO_ADMISSION_ALLOW_SESSION_CONTEXT",
  admissionEvidenceFloor: "XPI_MEMO_ADMISSION_EVIDENCE_FLOOR",
  admissionMaxAgeDays: "XPI_MEMO_ADMISSION_MAX_AGE_DAYS",
  admissionMinConfidence: "XPI_MEMO_ADMISSION_MIN_CONFIDENCE",
  admissionSourceScope: "XPI_MEMO_ADMISSION_SOURCE_SCOPE",
  archiveRetentionDays: "XPI_MEMO_ARCHIVE_RETENTION_DAYS",
  autoAdmit: "XPI_MEMO_AUTO_ADMIT",
  autoExport: "XPI_MEMO_AUTO_EXPORT",
  confirmStore: "XPI_MEMO_CONFIRM_STORE",
  embeddingApiUrl: "XPI_MEMO_EMBEDDING_API_URL",
  embeddingMode: "XPI_MEMO_EMBEDDING_MODE",
  embeddingModel: "XPI_MEMO_EMBEDDING_MODEL",
  eventPresentation: "XPI_MEMO_EVENT_PRESENTATION",
  excludeToolResults: "XPI_MEMO_EXCLUDE_TOOL_RESULTS",
  globalLimit: "XPI_MEMO_GLOBAL_LIMIT",
  l0Enabled: "XPI_MEMO_L0_ENABLED",
  language: "XPI_MEMO_LANGUAGE",
  limit: "XPI_MEMO_LIMIT",
  mentalModelDefinitions: "XPI_MEMO_MENTAL_MODEL_DEFINITIONS",
  mentalModelSynthesisEnabled: "XPI_MEMO_MENTAL_MODEL_SYNTHESIS_ENABLED",
  offlineExtractionEnabled: "XPI_MEMO_OFFLINE_EXTRACTION_ENABLED",
  offlineExtractionModel: "XPI_MEMO_OFFLINE_EXTRACTION_MODEL",
  passiveFeedback: "XPI_MEMO_PASSIVE_FEEDBACK",
  paused: "XPI_MEMO_PAUSED",
  privacy: "XPI_MEMO_PRIVACY",
  profileInjection: "XPI_MEMO_PROFILE_INJECTION",
  projectLimit: "XPI_MEMO_PROJECT_LIMIT",
  recallPolicy: "XPI_MEMO_RECALL_POLICY",
  retrievalMode: "XPI_MEMO_RETRIEVAL_MODE",
  searchBackend: "XPI_MEMO_SEARCH_BACKEND",
  sleepMode: "XPI_MEMO_SLEEP_MODE",
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

function sleepMode(value: unknown): value is SleepModeSetting {
  return (
    value === "dedicated" ||
    value === "session-model" ||
    value === "mechanical" ||
    value === "disabled"
  );
}

function envString(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return nonEmptyString(value) ? value.trim() : undefined;
}

/**
 * Auto-admission env semantics (change optimize-offline-extraction-and-auto-admit):
 * a whitelist, not a fallback — a set-but-unrecognised value means `off`, so a
 * typo can never auto-store. `undefined` means the environment says nothing,
 * which leaves the config file deciding.
 */
export function autoAdmitFromEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === "true";
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

function resolveLanguage(
  environmentValue: string | undefined,
  userValue: unknown,
): Language {
  if (environmentValue === "en" || environmentValue === "zh") return environmentValue;
  if (userValue === "en" || userValue === "zh") return userValue;
  return DEFAULT_XPI_MEMO_CONFIG.language;
}

function embeddingMode(value: unknown): value is EmbeddingMode {
  return value === "off" || value === "local" || value === "api";
}

function resolveEmbeddingMode(
  environmentValue: string | undefined,
  userValue: unknown,
): EmbeddingMode {
  if (embeddingMode(environmentValue)) return environmentValue;
  if (embeddingMode(userValue)) return userValue;
  // Fail closed: only an explicit choice turns embedding work on.
  return DEFAULT_XPI_MEMO_CONFIG.embeddingMode;
}

function resolveSleepMode(
  environmentValue: string | undefined,
  userValue: unknown,
): SleepModeSetting {
  if (sleepMode(environmentValue)) return environmentValue;
  if (sleepMode(userValue)) return userValue;
  // Fail closed: invalid or missing configuration never enables a mode.
  return DEFAULT_XPI_MEMO_CONFIG.sleepMode;
}

/**
 * Mental-model enablement list validator (change
 * add-mental-model-projections, task 1.3). A configured value is valid only
 * when every token names a code-owned definition, so a typo fails closed to
 * the default list instead of silently disabling or inventing a model.
 */
function mentalModelDefinitionList(value: unknown): value is string {
  return typeof value === "string" && parseMentalModelDefinitionList(value) !== null;
}

/**
 * Resolve the enablement list: environment, then the config file, then the
 * default. A usable value is normalised to registry order so the panel shows
 * one canonical spelling.
 */
function resolveMentalModelDefinitions(
  environmentValue: string | undefined,
  userValue: unknown,
): string {
  if (mentalModelDefinitionList(environmentValue))
    return formatMentalModelDefinitionList(
      parseMentalModelDefinitionList(environmentValue) ?? [],
    );
  if (mentalModelDefinitionList(userValue))
    return formatMentalModelDefinitionList(
      parseMentalModelDefinitionList(userValue) ?? [],
    );
  return DEFAULT_XPI_MEMO_CONFIG.mentalModelDefinitions;
}

function admissionEvidenceFloor(value: unknown): value is AdmissionEvidenceFloor {
  return value === "repository-fact" || value === "session-conclusion";
}

function admissionSourceScope(value: unknown): value is AdmissionSourceScope {
  return value === "all" || value === "current-project";
}

/** Confidence is a ratio in [0, 1]; anything else keeps the default. */
function confidence(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
  );
}

function resolveAdmissionEvidenceFloor(
  environmentValue: string | undefined,
  userValue: unknown,
): AdmissionEvidenceFloor {
  if (admissionEvidenceFloor(environmentValue)) return environmentValue;
  if (admissionEvidenceFloor(userValue)) return userValue;
  return DEFAULT_XPI_MEMO_CONFIG.admissionEvidenceFloor;
}

function resolveAdmissionSourceScope(
  environmentValue: string | undefined,
  userValue: unknown,
): AdmissionSourceScope {
  if (admissionSourceScope(environmentValue)) return environmentValue;
  if (admissionSourceScope(userValue)) return userValue;
  return DEFAULT_XPI_MEMO_CONFIG.admissionSourceScope;
}

function resolveAdmissionMinConfidence(
  environmentValue: string | undefined,
  userValue: unknown,
): number {
  const fromEnvironment = Number(environmentValue);
  if (environmentValue !== undefined && confidence(fromEnvironment))
    return fromEnvironment;
  if (confidence(userValue)) return userValue;
  return DEFAULT_XPI_MEMO_CONFIG.admissionMinConfidence;
}

/**
 * Validators for the admission preference keys (change
 * admission-preferences-and-pending-rescan). A configured value that fails its
 * validator is ignored and reported in `ignoredKeys`, instead of rejecting the
 * whole file — a typo in one preference must not disable every other one.
 */
const ADMISSION_PREFERENCE_VALIDATORS: Record<string, (value: unknown) => boolean> = {
  admissionAllowGlobalPreference: boolean,
  admissionAllowGlobalWorkflow: boolean,
  admissionAllowProjectConstraint: boolean,
  admissionAllowProjectDecision: boolean,
  admissionAllowProjectGene: boolean,
  admissionAllowProjectGotcha: boolean,
  admissionAllowSessionContext: boolean,
  admissionEvidenceFloor,
  admissionMaxAgeDays: positiveInteger,
  admissionMinConfidence: confidence,
  admissionSourceScope,
  archiveRetentionDays: positiveInteger,
};

/**
 * Validators for the mental-model keys (change
 * add-mental-model-projections, task 1.3). Same contract as the admission
 * table: an invalid value is ignored and named in `ignoredKeys` rather than
 * rejecting the whole config file.
 */
const MENTAL_MODEL_VALIDATORS: Record<string, (value: unknown) => boolean> = {
  mentalModelDefinitions: mentalModelDefinitionList,
  mentalModelSynthesisEnabled: boolean,
};

/**
 * Free-text config values: a model id or an endpoint. Free text by design, so
 * it fails closed to the documented default when neither the environment nor
 * the config file supplies a usable string.
 */
function resolveFreeText(
  environmentValue: string | undefined,
  userValue: unknown,
  fallback: string,
): string {
  if (environmentValue !== undefined) return environmentValue;
  if (nonEmptyString(userValue)) return userValue.trim();
  return fallback;
}

/**
 * The embedding switches mnemosyne actually reads.
 *
 * Its store path resolves embeddings from environment variables only
 * (`core/embeddings.py` reads `MNEMOSYNE_*_EMBEDDINGS*`, `_DEFAULT_MODEL` and
 * `MNEMOSYNE_EMBEDDING_API_URL` at import time); the same keys in `config.yaml`
 * have no reader on that path. So the panel's mode is applied to the mnemosyne
 * child processes xpi-memo spawns, not to the config file.
 *
 * The disable flags are always written: `_is_disabled()` treats any non-empty
 * value — including `"0"` — as off, so "enabled" has to be the empty string.
 * An empty model or endpoint is omitted, which leaves mnemosyne's own default
 * (`BAAI/bge-small-en-v1.5`) and the inherited `MNEMOSYNE_EMBEDDING_API_KEY`.
 */
export function embeddingEnvironment(
  config: Pick<XpiMemoConfig, "embeddingApiUrl" | "embeddingMode" | "embeddingModel">,
): Record<string, string> {
  const enabled = config.embeddingMode !== "off";
  const environment: Record<string, string> = {
    MNEMOSYNE_EMBEDDINGS_OFF: enabled ? "" : "1",
    MNEMOSYNE_EMBEDDINGS_VIA_API: config.embeddingMode === "api" ? "1" : "",
    MNEMOSYNE_NO_EMBEDDINGS: enabled ? "" : "1",
    MNEMOSYNE_SKIP_EMBEDDINGS: enabled ? "" : "1",
  };
  if (enabled && config.embeddingModel) {
    environment.MNEMOSYNE_EMBEDDING_MODEL = config.embeddingModel;
  }
  if (config.embeddingMode === "api" && config.embeddingApiUrl) {
    environment.MNEMOSYNE_EMBEDDING_API_URL = config.embeddingApiUrl;
  }
  return environment;
}

/**
 * The environment to hand a mnemosyne child process: `base`, else the process
 * environment — the same default `runMnemosyne` applies — with the embedding
 * switches applied on top. Nothing else about a child's environment changes.
 */
export function mnemosyneEnvironment(
  config: Pick<XpiMemoConfig, "embeddingApiUrl" | "embeddingMode" | "embeddingModel">,
  base: NodeJS.ProcessEnv | undefined,
): NodeJS.ProcessEnv {
  return {
    ...(base ?? process.env),
    ...embeddingEnvironment(config),
  };
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
  const environmentSleepMode = envString(env, "XPI_MEMO_SLEEP_MODE");
  const environmentPaused = envString(env, "XPI_MEMO_PAUSED");
  const envBool = (name: string, fallback: boolean): boolean => {
    const value = envString(env, name);
    if (value === "true") return true;
    if (value === "false") return false;
    return fallback;
  };
  // One table lookup for every key that carries a validator: a value that
  // fails its validator is ignored and reported, never fatal to the file.
  const invalidConfigKeys = [
    ...Object.entries(ADMISSION_PREFERENCE_VALIDATORS),
    ...Object.entries(MENTAL_MODEL_VALIDATORS),
  ]
    .filter(([key, isValid]) => {
      const value = (user.config as Record<string, unknown>)[key];
      return value !== undefined && !isValid(value);
    })
    .map(([key]) => key);
  const config: XpiMemoConfig = {
    admissionAllowGlobalPreference: envBool(
      "XPI_MEMO_ADMISSION_ALLOW_GLOBAL_PREFERENCE",
      boolean(user.config.admissionAllowGlobalPreference)
        ? user.config.admissionAllowGlobalPreference
        : DEFAULT_XPI_MEMO_CONFIG.admissionAllowGlobalPreference,
    ),
    admissionAllowGlobalWorkflow: envBool(
      "XPI_MEMO_ADMISSION_ALLOW_GLOBAL_WORKFLOW",
      boolean(user.config.admissionAllowGlobalWorkflow)
        ? user.config.admissionAllowGlobalWorkflow
        : DEFAULT_XPI_MEMO_CONFIG.admissionAllowGlobalWorkflow,
    ),
    admissionAllowProjectConstraint: envBool(
      "XPI_MEMO_ADMISSION_ALLOW_PROJECT_CONSTRAINT",
      boolean(user.config.admissionAllowProjectConstraint)
        ? user.config.admissionAllowProjectConstraint
        : DEFAULT_XPI_MEMO_CONFIG.admissionAllowProjectConstraint,
    ),
    admissionAllowProjectDecision: envBool(
      "XPI_MEMO_ADMISSION_ALLOW_PROJECT_DECISION",
      boolean(user.config.admissionAllowProjectDecision)
        ? user.config.admissionAllowProjectDecision
        : DEFAULT_XPI_MEMO_CONFIG.admissionAllowProjectDecision,
    ),
    admissionAllowProjectGene: envBool(
      "XPI_MEMO_ADMISSION_ALLOW_PROJECT_GENE",
      boolean(user.config.admissionAllowProjectGene)
        ? user.config.admissionAllowProjectGene
        : DEFAULT_XPI_MEMO_CONFIG.admissionAllowProjectGene,
    ),
    admissionAllowProjectGotcha: envBool(
      "XPI_MEMO_ADMISSION_ALLOW_PROJECT_GOTCHA",
      boolean(user.config.admissionAllowProjectGotcha)
        ? user.config.admissionAllowProjectGotcha
        : DEFAULT_XPI_MEMO_CONFIG.admissionAllowProjectGotcha,
    ),
    admissionAllowSessionContext: envBool(
      "XPI_MEMO_ADMISSION_ALLOW_SESSION_CONTEXT",
      boolean(user.config.admissionAllowSessionContext)
        ? user.config.admissionAllowSessionContext
        : DEFAULT_XPI_MEMO_CONFIG.admissionAllowSessionContext,
    ),
    admissionEvidenceFloor: resolveAdmissionEvidenceFloor(
      envString(env, "XPI_MEMO_ADMISSION_EVIDENCE_FLOOR"),
      user.config.admissionEvidenceFloor,
    ),
    admissionMaxAgeDays:
      envPositiveInteger(env, "XPI_MEMO_ADMISSION_MAX_AGE_DAYS") ??
      (positiveInteger(user.config.admissionMaxAgeDays)
        ? user.config.admissionMaxAgeDays
        : DEFAULT_XPI_MEMO_CONFIG.admissionMaxAgeDays),
    admissionMinConfidence: resolveAdmissionMinConfidence(
      envString(env, "XPI_MEMO_ADMISSION_MIN_CONFIDENCE"),
      user.config.admissionMinConfidence,
    ),
    admissionSourceScope: resolveAdmissionSourceScope(
      envString(env, "XPI_MEMO_ADMISSION_SOURCE_SCOPE"),
      user.config.admissionSourceScope,
    ),
    archiveRetentionDays:
      envPositiveInteger(env, "XPI_MEMO_ARCHIVE_RETENTION_DAYS") ??
      (positiveInteger(user.config.archiveRetentionDays)
        ? user.config.archiveRetentionDays
        : DEFAULT_XPI_MEMO_CONFIG.archiveRetentionDays),
    autoAdmit:
      autoAdmitFromEnv(env.XPI_MEMO_AUTO_ADMIT) ??
      (boolean(user.config.autoAdmit)
        ? user.config.autoAdmit
        : DEFAULT_XPI_MEMO_CONFIG.autoAdmit),
    autoExport: envBool(
      "XPI_MEMO_AUTO_EXPORT",
      boolean(user.config.autoExport)
        ? user.config.autoExport
        : DEFAULT_XPI_MEMO_CONFIG.autoExport,
    ),
    confirmStore: envBool(
      "XPI_MEMO_CONFIRM_STORE",
      boolean(user.config.confirmStore)
        ? user.config.confirmStore
        : DEFAULT_XPI_MEMO_CONFIG.confirmStore,
    ),
    dataDir:
      envString(env, "XPI_MEMO_DATA_DIR") ??
      (nonEmptyString(user.config.dataDir)
        ? user.config.dataDir.trim()
        : DEFAULT_XPI_MEMO_CONFIG.dataDir),
    embeddingApiUrl: resolveFreeText(
      envString(env, "XPI_MEMO_EMBEDDING_API_URL"),
      user.config.embeddingApiUrl,
      DEFAULT_XPI_MEMO_CONFIG.embeddingApiUrl,
    ),
    embeddingMode: resolveEmbeddingMode(
      envString(env, "XPI_MEMO_EMBEDDING_MODE"),
      user.config.embeddingMode,
    ),
    embeddingModel: resolveFreeText(
      envString(env, "XPI_MEMO_EMBEDDING_MODEL"),
      user.config.embeddingModel,
      DEFAULT_XPI_MEMO_CONFIG.embeddingModel,
    ),
    eventPresentation: envBool(
      "XPI_MEMO_EVENT_PRESENTATION",
      boolean(user.config.eventPresentation)
        ? user.config.eventPresentation
        : DEFAULT_XPI_MEMO_CONFIG.eventPresentation,
    ),
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
    language: resolveLanguage(
      envString(env, "XPI_MEMO_LANGUAGE"),
      user.config.language,
    ),
    limit:
      envPositiveInteger(env, "XPI_MEMO_LIMIT") ??
      (positiveInteger(user.config.limit)
        ? user.config.limit
        : DEFAULT_XPI_MEMO_CONFIG.limit),
    mentalModelDefinitions: resolveMentalModelDefinitions(
      envString(env, "XPI_MEMO_MENTAL_MODEL_DEFINITIONS"),
      user.config.mentalModelDefinitions,
    ),
    mentalModelSynthesisEnabled: envBool(
      "XPI_MEMO_MENTAL_MODEL_SYNTHESIS_ENABLED",
      boolean(user.config.mentalModelSynthesisEnabled)
        ? user.config.mentalModelSynthesisEnabled
        : DEFAULT_XPI_MEMO_CONFIG.mentalModelSynthesisEnabled,
    ),
    offlineExtractionEnabled: envBool(
      "XPI_MEMO_OFFLINE_EXTRACTION_ENABLED",
      boolean(user.config.offlineExtractionEnabled)
        ? user.config.offlineExtractionEnabled
        : DEFAULT_XPI_MEMO_CONFIG.offlineExtractionEnabled,
    ),
    offlineExtractionModel: resolveFreeText(
      envString(env, "XPI_MEMO_OFFLINE_EXTRACTION_MODEL"),
      user.config.offlineExtractionModel,
      DEFAULT_XPI_MEMO_CONFIG.offlineExtractionModel,
    ),
    passiveFeedback: envBool(
      "XPI_MEMO_PASSIVE_FEEDBACK",
      boolean(user.config.passiveFeedback)
        ? user.config.passiveFeedback
        : DEFAULT_XPI_MEMO_CONFIG.passiveFeedback,
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
    profileInjection: envBool(
      "XPI_MEMO_PROFILE_INJECTION",
      boolean(user.config.profileInjection)
        ? user.config.profileInjection
        : DEFAULT_XPI_MEMO_CONFIG.profileInjection,
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
    sleepMode: resolveSleepMode(environmentSleepMode, user.config.sleepMode),
  };

  return {
    config,
    ignoredKeys: [
      ...user.ignoredKeys,
      ...invalidConfigKeys,
    ].sort(),
  };
}
