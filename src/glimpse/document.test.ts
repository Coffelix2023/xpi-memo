import { describe, expect, it } from "vitest";
import {
  type GlimpseDocumentInput,
  renderDocument,
  THEME_TOKEN_NAMES,
  VIEW_IDS,
  VIEW_ROUTES,
} from "./document.ts";

const MARKERS: Record<string, string> = {
  pending: '<div data-test="pending-body">pending</div>',
  recent: '<div data-test="recent-body">recent</div>',
  settings: '<div data-test="settings-body">settings</div>',
  status: '<div data-test="status-body">status</div>',
};

function build(overrides: Partial<GlimpseDocumentInput> = {}): string {
  return renderDocument({
    footer: '<footer class="app-footer" data-test="footer"></footer>',
    header: '<header class="app-header" data-test="header"></header>',
    initialView: "pending",
    language: "zh",
    sidebar: '<nav class="app-sidebar" data-test="sidebar"></nav>',
    theme: "dark",
    views: MARKERS,
    ...overrides,
  });
}

const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b/;
const EXTERNAL_URL_PATTERN = /(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i;
const EXTERNAL_SCRIPT_PATTERN = /<script[^>]+src=/i;
const EXTERNAL_LINK_PATTERN = /<link[^>]+href=/i;
const EXTERNAL_CSS_URL_PATTERN = /url\(\s*['"]?(?:https?:)?\/\//i;

describe("glimpse window document", () => {
  it("is a complete html document", () => {
    const html = build();

    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain("<title>");
  });

  it("declares both theme blocks", () => {
    const html = build();

    expect(html).toContain(":root {");
    expect(html).toContain(".dark {");
    // Every token is declared under each block, so switching is total.
    for (const name of THEME_TOKEN_NAMES) {
      expect(html.split(`--${name}:`).length - 1, name).toBe(2);
    }
  });

  it("decides the theme before the first view container", () => {
    // No in-page bootstrap: the class is already right on the first paint, so
    // there is no default-theme frame to suppress and no script to run.
    const html = build({
      theme: "light",
    });
    const htmlTag = html.indexOf("<html");
    const firstView = html.indexOf('<section class="tabpage');

    expect(htmlTag).toBeGreaterThan(-1);
    expect(firstView).toBeGreaterThan(htmlTag);
    expect(html).toContain('<html class="" lang="zh">');
  });

  it("bakes the dark class for the dark theme", () => {
    expect(
      build({
        theme: "dark",
      }),
    ).toContain('<html class="dark"');
    expect(
      build({
        theme: "light",
      }),
    ).not.toContain('<html class="dark"');
  });

  it("carries the language on the html element", () => {
    expect(
      build({
        language: "zh",
      }),
    ).toContain('lang="zh"');
    expect(
      build({
        language: "en",
      }),
    ).toContain('lang="en"');
  });

  it("wraps all four views with their routes", () => {
    const html = build();

    expect(html.split('<section class="tabpage').length - 1).toBe(VIEW_IDS.length);
    for (const view of VIEW_IDS) {
      expect(html, view).toContain(`data-route="${VIEW_ROUTES[view]}"`);
      expect(html, view).toContain(`data-page="${view}"`);
    }
  });

  it("renders only the initial view visible", () => {
    const html = build({
      initialView: "settings",
    });

    expect(html).toContain('data-page="settings" aria-label="settings">');
    for (const view of VIEW_IDS) {
      if (view === "settings") continue;
      expect(html, view).toContain(`data-page="${view}" aria-label="${view}" hidden>`);
    }
  });

  it("places the chrome around the content region", () => {
    const html = build();

    expect(html).toContain('<div class="window" id="P0-1-A1"');
    expect(html).toContain('<div class="app-body">');
    expect(html).toContain('<main class="app-content">');
    expect(html.indexOf("app-header")).toBeLessThan(html.indexOf("app-sidebar"));
    expect(html.indexOf("app-content")).toBeLessThan(html.indexOf("app-footer"));
  });

  it("includes every view body exactly once", () => {
    const html = build();

    for (const [view, marker] of Object.entries(MARKERS)) {
      expect(html.split(marker).length - 1, view).toBe(1);
    }
  });

  it("carries the client script", () => {
    const html = build();

    expect(html).toContain("<script>");
    expect(html).toContain("window.glimpse.send");
  });

  it("declares the window's semantic anchors", () => {
    const html = build();

    // The shell anchor the semantic dictionary names.
    expect(html).toContain('id="P0-1-A1"');
    expect(html).toContain('role="application"');
  });
});

describe("glimpse window document is self-contained", () => {
  it("fetches nothing over the network", () => {
    const html = build();

    expect(html).not.toMatch(EXTERNAL_URL_PATTERN);
    expect(html).not.toContain("@import");
    expect(html).not.toContain("<link");
  });

  it("loads no external script or stylesheet", () => {
    const html = build();

    expect(html).not.toMatch(EXTERNAL_SCRIPT_PATTERN);
    expect(html).not.toMatch(EXTERNAL_LINK_PATTERN);
    expect(html).not.toMatch(EXTERNAL_CSS_URL_PATTERN);
  });

  it("inlines every style module", () => {
    const html = build();

    // One <style> block, and it carries each module's signature rule.
    expect(html.split("<style>").length - 1).toBe(1);
    for (const marker of [
      "--h-header: 56px", // base
      ".app-sidebar", // chrome
      ".btn", // components
      ".kpi-grid", // status view
      ".settings-scroll", // settings view
      ".table-wrap", // recent view
      ".pane-split", // pending view
    ]) {
      expect(html, marker).toContain(marker);
    }
  });

  it("introduces no literal color anywhere in the document", () => {
    expect(build()).not.toMatch(HEX_COLOR_PATTERN);
  });
});
