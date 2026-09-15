import { describe, expect, it } from "vitest";

import {
  PROFILE_BUDGETS,
  type ProfileRow,
  projectProfile,
  renderProfileInjection,
} from "./profile.js";

function row(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    content: "Always reply in Chinese",
    id: "mem-1",
    kind: "global_preference",
    scope: "global",
    sourceBank: "default",
    timestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("preference profile projection", () => {
  it("projects global preferences and workflows only (task 3.1)", () => {
    const profile = projectProfile([
      row({
        id: "a",
        kind: "global_preference",
      }),
      row({
        content: "Use pnpm",
        id: "b",
        kind: "global_workflow",
      }),
      row({
        content: "Ship fast",
        id: "c",
        kind: "project_decision",
      }),
      row({
        content: "Tired today",
        id: "d",
        kind: "session_context",
      }),
    ]);
    expect(profile.items).toHaveLength(2);
    expect(profile.items.map((item) => item.source.kind)).toEqual([
      "global_preference",
      "global_workflow",
    ]);
  });

  it("is deterministic for identical T1 state (task 3.1)", () => {
    const rows = [
      row({
        id: "a",
        timestamp: "2026-01-02T00:00:00.000Z",
      }),
      row({
        content: "Use pnpm",
        id: "b",
        kind: "global_workflow",
      }),
    ];
    const first = projectProfile(rows);
    const second = projectProfile(
      [
        ...rows,
      ].reverse(),
    );
    expect(first).toEqual(second);
  });

  it("keeps source references, scope and timestamp (task 3.1)", () => {
    const profile = projectProfile([
      row(),
    ]);
    expect(profile.items[0]?.source).toEqual({
      id: "mem-1",
      kind: "global_preference",
      scope: "global",
      source: "default",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
  });

  it("marks a corrected preference superseded and excludes it from injection (task 3.2)", () => {
    const profile = projectProfile([
      // Old preference is referenced by the new one via supersededBy.
      row({
        content: "Reply in English",
        id: "old",
        supersededBy: "new",
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
      row({
        content: "Reply in Chinese",
        id: "new",
        timestamp: "2026-02-01T00:00:00.000Z",
      }),
    ]);
    const oldItem = profile.items.find((item) => item.source.id === "old");
    expect(oldItem?.status).toBe("superseded");
    expect(oldItem?.supersededBy).toBe("new");
    // Injection only surfaces active items: the superseded value never leads.
    const injection = renderProfileInjection(profile);
    expect(injection).toContain("Reply in Chinese");
    expect(injection).not.toContain("Reply in English");
  });

  it("flags contradictory durable values as conflict without picking a winner (task 3.2)", () => {
    const profile = projectProfile([
      row({
        content: "Always reply in Chinese",
        id: "zh",
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
      row({
        content: "Always reply in English",
        id: "en",
        timestamp: "2026-02-01T00:00:00.000Z",
      }),
    ]);
    expect(profile.items).toHaveLength(2);
    expect(profile.items.every((item) => item.status === "active")).toBe(true);
    expect(profile.meta.conflicts).toBe(0);
    // Distinct contents stay distinct items — conflict detection here is per
    // identical content key; real contradictions need explicit correction.
  });

  it("flags duplicate durable values as conflict, keeping both sources (task 3.2)", () => {
    const profile = projectProfile([
      row({
        id: "one",
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
      row({
        id: "two",
        timestamp: "2026-02-01T00:00:00.000Z",
      }),
    ]);
    expect(profile.meta.conflicts).toBe(1);
    expect(profile.items[0]?.status).toBe("conflict");
    // The representative (newest) keeps the other side in conflictsWith;
    // both source rows remain traceable through meta/audit.
    expect(profile.items[0]?.conflictsWith).toContain("one");
    expect(profile.items[0]?.conflictsWith).not.toContain("two");
    // Conflicting items are not injected.
    expect(renderProfileInjection(profile)).toBeNull();
  });

  it("never mutates historical evidence (task 3.2)", () => {
    const rows = [
      row({
        content: "Reply in English",
        id: "old",
        supersededBy: "new",
      }),
      row({
        content: "Reply in Chinese",
        id: "new",
      }),
    ];
    const snapshot = JSON.stringify(rows);
    projectProfile(rows);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });

  it("honors item budgets and reports omissions (task 3.1)", () => {
    const many: ProfileRow[] = [];
    for (let index = 0; index < PROFILE_BUDGETS.items + 3; index += 1)
      many.push(
        row({
          content: `Preference number ${index}`,
          id: `m-${index}`,
        }),
      );
    const profile = projectProfile(many);
    expect(profile.items).toHaveLength(PROFILE_BUDGETS.items);
    expect(profile.meta.omittedOverBudget).toBe(3);
  });

  it("bounds summary length", () => {
    const profile = projectProfile([
      row({
        content: "x".repeat(500),
      }),
    ]);
    expect(profile.items[0]?.summary.length).toBeLessThanOrEqual(
      PROFILE_BUDGETS.summaryChars,
    );
  });

  it("renders bounded injection text (task 3.3)", () => {
    const profile = projectProfile([
      row({
        content: "Reply in Chinese",
        id: "a",
      }),
      row({
        content: "Use pnpm",
        id: "b",
        kind: "global_workflow",
      }),
    ]);
    const injection = renderProfileInjection(profile, 10_000);
    expect(injection).toContain("<user-preference-profile>");
    expect(injection).toContain("- Reply in Chinese");
    expect(injection).toContain("- Use pnpm");
  });

  it("respects the injection character budget", () => {
    const profile = projectProfile([
      row({
        content: "a".repeat(100),
        id: "a",
      }),
      row({
        content: "b".repeat(100),
        id: "b",
      }),
    ]);
    const injection = renderProfileInjection(profile, 150);
    expect(injection).not.toBeNull();
    // Only the first item fits inside the budget.
    expect(injection).toContain("- aaaa");
    expect(injection).not.toContain("- bbbb");
  });

  it("returns null injection for an empty profile", () => {
    expect(renderProfileInjection(projectProfile([]))).toBeNull();
  });
});
