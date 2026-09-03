import { describe, expect, it } from "vitest";
import { extractExplicitMemoryIntent } from "./memory-intent.js";

const project = {
  projectBank: "project-demo",
};

describe("explicit memory intent extraction", () => {
  it.each([
    [
      "请记住，我默认使用中文回复。",
      "global_preference",
    ],
    [
      "Please remember: prefer concise answers.",
      "global_preference",
    ],
    [
      "以后每次先跑测试再改代码。",
      "global_workflow",
    ],
    [
      "Remember this workflow: run tests before editing.",
      "global_workflow",
    ],
    [
      "本项目必须使用 pnpm。",
      "project_constraint",
    ],
    [
      "In this repository, never add runtime dependencies.",
      "project_constraint",
    ],
    [
      "我们决定采用 TypeScript。",
      "project_decision",
    ],
    [
      "We decided to keep the existing adapter.",
      "project_decision",
    ],
    [
      "注意：这个接口不能在循环里 await。",
      "project_gotcha",
    ],
    [
      "Gotcha: this backend needs an explicit data directory.",
      "project_gotcha",
    ],
    [
      "本次任务记住先修类型错误。",
      "session_context",
    ],
    [
      "For this session, remember the migration is pending.",
      "session_context",
    ],
  ] as const)("extracts %s as %s", (text, kind) => {
    expect(extractExplicitMemoryIntent(text, project)).toMatchObject({
      type: "memory",
      kind,
    });
  });

  it.each([
    [
      "Actually, always answer in Chinese.",
      "correction",
      "global_preference",
    ],
    [
      "更正：以后提交前先运行测试。",
      "correction",
      "global_workflow",
    ],
  ] as const)("extracts %s as a %s of %s", (text, signal, kind) => {
    expect(extractExplicitMemoryIntent(text, project)).toMatchObject({
      type: "memory",
      kind,
      signal,
    });
  });

  it.each([
    "I use pnpm.",
    "这个项目很有趣。",
    "Please fix the failing test.",
    "记住这个。",
  ])("skips ordinary or underspecified text: %s", (text) => {
    expect(extractExplicitMemoryIntent(text, project).type).toBe("skip");
  });

  it("skips conflicting categories instead of guessing", () => {
    expect(
      extractExplicitMemoryIntent("记住本项目必须采用这个工作流程。", project),
    ).toMatchObject({
      reason: "ambiguous-intent",
      type: "skip",
    });
  });

  it.each([
    "本项目必须使用 pnpm。",
    "We decided to keep the existing adapter.",
    "Gotcha: this backend needs an explicit data directory.",
  ])("skips project-scoped intent without project context: %s", (text) => {
    expect(
      extractExplicitMemoryIntent(text, {
        projectBank: null,
      }),
    ).toMatchObject({
      reason: "missing-project-context",
      type: "skip",
    });
  });

  it("extracts session context without project context (task 2.3)", () => {
    expect(
      extractExplicitMemoryIntent(
        "For this session, remember the migration is pending.",
        {
          projectBank: null,
        },
      ),
    ).toMatchObject({
      kind: "session_context",
      type: "memory",
    });
  });
  it("does not auto-create repository facts", () => {
    const result = extractExplicitMemoryIntent("记住仓库使用 TypeScript。", project);
    expect(result.type).toBe("skip");
  });

  it("skips oversized session context", () => {
    const result = extractExplicitMemoryIntent(
      `本次任务记住 ${"x".repeat(501)}`,
      project,
    );
    expect(result).toMatchObject({
      reason: "session-context-too-long",
      type: "skip",
    });
  });
});
