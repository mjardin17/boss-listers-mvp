"use client";

import { useEffect, useState } from "react";
import { readUiSignals, subscribeUiSignals, type UiSignal } from "../../lib/realtime/uiSignalBus";

export function ScanEventStream() {
  const [events, setEvents] = useState<UiSignal[]>([]);
  useEffect(() => {
    setEvents(readUiSignals().filter((event) => event.type.startsWith("scan_")).slice(0, 8));
    return subscribeUiSignals((signal) => {
      if (!signal.type.startsWith("scan_")) return;
      setEvents((current) => [signal, ...current].slice(0, 8));
    });
  }, []);
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-sky-300">Scan Event Stream</h2>
      <div className="mt-3 space-y-2">
        {events.map((event) => (
          <p key={event.id} className="rounded-md bg-zinc-950 px-3 py-2 text-xs text-zinc-300">{event.label}</p>
        ))}
        {!events.length ? <p className="text-sm text-zinc-500">Scan stages stream here during capture.</p> : null}
      </div>
    </section>
  );
}
