import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_XPI_MEMO_CONFIG,
  loadConfig,
  saveUserConfig,
  type UserConfig,
} from "./config.js";

const temporaryDirectories: string[] = [];

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
