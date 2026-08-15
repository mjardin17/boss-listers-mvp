import type { BossEvent, BossEventType } from "./eventTypes";

export type EventHandler = (event: BossEvent) => BossEvent[];

export function dispatchEvents(initialEvents: BossEvent[], handlers: Partial<Record<BossEventType, EventHandler>>) {
  const emitted: BossEvent[] = [];
  const queue = [...initialEvents];
  while (queue.length) {
    const event = queue.shift();
    if (!event) continue;
    emitted.push(event);
    const next = handlers[event.type]?.(event) || [];
    queue.push(...next);
  }
  return emitted;
}
