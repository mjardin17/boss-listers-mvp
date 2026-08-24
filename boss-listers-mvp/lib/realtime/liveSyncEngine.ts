import type { UiSignal } from "./uiSignalBus";

export function buildLiveSyncState({
  queueCount = 0,
  pendingCount = 0,
  failedCount = 0,
  events = []
}: {
  queueCount?: number;
  pendingCount?: number;
  failedCount?: number;
  events?: UiSignal[];
}) {
  return {
    queueCount,
    pendingCount,
    failedCount,
    status: failedCount > 0 ? "ATTENTION" : pendingCount > 0 ? "SYNCING" : "STABLE",
    latestSignal: events[0] || null
  };
}
