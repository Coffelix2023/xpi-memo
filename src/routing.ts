import { GLOBAL_BANK, type RoutingContext } from "./banks.js";
import { MEMORY_KIND_TABLE, type MemoryKind } from "./kinds.js";

export interface RoutingDecision {
  bank: string;
  kind: MemoryKind;
  scope: "global" | "session";
}

export function routeMemoryKind(
  kind: MemoryKind,
  context: RoutingContext,
): RoutingDecision {
  const route = MEMORY_KIND_TABLE[kind];
  if (route.target === "global") {
    return {
      bank: GLOBAL_BANK,
      kind,
      scope: route.scope,
    };
  }
  if (context.projectBank === null) {
    throw new Error("Project memory requires a recognized Git project");
  }
  return {
    bank: context.projectBank,
    kind,
    scope: route.scope,
  };
}
