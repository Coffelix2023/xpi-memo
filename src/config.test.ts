import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_XPI_MEMO_CONFIG,
  embeddingEnvironment,
  loadConfig,
  mnemosyneEnvironment,
  saveUserConfig,
  type UserConfig,
} from "./config.js";

const temporaryDirectories: string[] = [];
/** Anything that looks like a credential must never appear in the mapping. */
const CREDENTIAL_KEY_PATTERN = /KEY|TOKEN|SECRET/;

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "xpi-memo-config-"));
  temporaryDirectories.push(directory);
  return directory;
}

function configPath(configHome: string): string {
  return join(configHome, "xpi-memo", "config.json");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe("XpiMemo configuration", () => {
  it("uses safe defaults when no user config or environment is present", () => {
    const config = loadConfig({
      configHome: createTemporaryDirectory(),
      env: {},
    });

    expect(config).toEqual({
      config: DEFAULT_XPI_MEMO_CONFIG,
      ignoredKeys: [],
    });
    expect(config.config.dataDir).toBe(join(homedir(), ".pi", "agent", "xpi-memo"));
  });

  // Regression (1.8.0): `autoAdmit` was the only boolean key that skipped
  // `envBool`, so Settings showed the config-file value while
  // `autoAdmitEnabled` followed the environment. Both now share one parse.
  it("resolves autoAdmit from the environment like every other boolean key", () => {
    const configHome = createTemporaryDirectory();
    mkdirSync(join(configHome, "xpi-memo"), {
      recursive: true,
    });
    writeFileSync(
      configPath(configHome),
      JSON.stringify({
        autoAdmit: true,
      }),
    );

    expect(
      loadConfig({
        configHome,
        env: {
          XPI_MEMO_AUTO_ADMIT: "false",
        },
      }).config.autoAdmit,
    ).toBe(false);
    expect(
      loadConfig({
        configHome,
        env: {
          XPI_MEMO_AUTO_ADMIT: "true",
        },
      }).config.autoAdmit,
    ).toBe(true);
    // A set-but-unrecognised value means `off`, matching the admission decision.
    expect(
      loadConfig({
        configHome,
        env: {
          XPI_MEMO_AUTO_ADMIT: "1",
        },
      }).config.autoAdmit,
    ).toBe(false);
  });

  it("keeps auto-admission off when only the config file disables it", () => {
    const configHome = createTemporaryDirectory();
    mkdirSync(join(configHome, "xpi-memo"), {
      recursive: true,
    });
    writeFileSync(
      configPath(configHome),
      JSON.stringify({
        autoAdmit: false,
      }),
    );

    expect(
      loadConfig({
        configHome,
        env: {},
      }).config.autoAdmit,
    ).toBe(false);
  });

  it("defaults every admission preference to liberal", () => {
    const { config } = loadConfig({
      configHome: createTemporaryDirectory(),
      env: {},
    });

    expect(config.admissionAllowGlobalPreference).toBe(true);
    expect(config.admissionAllowGlobalWorkflow).toBe(true);
    expect(config.admissionAllowProjectConstraint).toBe(true);
    expect(config.admissionAllowProjectDecision).toBe(true);
    expect(config.admissionAllowProjectGene).toBe(true);
    expect(config.admissionAllowProjectGotcha).toBe(true);
    expect(config.admissionAllowSessionContext).toBe(true);
    expect(config.admissionEvidenceFloor).toBe("session-conclusion");
    expect(config.admissionMaxAgeDays).toBe(30);
    expect(config.admissionMinConfidence).toBe(0.7);
    expect(config.admissionSourceScope).toBe("all");
    expect(config.archiveRetentionDays).toBe(30);
  });

  it("lets an environment variable tighten any admission preference", () => {
    const { config } = loadConfig({
      configHome: createTemporaryDirectory(),
      env: {
        XPI_MEMO_ADMISSION_ALLOW_PROJECT_GOTCHA: "false",
        XPI_MEMO_ADMISSION_EVIDENCE_FLOOR: "repository-fact",
        XPI_MEMO_ADMISSION_MAX_AGE_DAYS: "7",
        XPI_MEMO_ADMISSION_MIN_CONFIDENCE: "0.9",
        XPI_MEMO_ADMISSION_SOURCE_SCOPE: "current-project",
        XPI_MEMO_ARCHIVE_RETENTION_DAYS: "90",
      },
    });

    expect(config.admissionAllowProjectGotcha).toBe(false);
    // An untouched preference keeps its liberal default.
    expect(config.admissionAllowProjectGene).toBe(true);
    expect(config.admissionEvidenceFloor).toBe("repository-fact");
    expect(config.admissionMaxAgeDays).toBe(7);
    expect(config.admissionMinConfidence).toBe(0.9);
    expect(config.admissionSourceScope).toBe("current-project");
    expect(config.archiveRetentionDays).toBe(90);
  });

  it("ignores an unusable admission preference and reports its key", () => {
    const configHome = createTemporaryDirectory();
    mkdirSync(join(configHome, "xpi-memo"), {
      recursive: true,
    });
    writeFileSync(
      configPath(configHome),
      JSON.stringify({
        admissionAllowProjectGene: "yes",
        admissionEvidenceFloor: "whatever",
        admissionMaxAgeDays: 0,
        admissionMinConfidence: 2,
        admissionSourceScope: "elsewhere",
      }),
    );

    const { config, ignoredKeys } = loadConfig({
      configHome,
      env: {},
    });

    // A bad preference falls back to its default; the rest of the file stands.
    expect(config.admissionEvidenceFloor).toBe("session-conclusion");
    expect(config.admissionMaxAgeDays).toBe(30);
    expect(config.admissionMinConfidence).toBe(0.7);
    expect(config.admissionSourceScope).toBe("all");
    expect(config.admissionAllowProjectGene).toBe(true);
    expect(config.admissionAllowProjectGotcha).toBe(true);
    expect(ignoredKeys).toEqual([
      "admissionAllowProjectGene",
      "admissionEvidenceFloor",
      "admissionMaxAgeDays",
      "admissionMinConfidence",
      "admissionSourceScope",
    ]);
  });

  it("loads paused from user config and lets the environment override it", () => {
    const configHome = createTemporaryDirectory();
    mkdirSync(join(configHome, "xpi-memo"), {
      recursive: true,
    });
    writeFileSync(
      configPath(configHome),
      JSON.stringify({
        paused: true,
      }),
    );

    expect(
      loadConfig({
        configHome,
        env: {},
      }).config.paused,
    ).toBe(true);
    expect(
      loadConfig({
        configHome,
        env: {
          XPI_MEMO_PAUSED: "false",
        },
      }).config.paused,
    ).toBe(false);
  });

  it("loads confirmStore and language from config and environment", () => {
    const configHome = createTemporaryDirectory();
    mkdirSync(join(configHome, "xpi-memo"), {
      recursive: true,
    });
    writeFileSync(
      configPath(configHome),
      JSON.stringify({
        confirmStore: true,
        language: "zh",
      }),
    );

    expect(
      loadConfig({
        configHome,
        env: {},
      }).config,
    ).toMatchObject({
      confirmStore: true,
      language: "zh",
    });
    expect(
      loadConfig({
        configHome,
        env: {
          XPI_MEMO_CONFIRM_STORE: "false",
          XPI_MEMO_LANGUAGE: "en",
        },
      }).config,
    ).toMatchObject({
      confirmStore: false,
      language: "en",
    });
  });

  it("falls back to safe defaults for invalid confirmStore and language", () => {
    const configHome = createTemporaryDirectory();
    mkdirSync(join(configHome, "xpi-memo"), {
      recursive: true,
    });
    writeFileSync(
      configPath(configHome),
      JSON.stringify({
        confirmStore: "yes",
        language: "ja",
      }),
    );

    expect(
      loadConfig({
        configHome,
        env: {
          XPI_MEMO_CONFIRM_STORE: "yes",
          XPI_MEMO_LANGUAGE: "ja",
        },
      }).config,
    ).toMatchObject({
      confirmStore: false,
      language: "en",
    });
  });

  it("loads only non-sensitive values from the user configuration", () => {
    const configHome = createTemporaryDirectory();
    mkdirSync(join(configHome, "xpi-memo"), {
      recursive: true,
    });
    const userConfig: UserConfig = {
      apiKey: "must-not-be-read",
      dataDir: "/tmp/user-memory",
      globalLimit: 7,
      limit: 9,
      projectLimit: 3,
      recallPolicy: "assist",
      retrievalMode: "hybrid",
      token: "must-not-be-read",
    };
    writeFileSync(configPath(configHome), JSON.stringify(userConfig));

    const result = loadConfig({
      configHome,
      env: {},
    });

    expect(result.config).toMatchObject({
      dataDir: "/tmp/user-memory",
      globalLimit: 7,
      limit: 9,
      projectLimit: 3,
      recallPolicy: "assist",
      retrievalMode: "hybrid",
    });
    expect(result.config).not.toHaveProperty("apiKey");
    expect(result.config).not.toHaveProperty("token");
    expect(result.ignoredKeys).toEqual([
      "apiKey",
      "token",
    ]);
  });

  it("gives environment values precedence over user config", () => {
    const configHome = createTemporaryDirectory();
    mkdirSync(join(configHome, "xpi-memo"), {
      recursive: true,
    });
    writeFileSync(
      configPath(configHome),
      JSON.stringify({
        dataDir: "/tmp/user-memory",
        limit: 3,
        recallPolicy: "assist",
      }),
    );

    const result = loadConfig({
      configHome,
      env: {
        XPI_MEMO_DATA_DIR: "/tmp/env-memory",
        XPI_MEMO_LIMIT: "11",
        XPI_MEMO_RECALL_POLICY: "active",
      },
    });

    expect(result.config).toMatchObject({
      dataDir: "/tmp/env-memory",
      limit: 11,
      recallPolicy: "active",
    });
  });

  it("ignores invalid user and environment values without exposing them", () => {
    const configHome = createTemporaryDirectory();
    mkdirSync(join(configHome, "xpi-memo"), {
      recursive: true,
    });
    writeFileSync(
      configPath(configHome),
      JSON.stringify({
        dataDir: "",
        limit: 0,
        retrievalMode: "unsupported",
      }),
    );

    const result = loadConfig({
      configHome,
      env: {
        XPI_MEMO_GLOBAL_LIMIT: "not-a-number",
        XPI_MEMO_RECALL_POLICY: "unknown",
      },
    });

    expect(result.config).toEqual(DEFAULT_XPI_MEMO_CONFIG);
    expect(result.ignoredKeys).toEqual([]);
  });

  it("parses sleepMode from the environment with fail-closed fallback (task 5.1)", () => {
    const configHome = createTemporaryDirectory();
    const enabled = loadConfig({
      configHome,
      env: {
        XPI_MEMO_SLEEP_MODE: "session-model",
      },
    }).config.sleepMode;
    expect(enabled).toBe("session-model");

    const mechanical = loadConfig({
      configHome,
      env: {
        XPI_MEMO_SLEEP_MODE: "mechanical",
      },
    }).config.sleepMode;
    expect(mechanical).toBe("mechanical");

    const invalid = loadConfig({
      configHome,
      env: {
        XPI_MEMO_SLEEP_MODE: "not-a-mode",
      },
    }).config.sleepMode;
    expect(invalid).toBe("disabled");
  });

  it("loads sleepMode from user config with fail-closed fallback (task 5.1)", () => {
    const configHome = createTemporaryDirectory();
    mkdirSync(join(configHome, "xpi-memo"), {
      recursive: true,
    });
    writeFileSync(
      configPath(configHome),
      JSON.stringify({
        sleepMode: "dedicated",
      }),
    );
    expect(
      loadConfig({
        configHome,
        env: {},
      }).config.sleepMode,
    ).toBe("dedicated");

    writeFileSync(
      configPath(configHome),
      JSON.stringify({
        sleepMode: "bogus",
      }),
    );
    expect(
      loadConfig({
        configHome,
        env: {},
      }).config.sleepMode,
    ).toBe("disabled");
  });
  it("saves sleepMode as a writable setting", () => {
    const configHome = createTemporaryDirectory();
    mkdirSync(join(configHome, "xpi-memo"), {
      recursive: true,
    });
    writeFileSync(configPath(configHome), JSON.stringify({}));
    saveUserConfig({
      configHome,
      env: {},
      values: {
        sleepMode: "mechanical",
      },
    });
    const saved = JSON.parse(readFileSync(configPath(configHome), "utf8"));
    expect(saved.sleepMode).toBe("mechanical");
  });
  it("loads offlineExtractionEnabled from the environment with safe fallback", () => {
    const configHome = createTemporaryDirectory();
    const enabled = loadConfig({
      configHome,
      env: {
        XPI_MEMO_OFFLINE_EXTRACTION_ENABLED: "true",
      },
    }).config.offlineExtractionEnabled;
    expect(enabled).toBe(true);

    const invalid = loadConfig({
      configHome,
      env: {
        XPI_MEMO_OFFLINE_EXTRACTION_ENABLED: "not-a-boolean",
      },
    }).config.offlineExtractionEnabled;
    expect(invalid).toBe(false);
  });

  it("defaults the embedding mode to off and resolves its three keys", () => {
    const configHome = createTemporaryDirectory();
    const defaults = loadConfig({
      configHome,
      env: {},
    }).config;
    // Off by default: no embedding model the user never chose gets loaded.
    expect(defaults.embeddingMode).toBe("off");
    expect(defaults.embeddingModel).toBe("");
    expect(defaults.embeddingApiUrl).toBe("");

    // Environment wins; an unrecognised mode falls back to off.
    const fromEnvironment = loadConfig({
      configHome,
      env: {
        XPI_MEMO_EMBEDDING_API_URL: "http://127.0.0.1:8080/v1",
        XPI_MEMO_EMBEDDING_MODE: "api",
        XPI_MEMO_EMBEDDING_MODEL: "openai/text-embedding-3-small",
      } as NodeJS.ProcessEnv,
    }).config;
    expect(fromEnvironment.embeddingMode).toBe("api");
    expect(fromEnvironment.embeddingModel).toBe("openai/text-embedding-3-small");
    expect(fromEnvironment.embeddingApiUrl).toBe("http://127.0.0.1:8080/v1");
    expect(
      loadConfig({
        configHome,
        env: {
          XPI_MEMO_EMBEDDING_MODE: "remote",
        } as NodeJS.ProcessEnv,
      }).config.embeddingMode,
    ).toBe("off");

    // The config file is writable for all three keys.
    saveUserConfig({
      configHome,
      env: {},
      values: {
        embeddingApiUrl: "http://localhost:9000/v1",
        embeddingMode: "local",
        embeddingModel: "intfloat/multilingual-e5-small",
      },
    });
    const fromFile = loadConfig({
      configHome,
      env: {},
    }).config;
    expect(fromFile.embeddingMode).toBe("local");
    expect(fromFile.embeddingModel).toBe("intfloat/multilingual-e5-small");
    expect(fromFile.embeddingApiUrl).toBe("http://localhost:9000/v1");
  });

  it("maps the embedding mode to the mnemosyne switches, never a key", () => {
    // Any non-empty disable flag means off to mnemosyne, so "enabled" has to
    // be the empty string; "0" would silently keep embeddings disabled.
    expect(
      embeddingEnvironment({
        embeddingApiUrl: "",
        embeddingMode: "off",
        embeddingModel: "",
      }),
    ).toEqual({
      MNEMOSYNE_EMBEDDINGS_OFF: "1",
      MNEMOSYNE_EMBEDDINGS_VIA_API: "",
      MNEMOSYNE_NO_EMBEDDINGS: "1",
      MNEMOSYNE_SKIP_EMBEDDINGS: "1",
    });

    // Local: everything enabled, model passed through, no endpoint forced.
    expect(
      embeddingEnvironment({
        embeddingApiUrl: "http://ignored/v1",
        embeddingMode: "local",
        embeddingModel: "BAAI/bge-m3",
      }),
    ).toEqual({
      MNEMOSYNE_EMBEDDING_MODEL: "BAAI/bge-m3",
      MNEMOSYNE_EMBEDDINGS_OFF: "",
      MNEMOSYNE_EMBEDDINGS_VIA_API: "",
      MNEMOSYNE_NO_EMBEDDINGS: "",
      MNEMOSYNE_SKIP_EMBEDDINGS: "",
    });

    // API: the explicit opt-in flag plus the endpoint.
    expect(
      embeddingEnvironment({
        embeddingApiUrl: "https://openrouter.ai/api/v1",
        embeddingMode: "api",
        embeddingModel: "qwen/qwen3-embedding-8b",
      }),
    ).toEqual({
      MNEMOSYNE_EMBEDDING_API_URL: "https://openrouter.ai/api/v1",
      MNEMOSYNE_EMBEDDING_MODEL: "qwen/qwen3-embedding-8b",
      MNEMOSYNE_EMBEDDINGS_OFF: "",
      MNEMOSYNE_EMBEDDINGS_VIA_API: "1",
      MNEMOSYNE_NO_EMBEDDINGS: "",
      MNEMOSYNE_SKIP_EMBEDDINGS: "",
    });

    // An empty model or endpoint is omitted, never written as an empty value:
    // `MNEMOSYNE_EMBEDDING_MODEL=""` would replace mnemosyne's own default.
    const sparse = embeddingEnvironment({
      embeddingApiUrl: "",
      embeddingMode: "api",
      embeddingModel: "",
    });
    expect(Object.hasOwn(sparse, "MNEMOSYNE_EMBEDDING_MODEL")).toBe(false);
    expect(Object.hasOwn(sparse, "MNEMOSYNE_EMBEDDING_API_URL")).toBe(false);
    // No credential is ever part of the mapping.
    expect(Object.keys(sparse).some((key) => CREDENTIAL_KEY_PATTERN.test(key))).toBe(
      false,
    );
  });

  it("merges the embedding switches into a child's environment, adding nothing else", () => {
    // The wire from the panel to mnemosyne: everything the caller already had
    // stays, and only the embedding keys are ours.
    const merged = mnemosyneEnvironment(
      {
        embeddingApiUrl: "",
        embeddingMode: "off",
        embeddingModel: "",
      },
      {
        KEEP: "1",
        MNEMOSYNE_EMBEDDINGS_OFF: "",
        PATH: "/usr/bin",
      },
    );
    expect(merged.KEEP).toBe("1");
    expect(merged.PATH).toBe("/usr/bin");
    // The switch wins over a stale value the caller carried.
    expect(merged.MNEMOSYNE_EMBEDDINGS_OFF).toBe("1");
    // Two caller keys plus the four disable switches: nothing else is added.
    expect(Object.keys(merged).sort()).toEqual([
      "KEEP",
      "MNEMOSYNE_EMBEDDINGS_OFF",
      "MNEMOSYNE_EMBEDDINGS_VIA_API",
      "MNEMOSYNE_NO_EMBEDDINGS",
      "MNEMOSYNE_SKIP_EMBEDDINGS",
      "PATH",
    ]);
  });
  it("resolves offlineExtractionModel from the environment, user config and default", () => {
    const configHome = createTemporaryDirectory();
    expect(
      loadConfig({
        configHome,
        env: {},
      }).config.offlineExtractionModel,
    ).toBe("session-model");

    // A user-set id survives a save of an unrelated setting: the key is writable.
    mkdirSync(join(configHome, "xpi-memo"), {
      recursive: true,
    });
    writeFileSync(
      configPath(configHome),
      JSON.stringify({
        offlineExtractionModel: "anthropic/sonnet",
      }),
    );
    expect(
      loadConfig({
        configHome,
        env: {},
      }).config.offlineExtractionModel,
    ).toBe("anthropic/sonnet");
    saveUserConfig({
      configHome,
      env: {},
      values: {
        paused: true,
      },
    });
    expect(
      JSON.parse(readFileSync(configPath(configHome), "utf8")).offlineExtractionModel,
    ).toBe("anthropic/sonnet");

    // The environment wins, and a blank value never replaces the default.
    expect(
      loadConfig({
        configHome,
        env: {
          XPI_MEMO_OFFLINE_EXTRACTION_MODEL: "openai/gpt-5",
        },
      }).config.offlineExtractionModel,
    ).toBe("openai/gpt-5");
    expect(
      loadConfig({
        configHome,
        env: {
          XPI_MEMO_OFFLINE_EXTRACTION_MODEL: "   ",
        },
      }).config.offlineExtractionModel,
    ).toBe("anthropic/sonnet");
  });
  it("uses XDG_CONFIG_HOME and falls back to the home config directory", () => {
    const xdgConfigHome = createTemporaryDirectory();
    mkdirSync(join(xdgConfigHome, "xpi-memo"), {
      recursive: true,
    });
    writeFileSync(
      configPath(xdgConfigHome),
      JSON.stringify({
        retrievalMode: "fts5",
      }),
    );

    expect(
      loadConfig({
        env: {
          XDG_CONFIG_HOME: xdgConfigHome,
        },
      }).config.retrievalMode,
    ).toBe("fts5");

    const defaultResult = loadConfig({
      configHome: join(homedir(), ".config"),
      env: {},
    });
    expect(defaultResult.config).toBeDefined();
  });

  it("atomically saves only non-sensitive writable settings", () => {
    const configHome = createTemporaryDirectory();
    mkdirSync(join(configHome, "xpi-memo"), {
      recursive: true,
    });
    writeFileSync(
      configPath(configHome),
      JSON.stringify({
        apiKey: "drop",
        dataDir: "/keep",
        limit: 2,
      }),
    );

    saveUserConfig({
      configHome,
      env: {
        XPI_MEMO_LIMIT: "9",
      },
      values: {
        limit: 8,
        paused: true,
        retrievalMode: "fts5",
      },
    });

    const saved = JSON.parse(readFileSync(configPath(configHome), "utf8"));
    expect(saved).toEqual({
      limit: 2,
      paused: true,
      retrievalMode: "fts5",
    });
    expect(saved).not.toHaveProperty("apiKey");
    expect(saved).not.toHaveProperty("dataDir");
  });
});

describe("L0 config flag", () => {
  it("defaults l0Enabled to true", () => {
    const config = loadConfig({
      configHome: createTemporaryDirectory(),
      env: {},
    });
    expect(config.config.l0Enabled).toBe(true);
  });

  it("reads XPI_MEMO_L0_ENABLED=false to disable L0", () => {
    const config = loadConfig({
      configHome: createTemporaryDirectory(),
      env: {
        XPI_MEMO_L0_ENABLED: "false",
      } as NodeJS.ProcessEnv,
    });
    expect(config.config.l0Enabled).toBe(false);
  });
});

describe("runtime surface flags", () => {
  it("defaults lifecycle surfaces to enabled", () => {
    const config = loadConfig({
      configHome: createTemporaryDirectory(),
      env: {},
    });
    expect(config.config.eventPresentation).toBe(true);
    expect(config.config.passiveFeedback).toBe(true);
    expect(config.config.profileInjection).toBe(true);
  });

  it("reads surface flags from the environment", () => {
    const config = loadConfig({
      configHome: createTemporaryDirectory(),
      env: {
        XPI_MEMO_EVENT_PRESENTATION: "false",
        XPI_MEMO_PASSIVE_FEEDBACK: "false",
        XPI_MEMO_PROFILE_INJECTION: "false",
      } as NodeJS.ProcessEnv,
    });
    expect(config.config.eventPresentation).toBe(false);
    expect(config.config.passiveFeedback).toBe(false);
    expect(config.config.profileInjection).toBe(false);
  });

  it("lets user config disable a surface and ignores an invalid value", () => {
    const configHome = createTemporaryDirectory();
    mkdirSync(join(configHome, "xpi-memo"), {
      recursive: true,
    });
    writeFileSync(
      configPath(configHome),
      JSON.stringify({
        passiveFeedback: "no",
        profileInjection: false,
      }),
    );

    const config = loadConfig({
      configHome,
      env: {},
    }).config;
    expect(config.profileInjection).toBe(false);
    expect(config.passiveFeedback).toBe(true);
  });
});
