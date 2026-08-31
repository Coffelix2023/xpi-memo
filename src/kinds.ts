export const MEMORY_KINDS = [
  "global_preference",
  "global_workflow",
  "project_gene",
  "project_constraint",
  "project_decision",
  "project_gotcha",
  "session_context",
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

export interface MemoryKindRoute {
  scope: "global" | "session";
  target: "global" | "project";
}

export const MEMORY_KIND_TABLE: Readonly<Record<MemoryKind, MemoryKindRoute>> = {
  global_preference: {
    scope: "global",
    target: "global",
  },
  global_workflow: {
    scope: "global",
    target: "global",
  },
  project_constraint: {
    scope: "global",
    target: "project",
  },
  project_decision: {
    scope: "global",
    target: "project",
  },
  project_gene: {
    scope: "global",
    target: "project",
  },
  project_gotcha: {
    scope: "global",
    target: "project",
  },
  session_context: {
    scope: "session",
    target: "project",
  },
};

export function isMemoryKind(value: string): value is MemoryKind {
  return (MEMORY_KINDS as readonly string[]).includes(value);
}
