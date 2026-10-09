"use client";

import type { ScanRecord } from "../../app/saas/schemas";
import { profitOf } from "../dashboard/workflow";

export function ProfitHeatmap({ scans }: { scans: ScanRecord[] }) {
  const cells = scans.slice(0, 24);
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-300">Profit Heatmap</h2>
      <div className="mt-3 grid grid-cols-8 gap-1">
        {cells.map((scan) => {
          const profit = profitOf(scan.listing) || 0;
          const color = profit >= 20 ? "bg-emerald-400" : profit >= 8 ? "bg-amber-300" : profit > 0 ? "bg-sky-400" : "bg-zinc-800";
          return <span key={scan.id} className={`h-6 rounded ${color}`} title={`${scan.listing.itemTitle}: $${profit.toFixed(2)}`} />;
        })}
        {!cells.length ? <span className="col-span-8 text-sm text-zinc-500">Heatmap populates from scan history.</span> : null}
      </div>
    </section>
  );
}
