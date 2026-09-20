import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The `glimpseui` surface this extension consumes, and the code that finds it.
 *
 * Depends on nothing else in this project — only node builtins — which is what
 * keeps it cycle-proof: `console.ts` and the window both import it, and
 * `console.ts` imports the window to open it. A module that imports none
 * of its own callers can never close a loop.
 *
 * Shaped from the real `glimpse.mjs`: `GlimpseWindow extends EventEmitter`, so
 * `on` chains and returns `this`, and `open` is synchronous while `prompt`
 * returns a promise.
 */

export interface GlimpsePromptOptions {
  height: number;
  title: string;
  width: number;
}

export type GlimpsePromptFn = (
  html: string,
  options: GlimpsePromptOptions,
) => Promise<unknown>;

/**
 * A live Glimpse window. Unlike `prompt`, it stays open across many
 * interactions: messages keep arriving until the window closes.
 */
export interface GlimpseWindow {
  close(): void;
  // `on` comes from EventEmitter, so it chains and returns the window itself.
  on(event: "closed", handler: () => void): this;
  on(event: "message", handler: (data: unknown) => void): this;
  on(event: "ready", handler: (info: unknown) => void): this;
  send(script: string): void;
  /** Replace the document; used to re-render after a language change. */
  setHTML(html: string): void;
}

/** Opens a persistent Glimpse window; see `GlimpseWindow`. */
export type GlimpseOpenFn = (
  html: string,
  options: GlimpsePromptOptions,
) => GlimpseWindow;

/** The subset of the `glimpseui` module surface this extension consumes. */
export interface GlimpseModule {
  open?: GlimpseOpenFn;
  prompt?: GlimpsePromptFn;
}

/**
 * Dynamically resolve the Glimpse module across candidate install roots.
 *
 * Returns `null` (never throws) when Glimpse is not installed, so every caller
 * can treat "absent" and "broken" as the same fallback branch.
 */
export async function resolveGlimpseModule(): Promise<GlimpseModule | null> {
  // First try standard module resolution
  try {
    const req = createRequire(import.meta.url);
    const resolved = req.resolve("glimpseui");
    const mod = (await import(resolved)) as GlimpseModule;
    if (typeof mod.prompt === "function" || typeof mod.open === "function") {
      return mod;
    }
  } catch {
    // Fall back to well-known Pi tool paths
  }

  const candidatePaths = [
    join(
      homedir(),
      ".pi",
      "agent",
      "npm",
      "node_modules",
      "glimpseui",
      "src",
      "glimpse.mjs",
    ),
    join(homedir(), ".pi", "agent", "node_modules", "glimpseui", "src", "glimpse.mjs"),
  ];

  for (const p of candidatePaths) {
    try {
      if (!existsSync(p)) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: 候选路径按优先级逐个动态 import,找到即返回
      const mod = (await import(p)) as GlimpseModule;
      if (typeof mod.prompt === "function" || typeof mod.open === "function") {
        return mod;
      }
    } catch {
      // Continue searching
    }
  }
  return null;
}

/** Dynamically resolve the Glimpse one-shot prompt function, or `null`. */
export async function resolveGlimpsePrompt(): Promise<GlimpsePromptFn | null> {
  const mod = await resolveGlimpseModule();
  return typeof mod?.prompt === "function" ? mod.prompt : null;
}
