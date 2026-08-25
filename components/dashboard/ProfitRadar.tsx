"use client";

import type { ScanRecord } from "../../app/saas/schemas";
import { listingTitle, money, profitOf } from "./workflow";

export function ProfitRadar({ scans }: { scans: ScanRecord[] }) {
  const ranked = [...scans].sort((a, b) => (profitOf(b.listing) || 0) - (profitOf(a.listing) || 0)).slice(0, 6);
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-300">Profit Radar</h2>
      <div className="mt-3 space-y-2">
        {ranked.map((scan) => (
          <div key={scan.id} className="flex items-center justify-between gap-3 rounded-md bg-zinc-950 p-3">
            <p className="line-clamp-1 text-sm font-semibold text-white">{listingTitle(scan.listing)}</p>
            <span className="text-sm font-black text-emerald-300">{money(profitOf(scan.listing))}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
