import { Text } from "@earendil-works/pi-tui";

export interface ToolLineDetails {
  bank?: string;
  kind?: string;
  reason?: string;
  resultCount?: number;
  status?: string;
}

/** `durationMs` comes from Pi 1.1+'s render context; absent while running or for old results. */
export function toolLine(
  details: ToolLineDetails | undefined,
  durationMs?: number,
): string {
  const line = toolLineText(details);
  return durationMs === undefined ? line : `${line} · ${formatDuration(durationMs)}`;
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function toolLineText(details: ToolLineDetails | undefined): string {
  if (!details) return "xpi-memo";
  const status = typeof details.status === "string" ? details.status : "unknown";
  if (status === "recalled")
    return `recalled ${typeof details.resultCount === "number" ? details.resultCount : 0}`;
  if (status === "stored")
    return `stored ${String(details.kind ?? "memory")} → ${String(details.bank ?? "default")}`;
  if (status === "rejected") return `rejected: ${String(details.reason ?? "unknown")}`;
  if (status === "routing_rejected")
    return `routing rejected: ${String(details.reason ?? "unknown")}`;
  if (status === "skipped") return `skipped: ${String(details.reason ?? "unknown")}`;
  if (status === "executed") return "sleep completed";
  if (status === "candidate") return `candidate ${String(details.kind ?? "memory")}`;
  return status;
}

export function renderToolLine(
  details: ToolLineDetails | undefined,
  theme: {
    fg(color: string, text: string): string;
  },
  durationMs?: number,
): Text {
  return new Text(theme.fg("muted", toolLine(details, durationMs)), 0, 0);
}

export function renderCallLine(
  name: string,
  theme: {
    fg(color: string, text: string): string;
  },
): Text {
  return new Text(theme.fg("dim", name), 0, 0);
}
