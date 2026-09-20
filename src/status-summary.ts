/**
 * The bounded status summary both surfaces render.
 *
 * Lives on its own so the terminal panel and the Glimpse window derive their
 * numbers from one place. `memory-observability` requires both surfaces to show
 * the same counts and labels for the same state; two copies of this function
 * would be free to drift apart, and nothing would catch it.
 */
function humanBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface StatusSummary {
  backend: string;
  disk: string;
  global: number | null;
  paused: boolean;
  pending: number;
  project: number | null;
  projectLabel: string | null;
  /** Empty-memory doctor state (NEVER_CALLED etc.) when reported. */
  recallZeroStreak?: {
    alert: boolean;
    count: number;
  };
  /** Pre-candidate routing rejection count (plan-note-03, visible in doctor). */
  routingRejections?: number;
  state?: string;
  today: number;
}

export function summarize(json: string): StatusSummary {
  try {
    const parsed = JSON.parse(json) as {
      counts?: {
        global?: number | null;
        project?: number | null;
      };
      currentProject?: {
        label?: string;
      } | null;
      doctor?: {
        evidence?: {
          routingRejections?: number;
        };
        recallZeroStreak?: {
          alert?: boolean;
          count?: number;
        };
        state?: string;
      };
      diskBytes?: number | null;
      paused?: boolean;
      pendingCandidates?: number;
      search?: {
        active?: string | null;
      };
      todayStored?: number;
    };
    const doctor = parsed.doctor;
    return {
      backend: parsed.search?.active ?? "auto",
      disk: humanBytes(parsed.diskBytes),
      global: parsed.counts?.global ?? null,
      paused: parsed.paused ?? false,
      pending: parsed.pendingCandidates ?? 0,
      project: parsed.counts?.project ?? null,
      projectLabel: parsed.currentProject?.label ?? null,
      recallZeroStreak: doctor?.recallZeroStreak
        ? {
            alert: doctor.recallZeroStreak.alert === true,
            count: doctor.recallZeroStreak.count ?? 0,
          }
        : undefined,
      routingRejections: doctor?.evidence?.routingRejections,
      state: doctor?.state,
      today: parsed.todayStored ?? 0,
    };
  } catch {
    return {
      backend: "auto",
      disk: "—",
      global: null,
      paused: false,
      pending: 0,
      project: null,
      projectLabel: null,
      today: 0,
    };
  }
}
