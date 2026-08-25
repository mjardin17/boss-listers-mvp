import type { UiSignal } from "./uiSignalBus";

export type EventStreamSnapshot = {
  generatedAt: string;
  events: UiSignal[];
  counts: Record<string, number>;
};

export function buildEventStreamSnapshot(events: UiSignal[] = []): EventStreamSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    events: events.slice(0, 80),
    counts: events.reduce<Record<string, number>>((counts, event) => {
      counts[event.type] = (counts[event.type] || 0) + 1;
      return counts;
    }, {})
  };
}
