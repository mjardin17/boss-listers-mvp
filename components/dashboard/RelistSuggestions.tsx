"use client";

import type { InventoryRecord } from "../../app/saas/schemas";
import { listingTitle, queueFromInventory, staleInventory, type ExecutionQueueItem } from "./workflow";

export function RelistSuggestions({ inventory, onQueue }: { inventory: InventoryRecord[]; onQueue: (item: ExecutionQueueItem) => void }) {
  const stale = staleInventory(inventory).slice(0, 8);
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-amber-300">Relist Suggestions</h2>
      <div className="mt-3 space-y-2">
        {stale.map((item) => (
          <article key={item.id} className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
            <p className="line-clamp-1 text-sm font-semibold text-white">{listingTitle(item.listing)}</p>
            <p className="mt-1 text-xs text-zinc-500">{item.status} / markdown or relist review</p>
            <button onClick={() => onQueue(queueFromInventory(item, "RELIST"))} className="mt-3 rounded-md border border-amber-400/40 px-3 py-2 text-xs font-bold text-amber-100">
              Queue relist review
            </button>
          </article>
        ))}
        {!stale.length ? <p className="text-sm text-zinc-500">No stale inventory detected.</p> : null}
      </div>
    </section>
  );
}
