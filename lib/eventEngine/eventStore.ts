import type { BossEvent } from "./eventTypes";

export interface EventStoreSnapshot {
  events: BossEvent[];
  latestByType: Record<string, BossEvent | undefined>;
}

export function createEventStore(events: BossEvent[] = []): EventStoreSnapshot {
  return {
    events,
    latestByType: events.reduce<Record<string, BossEvent | undefined>>((acc, event) => {
      acc[event.type] = event;
      return acc;
    }, {})
  };
}
