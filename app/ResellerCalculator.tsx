"use client";

import { useMemo, useState } from "react";

type CalculatorListing = {
  averageSalePrice: number | null;
};

const MARKETPLACES = [
  { key: "ebay", label: "eBay", feeRate: 0.13, fixedFee: 0 },
  { key: "amazon", label: "Amazon", feeRate: 0.15, fixedFee: 0.99 },
  { key: "walmart", label: "Walmart Marketplace", feeRate: 0.15, fixedFee: 0 },
  { key: "facebook", label: "Facebook Marketplace", feeRate: 0.05, fixedFee: 0.4 },
  { key: "mercari", label: "Mercari", feeRate: 0.129, fixedFee: 0.5 }
] as const;

type MarketplaceKey = (typeof MARKETPLACES)[number]["key"];

function money(value: number | null) {
  return value == null || !Number.isFinite(value) ? "Unavailable" : `$${value.toFixed(2)}`;
}

function parseCurrency(value: string) {
  const parsed = Number.parseFloat(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeMarketplace(value: string | undefined): MarketplaceKey {
  return MARKETPLACES.some((candidate) => candidate.key === value)
    ? (value as MarketplaceKey)
    : "ebay";
}

export function ResellerCalculator({
  listing,
  initialMarketplace = "ebay",
  initialCostPaid = "0.00",
  initialShippingEstimate = "6.00",
  initialPackagingCost = "1.25"
}: {
  listing: CalculatorListing;
  initialMarketplace?: string;
  initialCostPaid?: string;
  initialShippingEstimate?: string;
  initialPackagingCost?: string;
}) {
  const [marketplaceKey, setMarketplaceKey] = useState<MarketplaceKey>(() => normalizeMarketplace(initialMarketplace));
  const [salePrice, setSalePrice] = useState(() =>
    listing.averageSalePrice == null ? "" : listing.averageSalePrice.toFixed(2)
  );
  const [costPaid, setCostPaid] = useState(initialCostPaid || "0.00");
  const [shippingEstimate, setShippingEstimate] = useState(initialShippingEstimate || "6.00");
  const [packagingCost, setPackagingCost] = useState(initialPackagingCost || "1.25");

  const math = useMemo(() => {
    const marketplace =
      MARKETPLACES.find((candidate) => candidate.key === marketplaceKey) ||
      MARKETPLACES[0];
    const sale = parseCurrency(salePrice);
    const cost = parseCurrency(costPaid);
    const shipping = parseCurrency(shippingEstimate);
    const packaging = parseCurrency(packagingCost);
    const platformFees = sale > 0 ? sale * marketplace.feeRate + marketplace.fixedFee : 0;
    const netProfit = sale - platformFees - shipping - packaging - cost;
    const roi = cost > 0 ? (netProfit / cost) * 100 : 0;
    const margin = sale > 0 ? (netProfit / sale) * 100 : 0;
    const breakEvenSalePrice =
      (cost + shipping + packaging + marketplace.fixedFee) / (1 - marketplace.feeRate);

    return {
      breakEvenSalePrice: Math.max(0, breakEvenSalePrice),
      cost,
      feeRate: marketplace.feeRate,
      fixedFee: marketplace.fixedFee,
      margin,
      marketplace,
      packaging,
      platformFees,
      roi,
      sale,
      shipping,
      netProfit
    };
  }, [costPaid, marketplaceKey, packagingCost, salePrice, shippingEstimate]);

  const netColor =
    math.netProfit >= 20
      ? "text-emerald-300"
      : math.netProfit >= 0
        ? "text-amber-300"
        : "text-rose-300";

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/20 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-100">Reseller Calculator</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Estimate fees, shipping, profit, ROI, and break-even before you buy.
          </p>
        </div>
        <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
          {math.marketplace.label}
        </span>
      </div>

      <label className="mt-5 block">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          Marketplace
        </span>
        <select
          value={marketplaceKey}
          onChange={(event) => setMarketplaceKey(event.target.value as MarketplaceKey)}
          className="mt-2 min-h-12 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 text-base font-semibold text-white outline-none transition focus:border-emerald-400"
        >
          {MARKETPLACES.map((marketplace) => (
            <option key={marketplace.key} value={marketplace.key}>
              {marketplace.label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            Sale Price
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={salePrice}
            onChange={(event) => setSalePrice(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 text-base font-semibold text-white outline-none transition focus:border-emerald-400"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            Cost Paid
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={costPaid}
            onChange={(event) => setCostPaid(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 text-base font-semibold text-white outline-none transition focus:border-emerald-400"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            Shipping
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={shippingEstimate}
            onChange={(event) => setShippingEstimate(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 text-base font-semibold text-white outline-none transition focus:border-emerald-400"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            Packaging
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={packagingCost}
            onChange={(event) => setPackagingCost(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 text-base font-semibold text-white outline-none transition focus:border-emerald-400"
          />
        </label>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Fees</p>
          <p className="mt-2 text-lg font-semibold text-zinc-100">
            {money(math.platformFees)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {(math.feeRate * 100).toFixed(2).replace(/\.?0+$/, "")}% +{" "}
            {money(math.fixedFee)}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Net Profit</p>
          <p className={`mt-2 text-lg font-semibold ${netColor}`}>{money(math.netProfit)}</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">ROI</p>
          <p className="mt-2 text-lg font-semibold text-sky-300">
            {math.cost > 0 ? `${math.roi.toFixed(0)}%` : "Est."}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Margin {math.sale > 0 ? `${math.margin.toFixed(0)}%` : "N/A"}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Break-Even</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {money(math.breakEvenSalePrice)}
          </p>
        </div>
      </div>
    </section>
  );
}
