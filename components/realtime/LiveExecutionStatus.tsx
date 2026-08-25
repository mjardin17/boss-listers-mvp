"use client";

import { buildLiveSyncState } from "../../lib/realtime/liveSyncEngine";
import type { UiSignal } from "../../lib/realtime/uiSignalBus";
import type { ExecutionQueueItem } from "../dashboard/workflow";

export function LiveExecutionStatus({ queue, events }: { queue: ExecutionQueueItem[]; events: UiSignal[] }) {
  const state = buildLiveSyncState({
    queueCount: queue.length,
    pendingCount: queue.filter((item) => item.status === "PENDING" || item.status === "PROCESSING").length,
    failedCount: queue.filter((item) => item.status === "FAILED").length,
    events
  });
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100">Live Execution Status</h2>
      <p className="mt-2 text-2xl font-black text-white">{state.status}</p>
      <p className="mt-1 text-xs text-zinc-500">{state.queueCount} queued / {state.pendingCount} pending / {state.failedCount} failed</p>
    </section>
  );
}
