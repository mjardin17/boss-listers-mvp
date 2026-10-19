"use client";

import { useEffect, useState } from "react";
import { buildEventStreamSnapshot } from "../../lib/realtime/eventStream";
import { readUiSignals, subscribeUiSignals, type UiSignal } from "../../lib/realtime/uiSignalBus";

const tone = {
  info: "border-sky-500/20 text-sky-200",
  success: "border-emerald-500/20 text-emerald-200",
  warning: "border-amber-500/20 text-amber-200",
  danger: "border-red-500/20 text-red-200"
};

export function LiveActivityFeed() {
  const [events, setEvents] = useState<UiSignal[]>([]);

  useEffect(() => {
    setEvents(readUiSignals());
    return subscribeUiSignals((signal) => setEvents((current) => [signal, ...current].slice(0, 30)));
  }, []);

  const snapshot = buildEventStreamSnapshot(events);
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/90 p-4 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100">Live Activity</h2>
        <span className="rounded-md bg-zinc-950 px-2 py-1 text-xs text-zinc-400">{snapshot.events.length}</span>
      </div>
      <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
        {snapshot.events.map((event) => (
          <div key={event.id} className={`rounded-md border bg-zinc-950 px-3 py-2 ${tone[event.severity || "info"]}`}>
            <p className="text-xs font-bold">{event.label}</p>
            {event.detail ? <p className="mt-1 text-[11px] text-zinc-400">{event.detail}</p> : null}
          </div>
        ))}
        {!snapshot.events.length ? <p className="text-sm text-zinc-500">Realtime events appear as scans and approvals happen.</p> : null}
      </div>
    </section>
  );
}
