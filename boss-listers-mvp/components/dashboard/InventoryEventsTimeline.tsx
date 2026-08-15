"use client";

import type { InventoryRecord } from "../../app/saas/schemas";

type InventoryEventName =
  | "Item Created"
  | "Item Edited"
  | "Publish Requested"
  | "Publish Success"
  | "Publish Failed"
  | "Sold"
  | "Delist Requested";

type InventoryEvent = {
  id: string;
  itemTitle: string;
  name: InventoryEventName;
  timestamp: string;
  detail: string;
};

function eventNameFromLog(log: string): InventoryEventName | null {
  const normalized = log.toLowerCase();
  if (normalized.includes("publish requested")) return "Publish Requested";
  if (normalized.includes("publish success")) return "Publish Success";
  if (normalized.includes("publish failed")) return "Publish Failed";
  if (normalized.includes("sold")) return "Sold";
  if (normalized.includes("delist requested")) return "Delist Requested";
  if (normalized.includes("edited")) return "Item Edited";
  if (normalized.includes("created")) return "Item Created";
  return null;
}

function buildEvents(items: InventoryRecord[]): InventoryEvent[] {
  return items.flatMap((item) => {
    const baseEvents: InventoryEvent[] = [
      {
        id: `${item.id}-created`,
        itemTitle: item.title,
        name: "Item Created",
        timestamp: item.createdAt,
        detail: item.sku
      }
    ];

    if (item.updatedAt !== item.createdAt) {
      baseEvents.push({
        id: `${item.id}-edited`,
        itemTitle: item.title,
        name: "Item Edited",
        timestamp: item.updatedAt,
        detail: item.sku
      });
    }

    if (item.soldStatus === "Sold" || item.status === "Sold") {
      baseEvents.push({
        id: `${item.id}-sold`,
        itemTitle: item.title,
        name: "Sold",
        timestamp: item.updatedAt,
        detail: item.soldPrice > 0 ? `$${item.soldPrice.toFixed(2)}` : item.sku
      });
    }

    item.eventLogs.forEach((log, index) => {
      const name = eventNameFromLog(log);
      if (!name) return;
      baseEvents.push({
        id: `${item.id}-log-${index}`,
        itemTitle: item.title,
        name,
        timestamp: item.updatedAt,
        detail: log
      });
    });

    return baseEvents;
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function InventoryEventsTimeline({ inventory }: { inventory: InventoryRecord[] }) {
  const events = buildEvents(inventory).slice(0, 20);

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100">Inventory Events Timeline</h2>
      <div className="mt-4 space-y-3">
        {events.map((event) => (
          <article key={event.id} className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">{event.name}</p>
                <p className="mt-1 truncate text-xs text-zinc-400">{event.itemTitle}</p>
              </div>
              <time className="text-xs text-zinc-500">{new Date(event.timestamp).toLocaleString()}</time>
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-zinc-500">{event.detail}</p>
          </article>
        ))}
        {!events.length ? <p className="text-sm text-zinc-500">No inventory events yet.</p> : null}
      </div>
    </section>
  );
}
