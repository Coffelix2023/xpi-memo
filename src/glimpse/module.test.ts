/**
 * Resolution tests for `resolveGlimpseModule` / `resolveGlimpsePrompt`, which
 * live in `module.ts`.
 *
 * Kept in its own file: these tests replace `node:module` and `node:fs`, and a
 * module-level mock would leak into every sibling test in this directory.
 *
 * No assertion here names a concrete install path — the candidate list is an
 * implementation detail, and pinning it would make this file fail on machines
 * that legitimately have Glimpse installed somewhere else.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Mutable knobs the hoisted mock factories read at call time. */
const state = vi.hoisted(() => ({
  resolveTarget: "",
  resolveThrows: true,
}));

vi.mock("node:module", () => ({
  createRequire: () => ({
    resolve: () => {
      if (state.resolveThrows) {
        throw new Error("Cannot find module 'glimpseui'");
      }
      return state.resolveTarget;
    },
  }),
}));

// `existsSync` is forced false so the well-known-path fallback never reaches a
// real Glimpse install on the developer's machine; the rest of node:fs stays real.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: () => false,
  };
});

const { resolveGlimpseModule, resolveGlimpsePrompt } = await import("./module.js");

describe("glimpse module resolution", () => {
  let fixtureDir = "";
  let openOnlyFixture = "";
  let emptyFixture = "";

  beforeAll(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), "glimpse-resolve-"));
    openOnlyFixture = join(fixtureDir, "open-only.mjs");
    emptyFixture = join(fixtureDir, "empty.mjs");
    // `open` but no `prompt`: a module that can host a window but not a one-shot dialog.
    writeFileSync(openOnlyFixture, "export const open = () => ({});\n");
    writeFileSync(emptyFixture, "export const unrelated = 1;\n");
  });

  afterAll(() => {
    rmSync(fixtureDir, {
      force: true,
      recursive: true,
    });
  });

  beforeEach(() => {
    state.resolveTarget = "";
    state.resolveThrows = true;
  });

  it("returns null instead of throwing when no install root resolves", async () => {
    state.resolveThrows = true;

    await expect(resolveGlimpseModule()).resolves.toBeNull();
    await expect(resolveGlimpsePrompt()).resolves.toBeNull();
  });

  it("returns null when the resolved module exposes neither prompt nor open", async () => {
    state.resolveThrows = false;
    state.resolveTarget = emptyFixture;

    await expect(resolveGlimpseModule()).resolves.toBeNull();
    await expect(resolveGlimpsePrompt()).resolves.toBeNull();
  });

  it("returns the module when it exposes open, and still yields no prompt", async () => {
    state.resolveThrows = false;
    state.resolveTarget = openOnlyFixture;

    const mod = await resolveGlimpseModule();
    expect(mod).not.toBeNull();
    expect(typeof mod?.open).toBe("function");
    // The window surface is available, the one-shot dialog surface is not.
    await expect(resolveGlimpsePrompt()).resolves.toBeNull();
  });
});
