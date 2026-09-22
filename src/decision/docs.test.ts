import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_XPI_MEMO_CONFIG } from "../config.js";

const STRUCTURAL_CLAIM = /structurally|structural guarantee/;
const SECRET_SAMPLES = [
  /\bsk-[A-Za-z0-9_-]{8,}/,
  /\bBearer\s+[A-Za-z0-9._-]{12,}/,
  /TYPESAFE_API_KEY\s*[:=]\s*[^\s`|]/,
];
const guide = readFileSync(new URL("../../GUIDE.md", import.meta.url), "utf8");
const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");

const SWITCHES = [
  "decisionRunnerEnabled",
  "decisionRerankEnabled",
  "decisionRerankGapThreshold",
  "decisionRepeatJudgmentEnabled",
  "decisionRepeatThreshold",
  "decisionCalibrationEnabled",
  "decisionStabilityThreshold",
] as const;

const ENV_NAMES = [
  "XPI_MEMO_DECISION_RUNNER",
  "XPI_MEMO_DECISION_RERANK",
  "XPI_MEMO_DECISION_RERANK_GAP",
  "XPI_MEMO_DECISION_REPEAT_JUDGMENT",
  "XPI_MEMO_DECISION_REPEAT_THRESHOLD",
  "XPI_MEMO_DECISION_CALIBRATION",
  "XPI_MEMO_DECISION_STABILITY_THRESHOLD",
  "TYPESAFE_API_KEY",
  "TYPESAFE_API_URL",
] as const;

describe("decision connection documentation (task 5.1)", () => {
  it("documents every switch and env var in both entry points", () => {
    expect(guide).toContain("## Decision connection (optional)");
    expect(readme).toContain("GUIDE.md#decision-connection-optional");
    for (const key of SWITCHES) {
      expect(guide, key).toContain(key);
      expect(readme, key).toContain(key);
    }
    for (const name of ENV_NAMES) {
      expect(guide, name).toContain(name);
      expect(readme, name).toContain(name);
    }
  });

  it("documents the defaults the code actually ships", () => {
    const defaults: Record<(typeof SWITCHES)[number], string> = {
      decisionCalibrationEnabled: String(
        DEFAULT_XPI_MEMO_CONFIG.decisionCalibrationEnabled,
      ),
      decisionRepeatJudgmentEnabled: String(
        DEFAULT_XPI_MEMO_CONFIG.decisionRepeatJudgmentEnabled,
      ),
      decisionRepeatThreshold: String(DEFAULT_XPI_MEMO_CONFIG.decisionRepeatThreshold),
      decisionRerankEnabled: String(DEFAULT_XPI_MEMO_CONFIG.decisionRerankEnabled),
      decisionRerankGapThreshold: String(
        DEFAULT_XPI_MEMO_CONFIG.decisionRerankGapThreshold,
      ),
      decisionRunnerEnabled: String(DEFAULT_XPI_MEMO_CONFIG.decisionRunnerEnabled),
      decisionStabilityThreshold: String(
        DEFAULT_XPI_MEMO_CONFIG.decisionStabilityThreshold,
      ),
    };
    for (const key of SWITCHES) {
      const row = guide.split("\n").find((line) => line.startsWith(`| \`${key}\``));
      expect(row, key).toBeDefined();
      expect(row as string, key).toContain(`\`${defaults[key]}\``);
    }
  });

  it("keeps the rollout and rollback story explicit", () => {
    expect(guide).toContain("### Fail-open semantics");
    expect(guide).toContain("### Turning it off");
    expect(guide).toMatch(STRUCTURAL_CLAIM);
  });

  it("never shows a real credential sample", () => {
    for (const document of [
      guide,
      readme,
    ]) {
      for (const pattern of SECRET_SAMPLES) expect(document).not.toMatch(pattern);
    }
  });
});
