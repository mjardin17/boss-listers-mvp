"use client";

import type {
  BossBrainSnapshot,
  BossKnowledgeRecord
} from "../lib/bossBrain";

function money(value: number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `$${parsed.toFixed(2)}` : "N/A";
}

function percent(value: number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${Math.round(parsed)}%` : "N/A";
}

function titleOf(item: BossKnowledgeRecord) {
  return item.productName || item.upc || "Unknown item";
}

function MiniRankList({
  title,
  items,
  metric
}: {
  title: string;
  items: BossKnowledgeRecord[];
  metric: (item: BossKnowledgeRecord) => string;
}) {
  if (!items.length) return null;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">{title}</p>
      <div className="mt-3 space-y-2">
        {items.slice(0, 3).map((item, index) => (
          <div key={`${title}-${item.upc || item.productName}-${index}`} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="line-clamp-1 text-xs font-semibold text-white">{titleOf(item)}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {item.brand || item.category || "Learning"}
              </p>
            </div>
            <span className="shrink-0 text-xs font-bold text-emerald-300">{metric(item)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BossBrainPanel({
  snapshot,
  currentMode = false
}: {
  snapshot: BossBrainSnapshot;
  currentMode?: boolean;
}) {
  const hasData = snapshot.scanHistory.length > 0 || snapshot.knowledge.length > 0;

  if (!hasData) {
    return (
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/20 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Boss Brain</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Learning starts after your first completed scan.
            </p>
          </div>
          <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs font-medium text-zinc-300">
            0 learned
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/20 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Boss Brain</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Local sourcing memory from completed scans.
          </p>
        </div>
        <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs font-medium text-zinc-300">
          {snapshot.knowledge.length} learned
        </span>
      </div>

      {snapshot.previousWinner ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-[10px] uppercase tracking-widest text-emerald-200">
            🔥 Previous Winner
          </p>
          <p className="mt-2 text-sm font-semibold text-white">{titleOf(snapshot.previousWinner)}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-emerald-500/20 bg-zinc-950/70 px-3 py-2">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">Average ROI</p>
              <p className="mt-1 text-sm font-bold text-emerald-300">{percent(snapshot.previousWinner.avgROI)}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-zinc-950/70 px-3 py-2">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">Average Profit</p>
              <p className="mt-1 text-sm font-bold text-emerald-300">{money(snapshot.previousWinner.avgProfit)}</p>
            </div>
          </div>
          {snapshot.analyst ? (
            <p className="mt-3 text-xs font-semibold leading-5 text-emerald-100">
              {snapshot.analyst.reasoning}
            </p>
          ) : null}
        </div>
      ) : currentMode && snapshot.analyst ? (
        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Local AI Analyst</p>
          <p className="mt-2 text-sm font-semibold text-zinc-200">{snapshot.analyst.reasoning}</p>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Today Profit</p>
          <p className="mt-1 text-sm font-bold text-emerald-300">
            {money(snapshot.insights.todaysProfitPotential)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Average ROI</p>
          <p className="mt-1 text-sm font-bold text-sky-300">{percent(snapshot.insights.averageROI)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Best Category</p>
          <p className="mt-1 line-clamp-1 text-sm font-bold text-white">{snapshot.insights.bestCategory}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Best Brand</p>
          <p className="mt-1 line-clamp-1 text-sm font-bold text-white">{snapshot.insights.bestBrand}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Best Store Aisle</p>
          <p className="mt-1 line-clamp-1 text-sm font-bold text-white">{snapshot.insights.bestStoreAisle}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Scans Saved</p>
          <p className="mt-1 text-sm font-bold text-white">{snapshot.scanHistory.length}</p>
        </div>
      </div>

      {snapshot.hotBuys.length ? (
        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Best Walmart Finds</p>
            <span className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] font-semibold text-zinc-300">
              Top {Math.min(20, snapshot.hotBuys.length)}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {snapshot.hotBuys.slice(0, 5).map((item, index) => (
              <div key={`${item.upc || item.productName}-${index}`} className="grid grid-cols-[auto_1fr_auto] gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2">
                <span className="text-xs font-black text-zinc-500">#{index + 1}</span>
                <div className="min-w-0">
                  <p className="line-clamp-1 text-xs font-semibold text-white">{titleOf(item)}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Seen {item.timesSeen} / Bought {item.timesPurchased}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-emerald-300">{money(item.avgProfit)}</p>
                  <p className="text-[11px] text-sky-300">{percent(item.avgROI)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <MiniRankList title="Top ROI Items" items={snapshot.topRoiItems} metric={(item) => percent(item.avgROI)} />
        <MiniRankList title="Top Profit Items" items={snapshot.topProfitItems} metric={(item) => money(item.avgProfit)} />
        <MiniRankList title="Frequently Scanned" items={snapshot.mostFrequentlyScannedItems} metric={(item) => `${item.timesSeen}x`} />
        <MiniRankList title="Frequently Purchased" items={snapshot.mostFrequentlyPurchasedItems} metric={(item) => `${item.timesPurchased}x`} />
      </div>
    </section>
  );
}
