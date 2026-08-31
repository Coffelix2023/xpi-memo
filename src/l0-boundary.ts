export interface L0Boundary {
  concreteRuntimeRequired: false;
  derivationUsesLLM: false;
  ownsRawEvents: true;
  persistsRawEventsInT1: false;
  selectableAsMemoryEngine: false;
  status: "external-session-trace";
}

export function describeL0Boundary(): L0Boundary {
  return {
    concreteRuntimeRequired: false,
    derivationUsesLLM: false,
    ownsRawEvents: true,
    persistsRawEventsInT1: false,
    selectableAsMemoryEngine: false,
    status: "external-session-trace",
  };
}
