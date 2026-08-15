import type { NormalizedListing } from "./types";

function getConfidenceDisplay(confidenceScore = 0) {
  const value = Math.max(0, Math.min(100, Math.round(Number(confidenceScore) || 0)));
  if (value >= 75) {
    return {
      value,
      label: "High confidence",
      color: "bg-emerald-400 text-zinc-950",
      bar: "bg-emerald-400",
      note: ""
    };
  }
  if (value >= 50) {
    return {
      value,
      label: "Medium confidence",
      color: "bg-yellow-300 text-zinc-950",
      bar: "bg-yellow-300",
      note: ""
    };
  }
  return {
    value,
    label: "Low confidence",
    color: "bg-red-500 text-white",
    bar: "bg-red-500",
    note: "Manual verification recommended"
  };
}

function getRiskBadgeClass(label = "") {
  if (label === "Low Risk") return "bg-emerald-400 text-zinc-950";
  if (label === "Medium Risk") return "bg-yellow-300 text-zinc-950";
  return "bg-red-500 text-white";
}

function getEligibilityClass(status = "") {
  if (status === "Allowed") return "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30";
  if (status === "Approval Needed") return "bg-amber-400/15 text-amber-300 ring-amber-400/30";
  if (status === "Restricted") return "bg-orange-400/15 text-orange-300 ring-orange-400/30";
  if (status === "Prohibited") return "bg-red-500/15 text-red-300 ring-red-500/30";
  return "bg-zinc-700/50 text-zinc-300 ring-zinc-600";
}

function sourceStoreLabel(value = "") {
  if (value === "WALMART") return "Walmart";
  if (value === "DOLLAR_TREE") return "Dollar Tree";
  if (value === "MANUAL") return "Manual Cost";
  return "";
}

function formatMatrixMoney(value: number | null | undefined) {
  return value == null || !Number.isFinite(Number(value)) ? "N/A" : `$${Number(value).toFixed(2)}`;
}

function getSourceStatusClass(status = "") {
  if (status === "BUY") return "bg-emerald-400 text-zinc-950";
  if (status === "HOLD") return "bg-amber-300 text-zinc-950";
  if (status === "SKIP") return "bg-red-500 text-white";
  return "bg-zinc-800 text-zinc-400";
}

