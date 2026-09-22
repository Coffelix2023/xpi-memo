import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildDnaInjection,
  DNA_MAX_ENTRIES_PER_DOMAIN,
  DNA_MAX_INJECTION_CHARS,
  detectDnaDomains,
} from "./inject.ts";
import { dnaFilePath } from "./load.ts";

const temporaryDirectories: string[] = [];

function projectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "xpi-memo-dna-inject-"));
  temporaryDirectories.push(dir);
  return dir;
}

function writeDna(dir: string, text: string): void {
  mkdirSync(join(dir, ".pi"), {
    recursive: true,
  });
  writeFileSync(dnaFilePath(dir), text, "utf8");
}

afterEach(() => {
  for (const dir of temporaryDirectories.splice(0)) {
    rmSync(dir, {
      force: true,
      recursive: true,
    });
  }
});

const bothDomains = `art:
  - id: card-border
    semantic: 卡片必须有 1px 边框
    source: user-authored
    confidence: high
write:
  - id: essay-tone
    semantic: 散文用克制语气,少用感叹号
    source: user-authored
    confidence: high
`;

describe("domain detection (task 3.2)", () => {
  it("detects only the art domain for frontend prompts", () => {
    expect(detectDnaDomains("帮我改一下这个页面的布局和间距")).toEqual({
      art: true,
      write: false,
    });
  });

  it("detects only the write domain for writing prompts", () => {
    expect(detectDnaDomains("帮我润色这一章的文案")).toEqual({
      art: false,
      write: true,
    });
  });

  it("detects nothing for unrelated prompts", () => {
    expect(detectDnaDomains("run the unit tests and report failures")).toEqual({
      art: false,
      write: false,
    });
  });
});

describe("bounded DNA injection (tasks 3.1/3.3)", () => {
  it("injects only the detected domain with the file header", () => {
    const dir = projectDir();
    writeDna(dir, bothDomains);
    const block = buildDnaInjection({
      cwd: dir,
      prompt: "调整页面布局",
      trusted: true,
    });
    expect(block).toContain("项目文件上下文(.pi/DNA.yaml)");
    expect(block).toContain("[art]");
    expect(block).toContain("卡片必须有 1px 边框");
    expect(block).not.toContain("[write]");
    expect(block).not.toContain("散文用克制语气");
  });

  it("returns null for unrelated prompts", () => {
    const dir = projectDir();
    writeDna(dir, bothDomains);
    expect(
      buildDnaInjection({
        cwd: dir,
        prompt: "run the unit tests",
        trusted: true,
      }),
    ).toBeNull();
  });

  it("returns null for empty domains", () => {
    const dir = projectDir();
    writeDna(dir, "art: []\nwrite: []\n");
    expect(
      buildDnaInjection({
        cwd: dir,
        prompt: "调整页面布局",
        trusted: true,
      }),
    ).toBeNull();
  });

  it("returns null in untrusted projects", () => {
    const dir = projectDir();
    writeDna(dir, bothDomains);
    expect(
      buildDnaInjection({
        cwd: dir,
        prompt: "调整页面布局",
        trusted: false,
      }),
    ).toBeNull();
  });

  it("stays within the character budget and reports omissions", () => {
    const dir = projectDir();
    const entries = Array.from(
      {
        length: DNA_MAX_ENTRIES_PER_DOMAIN + 10,
      },
      (_, index) =>
        `  - id: entry-${index}\n    semantic: 第 ${index} 条很长的规则,用来撑爆预算,内容内容内容内容内容内容内容\n    source: user-authored\n    confidence: high\n`,
    ).join("");
    writeDna(dir, `art:\n${entries}write: []\n`);
    const block = buildDnaInjection({
      cwd: dir,
      prompt: "页面布局",
      trusted: true,
    });
    expect(block).not.toBeNull();
    if (!block) return;
    expect(block.length).toBeLessThanOrEqual(DNA_MAX_INJECTION_CHARS + 80);
    expect(block).toContain("省略");
  });
});
