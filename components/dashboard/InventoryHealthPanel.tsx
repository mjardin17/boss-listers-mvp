"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { InventoryRecord } from "../../app/saas/schemas";
import { buildListingVideoDraft } from "../../lib/video-studio/draft";
import { inventoryItemToVideoSource } from "../../integration/listingAdapter";
import { PlatformStatusBadges } from "./PlatformStatusBadges";
import { listingTitle, money, staleInventory } from "./workflow";

export function InventoryHealthPanel({ inventory }: { inventory: InventoryRecord[] }) {
  const router = useRouter();
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const stale = staleInventory(inventory);
  const active = inventory.filter((item) => item.status !== "Sold");
  const value = active.reduce((sum, item) => sum + Number(item.listing.averageSalePrice || 0), 0);

  async function createVideo(item: InventoryRecord) {
    setCreatingId(item.id);
    try {
      const source = inventoryItemToVideoSource(item);
      const draft = buildListingVideoDraft(source);

      const response = await fetch("/api/video-studio/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      });

      const data = await response.json();
      if (!response.ok) {
        alert(data.error || "Could not create video draft");
        return;
      }

      router.push(`/video-studio?project=${data.project.id}`);
    } catch (error: any) {
      alert(error?.message || "Could not create video draft");
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-sky-300">Inventory Health</h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-md bg-zinc-950 p-3"><p className="text-xs text-zinc-500">Active</p><p className="font-black text-white">{active.length}</p></div>
        <div className="rounded-md bg-zinc-950 p-3"><p className="text-xs text-zinc-500">Stale</p><p className="font-black text-amber-300">{stale.length}</p></div>
        <div className="rounded-md bg-zinc-950 p-3"><p className="text-xs text-zinc-500">Value</p><p className="font-black text-emerald-300">{money(value)}</p></div>
      </div>
      <div className="mt-3 space-y-2">
        {inventory.slice(0, 12).map((item) => (
          <div key={item.id} className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
            <p className="line-clamp-1 text-sm font-semibold text-white">{listingTitle(item.listing)}</p>
            <p className="mt-1 text-xs text-zinc-500">{item.status} / Updated {new Date(item.updatedAt).toLocaleDateString()}</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <PlatformStatusBadges item={item} />
              <button
                onClick={() => createVideo(item)}
                disabled={creatingId === item.id}
                className="shrink-0 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {creatingId === item.id ? "Creating…" : "Create Video"}
              </button>
            </div>
          </div>
        ))}
        {!inventory.length ? <p className="text-sm text-zinc-500">No inventory items yet.</p> : null}
      </div>
    </section>
  );
}