function SourceProfitMatrix({ listing }: { listing: NormalizedListing }) {
  const rows = listing.sourceProfitMetrics || [];
  if (!rows.length) return null;

  return (
    <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <p className="text-[10px] uppercase tracking-normal text-zinc-500">Source Profit Matrix</p>
      <div className="mt-3 grid gap-2">
        {rows.map((row) => (
          <div key={row.sourceId} className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-zinc-800 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{row.sourceName}</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                Cost {formatMatrixMoney(row.costBasis)} · Profit {formatMatrixMoney(row.netProfit)}
              </p>
            </div>
            <div className="text-right">
              <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${getSourceStatusClass(row.status)}`}>
                {row.status}
              </span>
              <p className="mt-1 text-[11px] font-semibold text-zinc-300">
                {row.returnOnInvestment == null ? "N/A" : `${Math.round(row.returnOnInvestment)}%`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfitSummaryCard({ listing }: { listing: NormalizedListing }) {
  const profitLabel =
    listing.profitPotential == null ? "Unavailable" : `$${listing.profitPotential.toFixed(2)}`;
  const averageSaleLabel =
    listing.averageSalePrice == null ? "Unavailable" : `$${listing.averageSalePrice.toFixed(2)}`;
  return (
    <section className="rounded-lg border border-emerald-400/30 bg-zinc-950 p-5 shadow-2xl shadow-emerald-950/30">
      <p className="text-sm font-medium text-zinc-400">Profit potential</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <strong className="text-4xl font-bold tracking-normal text-emerald-300">
          {profitLabel}
        </strong>
        <div className="rounded-md bg-emerald-400 px-3 py-2 text-right text-zinc-950">
          <span className="block text-xs font-semibold uppercase tracking-normal">
            Sell-through
          </span>
          <strong className="block text-xl font-bold tracking-normal">
            {listing.sellThroughRate}
          </strong>
        </div>
      </div>
      <p className="mt-4 text-sm text-zinc-400">
        Average sale price:{" "}
        <span className="font-semibold text-zinc-100">
          {averageSaleLabel}
        </span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
        {sourceStoreLabel(listing.sourceStoreType) ? (
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-200">
            {sourceStoreLabel(listing.sourceStoreType)}
          </span>
        ) : null}
        {listing.resolvedCostBasis != null ? (
          <span className="rounded-md border border-zinc-800 px-2 py-1 text-zinc-300">
            Cost ${listing.resolvedCostBasis.toFixed(2)}
          </span>
        ) : null}
        {listing.lookupSource ? (
          <span className="rounded-md border border-zinc-800 px-2 py-1 text-zinc-300">
            Lookup {listing.lookupSource}
          </span>
        ) : null}
        <span className="rounded-md border border-zinc-800 px-2 py-1 text-zinc-300">
          Resale {listing.resaleAuthoritySource || "eBay SOLD comps"}
        </span>
      </div>
      <SourceProfitMatrix listing={listing} />
    </section>
  );
}

export function MarketIntelligenceCard({ listing }: { listing: NormalizedListing }) {
  const confidence = getConfidenceDisplay(listing.confidenceScore);
  const marketConfidence = getConfidenceDisplay(listing.marketConfidence?.value);
  const analytics = listing.sourcingAnalytics;

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-sm font-medium text-zinc-400">Market intelligence</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-amber-300 px-3 py-1 text-sm font-bold text-zinc-950">
          {listing.demandLevel}
        </span>
        <span className="text-sm text-zinc-400">Demand level</span>
      </div>
      <div className="mt-5 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium uppercase tracking-normal text-zinc-400">
            AI Confidence
          </span>
          <span className={`rounded-md px-3 py-1 text-sm font-bold ${confidence.color}`}>
            {confidence.value}%
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full rounded-full ${confidence.bar}`}
            style={{ width: `${confidence.value}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-zinc-300">{confidence.label}</p>
        {confidence.note ? (
          <p className="mt-2 text-sm font-semibold text-red-300">{confidence.note}</p>
        ) : null}
      </div>
      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium uppercase tracking-normal text-zinc-400">
            Market Confidence
          </span>
          <span className={`rounded-md px-3 py-1 text-sm font-bold ${marketConfidence.color}`}>
            {marketConfidence.value}%
          </span>
        </div>
        <p className="mt-3 text-sm text-zinc-300">
          {listing.marketConfidence?.label || marketConfidence.label}
        </p>
        {listing.recommendedMarketplace?.platform ? (
          <p className="mt-2 text-sm text-zinc-400">
            Recommended:{" "}
            <span className="font-semibold text-zinc-100">
              {listing.recommendedMarketplace.platform}
            </span>
          </p>
        ) : null}
        {listing.upc ? (
          <p className="mt-2 break-all text-xs text-zinc-500">UPC: {listing.upc}</p>
        ) : null}
      </div>
      {listing.marketplaceEligibility ? (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium uppercase tracking-normal text-zinc-400">
              Marketplace Eligibility
            </span>
            <span className="rounded-md bg-zinc-800 px-3 py-1 text-xs font-bold text-zinc-300">
              MVP rules
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {listing.marketplaceEligibility.platforms.map((item) => (
              <div key={item.platform} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-100">{item.platform}</p>
                  <span className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${getEligibilityClass(item.status)}`}>
                    {item.status}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{item.reason}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="font-semibold text-emerald-300">Best Platforms To List</p>
              <p className="mt-1 text-zinc-400">
                {listing.marketplaceEligibility.bestPlatformsToList.join(", ") || "None yet"}
              </p>
            </div>
            <div>
              <p className="font-semibold text-amber-300">Approval Needed</p>
              <p className="mt-1 text-zinc-400">
                {listing.marketplaceEligibility.approvalNeeded.join(", ") || "None flagged"}
              </p>
            </div>
            <div>
              <p className="font-semibold text-red-300">Avoid Listing On</p>
              <p className="mt-1 text-zinc-400">
                {listing.marketplaceEligibility.avoidListingOn.join(", ") || "None flagged"}
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {analytics ? (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium uppercase tracking-normal text-zinc-400">
              Sourcing Analytics
            </span>
            <span className={`rounded-md px-3 py-1 text-sm font-bold ${getRiskBadgeClass(analytics.riskLevel.label)}`}>
              {analytics.riskLevel.label}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
                <p className="text-xs text-zinc-500">ROI</p>
                <p className="mt-1 font-semibold text-emerald-300">
                  {Number.isFinite(Number(analytics.roiPercentage)) && Number(analytics.roiPercentage) !== 0
                    ? `${Math.round(Number(analytics.roiPercentage))}%`
                    : "Est."}
                </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Monthly sales</p>
              <p className="mt-1 font-semibold text-zinc-100">
                {Math.max(0, Math.round(Number(analytics.estimatedMonthlySales) || 0))}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Best buy</p>
              <p className="mt-1 font-semibold text-sky-300">
                ${Math.max(0, Number(analytics.bestBuyPrice) || 0).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Collector</p>
              <p className="mt-1 font-semibold text-amber-300">
                {analytics.collectorScore.score}/100
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Difficulty</p>
              <p className="mt-1 font-semibold text-zinc-100">
                {analytics.retailArbitrageDifficulty.label}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Trend</p>
              <p className="mt-1 font-semibold text-zinc-100">{analytics.trendSignal}</p>
            </div>
          </div>
        </div>
      ) : null}
      <p className="mt-4 text-base leading-7 text-zinc-100">{listing.sourcingTip}</p>
    </section>
  );
}

export function CompsTable({ listing }: { listing: NormalizedListing }) {
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="border-b border-zinc-800 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-normal text-zinc-100">Recent comps</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
          <thead className="bg-zinc-950 text-zinc-400">
            <tr>
              <th className="px-5 py-3 font-medium">Platform</th>
              <th className="px-5 py-3 font-medium">Price</th>
              <th className="px-5 py-3 font-medium">Date sold</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 text-zinc-100">
            {listing.comps.length ? (
              listing.comps.map((comp) => (
                <tr key={`${comp.sourcePlatform}-${comp.dateSold}-${comp.price}`}>
                  <td className="whitespace-nowrap px-5 py-4">{comp.sourcePlatform}</td>
                  <td className="whitespace-nowrap px-5 py-4">${comp.price.toFixed(2)}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-zinc-400">{comp.dateSold}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-5 py-5 text-zinc-400" colSpan={3}>
                  No comparable sales returned yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
