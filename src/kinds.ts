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

export type MemoryRole = "standing" | "contextual";
export type MemoryScope = "global" | "project" | "session";

export interface MemoryKindRoute {
  /** Canonical semantic scope: global / project / session (task 1.2). */
  scope: MemoryScope;
  /** Physical bank target: the default global bank or the project bank. */
  target: "global" | "project";
}

export interface MemoryKindDescription {
  label: string;
  role: MemoryRole;
  route: MemoryKindRoute;
  scope: MemoryScope;
  sectionTitle: string;
  trustState: string;
}

/** The only user-facing taxonomy for T1 memory kinds. */
export const MEMORY_KIND_TAXONOMY: Readonly<Record<MemoryKind, MemoryKindDescription>> =
  {
    global_preference: {
      label: "Preference",
      role: "standing",
      scope: "global",
      sectionTitle: "Preferences",
      trustState: "User-confirmed",
      route: {
        scope: "global",
        target: "global",
      },
    },
    global_workflow: {
      label: "Workflow",
      role: "standing",
      scope: "global",
      sectionTitle: "Workflows",
      trustState: "User-confirmed",
      route: {
        scope: "global",
        target: "global",
      },
    },
    project_constraint: {
      label: "Constraint",
      role: "standing",
      scope: "project",
      sectionTitle: "Constraints",
      trustState: "Review required",
      route: {
        scope: "project",
        target: "project",
      },
    },
    project_decision: {
      label: "Decision",
      role: "contextual",
      scope: "project",
      sectionTitle: "Decisions",
      trustState: "Review required",
      route: {
        scope: "project",
        target: "project",
      },
    },
    project_gene: {
      label: "Repository fact",
      role: "standing",
      scope: "project",
      sectionTitle: "Repository Facts",
      trustState: "Verified evidence",
      route: {
        scope: "project",
        target: "project",
      },
    },
    project_gotcha: {
      label: "Gotcha",
      role: "contextual",
      scope: "project",
      sectionTitle: "Gotchas",
      trustState: "Review required",
      route: {
        scope: "project",
        target: "project",
      },
    },
    session_context: {
      label: "Session context",
      role: "contextual",
      scope: "session",
      sectionTitle: "Session Context",
      trustState: "Session-only",
      route: {
        scope: "session",
        // Session context is decoupled from project identity (task 2.3):
        // the physical global bank holds it with session scope; routing no
        // longer requires a project bank.
        target: "global",
      },
    },
  };

/** Compatibility routing view derived from the canonical taxonomy. */
export const MEMORY_KIND_TABLE: Readonly<Record<MemoryKind, MemoryKindRoute>> =
  Object.fromEntries(
    MEMORY_KINDS.map((kind) => [
      kind,
      MEMORY_KIND_TAXONOMY[kind].route,
    ]),
  ) as Record<MemoryKind, MemoryKindRoute>;

export function isMemoryKind(value: string): value is MemoryKind {
  return (MEMORY_KINDS as readonly string[]).includes(value);
}

export function describeMemoryKind(kind: MemoryKind): MemoryKindDescription {
  return MEMORY_KIND_TAXONOMY[kind];
}

export function describeMemoryKindOrNull(
  kind: string | undefined,
): MemoryKindDescription | null {
  return kind && isMemoryKind(kind) ? describeMemoryKind(kind) : null;
}
