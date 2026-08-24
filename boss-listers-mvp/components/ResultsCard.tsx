"use client";

import { formatCurrency, formatPercent } from "../lib/calculations";
import type { DealAnalysis } from "../types/deal";

type ResultsCardProps = {
  analysis: DealAnalysis;
};

export function ResultsCard({ analysis }: ResultsCardProps) {
  const { comps, input, metrics } = analysis;
  const isBuy = metrics.decision === "BUY";

  return (
    <section className="rounded-[8px] border border-zinc-800 bg-zinc-900/95 p-4 shadow-2xl shadow-black/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{input.marketplace} analysis</p>
          <h2 className="mt-1 truncate text-xl font-bold text-white">{input.itemName || "Photo scan"}</h2>
        </div>
        <span
          className={`shrink-0 rounded-[8px] px-4 py-2 text-sm font-black ${
            isBuy ? "bg-emerald-400 text-zinc-950" : "bg-red-500 text-white"
          }`}
        >
          {metrics.decision}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="Profit" value={formatCurrency(metrics.profit)} intent={isBuy ? "good" : "bad"} />
        <Metric label="ROI" value={formatPercent(metrics.roi)} intent={isBuy ? "good" : "bad"} />
        <Metric label="Average sold" value={formatCurrency(metrics.soldPrice)} />
        <Metric label="Fee estimate" value={formatCurrency(metrics.marketplaceFee)} />
        <Metric label="Shipping cost" value={formatCurrency(metrics.shippingCost)} />
        <Metric label="Margin" value={formatPercent(metrics.margin)} />
      </div>

      <div className="mt-4 rounded-[8px] border border-zinc-800 bg-zinc-950 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">Sold Comp Summary</p>
          <span className="text-xs font-semibold text-zinc-400">{comps.sampleSales} sales sampled</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Summary label="Avg" value={formatCurrency(comps.averageSoldPrice)} />
          <Summary label="Sell-through" value={formatPercent(comps.sellThroughRate)} />
          <Summary label="Samples" value={String(comps.sampleSales)} />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, intent }: { label: string; value: string; intent?: "good" | "bad" }) {
  return (
    <div className="rounded-[8px] border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-lg font-black ${
          intent === "good" ? "text-emerald-300" : intent === "bad" ? "text-red-300" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-zinc-900 px-2 py-3">
      <p className="text-[11px] font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-zinc-100">{value}</p>
    </div>
  );
}
