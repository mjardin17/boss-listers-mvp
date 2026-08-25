import type { UiSignal } from "./uiSignalBus";

export function summarizeRealtimeTelemetry(events: UiSignal[] = []) {
  const recent = events.slice(0, 25);
  return {
    eventCount: events.length,
    warningCount: recent.filter((event) => event.severity === "warning" || event.severity === "danger").length,
    opportunityCount: recent.filter((event) => event.type === "opportunity_detected").length,
    riskCount: recent.filter((event) => event.type === "risk_detected").length,
    lastEventAt: recent[0]?.createdAt || null
  };
}
