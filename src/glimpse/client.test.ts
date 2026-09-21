import { describe, expect, it } from "vitest";
import { CLIENT_SCRIPT } from "./client.ts";

const VIEWS = [
  "pending",
  "recent",
  "settings",
  "status",
] as const;

/** A language message must carry the view it should re-render onto. */
const LANGUAGE_WITH_VIEW = /type: "language",[\s\S]*?view: activeView\(\)/;
/** Escape must close the window, not merely clear local state. */
const ESCAPE_CLOSES = /event\.key === "Escape"[\s\S]*?type: "close"/;

describe("glimpse in-page client", () => {
  it("parses as JavaScript", () => {
    // A syntax error here means the window renders but nothing works.
    expect(() => new Function(CLIENT_SCRIPT)).not.toThrow();
  });

  it("knows all four views", () => {
    for (const view of VIEWS) {
      expect(CLIENT_SCRIPT, view).toContain(`"${view}"`);
    }
  });

  it("routes by hash across every view", () => {
    expect(CLIENT_SCRIPT).toContain("hashchange");
    expect(CLIENT_SCRIPT).toContain("dataset.route");
    expect(CLIENT_SCRIPT).toContain('location.hash = "#/" + nav.dataset.tab');
    // `setHTML` wipes location.hash, so an empty hash must respect the
    // server-rendered `.is-active` view instead of falling back to pending
    // — otherwise a language re-render lands the window back on page one.
    expect(CLIENT_SCRIPT).toContain('document.querySelector(".tabpage.is-active")');
    expect(CLIENT_SCRIPT).not.toContain('location.hash || "#/pending"');
  });

  it("wires both toggles and the close button", () => {
    // P0-1-W1 theme, P0-1-W2 language, P0-1-B2 close.
    expect(CLIENT_SCRIPT).toContain('"#P0-1-W1"');
    expect(CLIENT_SCRIPT).toContain('"#P0-1-W2"');
    expect(CLIENT_SCRIPT).toContain('"#P0-1-B2"');
  });

  it("emits every message type the Node side handles", () => {
    for (const type of [
      "theme",
      "language",
      "review",
      "close",
      "setting",
    ]) {
      expect(CLIENT_SCRIPT, type).toContain(`type: "${type}"`);
    }
  });

  it("carries the current view with a language change", () => {
    // The re-render is whole-document, so the view has to travel with it.
    expect(CLIENT_SCRIPT).toMatch(LANGUAGE_WITH_VIEW);
  });

  it("carries the selected candidate index with a review decision", () => {
    expect(CLIENT_SCRIPT).toContain("index: selectedIndex()");
    expect(CLIENT_SCRIPT).toContain("decision.dataset.decision");
  });

  it("does not persist preferences in the page", () => {
    // Storage in a webview is not a documented guarantee; preferences go to
    // Node so they survive a window close and stay testable.
    expect(CLIENT_SCRIPT).not.toContain("localStorage");
    expect(CLIENT_SCRIPT).not.toContain("sessionStorage");
  });

  it("does not carry over the prototype's demo toolbar", () => {
    expect(CLIENT_SCRIPT).not.toContain("tb-btn");
    expect(CLIENT_SCRIPT).not.toContain("state-toggle");
  });

  it("cannot interpolate server values by accident", () => {
    // The script is a plain string; a `${` would mean someone started building
    // it with template interpolation and the escaping rules changed.
    expect(CLIENT_SCRIPT).not.toContain("${");
  });

  it("declares the DOM contract the views must satisfy", () => {
    for (const selector of [
      ".tabpage",
      ".nav-item",
      ".candidate-item",
      ".detail-block",
      ".tabs-trigger",
      ".tabs-content",
      ".field-row",
      "button[data-decision]",
      ".f-control",
    ]) {
      expect(CLIENT_SCRIPT, selector).toContain(selector);
    }
  });

  it("keeps the keyboard contract: arrows select, Escape closes", () => {
    expect(CLIENT_SCRIPT).toContain("ArrowUp");
    expect(CLIENT_SCRIPT).toContain("ArrowDown");
    // The settings tab strip is walked with left/right, per the ARIA tabs
    // pattern; up/down stay with the pending list.
    expect(CLIENT_SCRIPT).toContain("ArrowLeft");
    expect(CLIENT_SCRIPT).toContain("ArrowRight");
    expect(CLIENT_SCRIPT).toMatch(ESCAPE_CLOSES);
  });
});
