"use client";

import type { InventoryRecord } from "../../app/saas/schemas";

export function InventoryTicker({ inventory }: { inventory: InventoryRecord[] }) {
  const active = inventory.filter((item) => item.status !== "Sold").length;
  const sold = inventory.filter((item) => item.status === "Sold").length;
  const listed = inventory.filter((item) => item.status === "Active").length;
  return (
    <div className="grid grid-cols-3 gap-2 text-xs">
      <span className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-300">Active {active}</span>
      <span className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-300">Active {listed}</span>
      <span className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-300">Sold {sold}</span>
    </div>
  );
}
