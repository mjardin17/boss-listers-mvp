"use client";

import type { ScanRecord } from "../../app/saas/schemas";
import { listingTitle, money, profitOf, recommendationOf, velocityOf } from "./workflow";

export function OpportunityFeed({ scans, onQueue }: { scans: ScanRecord[]; onQueue: (scan: ScanRecord) => void }) {
  const opportunities = scans
    .filter((scan) => {
      const rec = recommendationOf(scan.listing);
      return ["BUY", "HOLD", "LONG_TAIL", "LONG-TAIL HOLD", "STRONG BUY"].includes(rec) || (profitOf(scan.listing) ?? 0) > 0;
    })
    .sort((a, b) => (profitOf(b.listing) || 0) - (profitOf(a.listing) || 0))
    .slice(0, 8);

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-300">Opportunity Feed</h2>
        <span className="rounded-md bg-zinc-950 px-2 py-1 text-xs text-zinc-300">{opportunities.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {opportunities.map((scan) => (
          <article key={scan.id} className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-semibold text-white">{listingTitle(scan.listing)}</p>
                <p className="mt-1 text-xs text-zinc-400">
                  {recommendationOf(scan.listing)} / {money(profitOf(scan.listing))} / {velocityOf(scan.listing)}
                </p>
              </div>
              <button onClick={() => onQueue(scan)} className="rounded-md bg-emerald-400 px-3 py-2 text-xs font-black text-zinc-950">
                Review
              </button>
            </div>
          </article>
        ))}
        {!opportunities.length ? <p className="text-sm text-zinc-500">No active sourcing opportunities.</p> : null}
      </div>
    </section>
  );
}
