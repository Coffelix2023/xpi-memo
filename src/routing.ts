import { GLOBAL_BANK, type RoutingContext } from "./banks.js";
import { MEMORY_KIND_TABLE, type MemoryKind, type MemoryScope } from "./kinds.js";

export interface RoutingDecision {
  bank: string;
  kind: MemoryKind;
  /** Canonical semantic scope (task 1.2): global / project / session. */
  scope: MemoryScope;
}

/**
 * Structured routing rejection (task 2.2). Carries a bounded reason code plus
 * actionable guidance for the user-facing surface, instead of a generic error
 * that callers collapse into "Memory write failed.".
 */
export class RoutingRejectionError extends Error {
  constructor(
    public readonly reason: "project-identity-required" | "invalid-scope",
    /** Canonical semantic scope of the rejected kind (project / session). */
    public readonly scope: "project" | "session",
    guidance: string,
  ) {
    super(guidance);
    this.name = "RoutingRejectionError";
  }
}

export function routeMemoryKind(
  kind: MemoryKind,
  context: RoutingContext,
): RoutingDecision {
  if (kind === "session_context") {
    // Decoupled from project identity (task 2.3): prefers the project bank
    // when one exists (bank isolation), otherwise the global bank — always
    // with session scope. Never throws for missing project identity.
    return {
      bank: context.projectBank ?? GLOBAL_BANK,
      kind,
      scope: "session",
    };
  }
  const route = MEMORY_KIND_TABLE[kind];
  if (route.target === "global") {
    return {
      bank: GLOBAL_BANK,
      kind,
      scope: route.scope,
    };
  }
  if (context.projectBank === null) {
    throw new RoutingRejectionError(
      "project-identity-required",
      "project",
      "This directory has no project identity. Run /xpi-memo-init to initialize a non-Git project, or switch to a Git repository.",
    );
  }
  return {
    bank: context.projectBank,
    kind,
    scope: route.scope,
  };
}
