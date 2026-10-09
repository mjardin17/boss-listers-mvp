"use client";

import type { InventoryRecord, ScanRecord } from "../../app/saas/schemas";
import { scoreRetailerOpportunity } from "../../lib/retailerIntel/retailerScoring";
import { listingTitle, profitOf } from "./workflow";

function storeKey(scan: ScanRecord) {
  return scan.listing.sourceStoreType || scan.listing.lookupSource || "Unknown";
}

export function StoreHeatmapPanel({ scans, inventory }: { scans: ScanRecord[]; inventory: InventoryRecord[] }) {
  const groups = Array.from(new Set(scans.map(storeKey))).map((store) => {
    const storeScans = scans.filter((scan) => storeKey(scan) === store);
    const profitable = storeScans.filter((scan) => (profitOf(scan.listing) || 0) > 0);
    const avgRoi =
      storeScans.reduce((sum, scan) => sum + Number(scan.listing.roiPercentage || 0), 0) / Math.max(1, storeScans.length);
    const confidence = Math.max(...storeScans.map((scan) => Number(scan.listing.confidenceScore || 0)), 0);
    const failed = storeScans.filter((scan) => /manual|risk|pass|skip/i.test(String(scan.listing.recommendation || ""))).length;
    const stale = inventory.filter((item) => storeKey({ ...item, timestamp: item.updatedAt, source: "history" } as any) === store && item.status !== "Sold").length;
    const retailer = scoreRetailerOpportunity({ sourceStoreType: store, title: storeScans[0]?.listing.itemTitle });
    return {
      store,
      scans: storeScans.length,
      profitable: profitable.length,
      avgRoi,
      confidence,
      failed,
      stale,
      retailer,
      top: profitable[0]?.listing
    };
  });

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-300">Store Heatmap Intelligence</h2>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {groups.map((group) => {
          const health = Math.max(0, Math.min(100, Math.round(group.retailer.sourcingScore + group.profitable * 5 - group.failed * 7 - group.stale * 3)));
          return (
            <article key={group.store} className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-white">{group.retailer.retailer?.name || group.store}</p>
                <span className="rounded-md bg-emerald-400 px-2 py-1 text-xs font-black text-zinc-950">{health}</span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-zinc-300">
                <span>Scans {group.scans}</span>
                <span>ROI {Math.round(group.avgRoi)}%</span>
                <span>Conf {group.confidence}%</span>
                <span>Fail {group.failed}</span>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Hot zones: {(group.retailer.retailer?.categoryStrengths || ["unknown"]).join(", ")}
              </p>
              {group.top ? <p className="mt-2 line-clamp-1 text-xs text-emerald-200">Top: {listingTitle(group.top)}</p> : null}
            </article>
          );
        })}
        {!groups.length ? <p className="text-sm text-zinc-500">Store heatmap populates after sourced scans.</p> : null}
      </div>
    </section>
  );
}
