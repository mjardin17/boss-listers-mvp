"use client";

import { useEffect, useRef, useState } from "react";
import type { NormalizedListing, ProductCandidate } from "./types";
import {
  getDecisionEngine,
  getResultTrustSignals,
  getSalesVelocitySignal
} from "../lib/resultTrustService";
export type { NormalizedListing } from "./types";

const SCAN_HISTORY_COLLECTION = "boss-listers.scanHistory.v1";
const PRODUCT_CORRECTIONS_COLLECTION = "boss-listers.productCorrections.v1";

function getProfitColor(profitPotential: number | null | undefined) {
  if (profitPotential == null || !Number.isFinite(Number(profitPotential))) return "text-zinc-400";
  if (profitPotential >= 30) return "text-emerald-400";
  if (profitPotential >= 10) return "text-amber-400";
  return "text-rose-400";
}
function getProfitIndicator(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) {
    return {
      card: "border-zinc-800 bg-zinc-950",
      dot: "bg-zinc-500",
      text: "text-zinc-400"
    };
  }
  if (value >= 30) {
    return {
      card: "border-emerald-500/30 bg-emerald-500/10",
      dot: "bg-emerald-400",
      text: "text-emerald-300"
    };
  }
  if (value >= 10) {
    return {
      card: "border-amber-500/30 bg-amber-500/10",
      dot: "bg-amber-400",
      text: "text-amber-300"
    };
  }
  return {
    card: "border-rose-500/30 bg-rose-500/10",
    dot: "bg-rose-400",
    text: "text-rose-300"
  };
}

function getDemandStyles(demandLevel: NormalizedListing["demandLevel"]) {
  switch (demandLevel) {
    case "High":
      return {
        card: "border-emerald-500/25 bg-emerald-500/10",
        dot: "bg-emerald-400",
        badge: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30"
      };
    case "Medium":
      return {
        card: "border-amber-500/25 bg-amber-500/10",
        dot: "bg-amber-400",
        badge: "bg-amber-400/15 text-amber-300 ring-amber-400/30"
      };
    case "Low":
      return {
        card: "border-rose-500/25 bg-rose-500/10",
        dot: "bg-rose-400",
        badge: "bg-rose-400/15 text-rose-300 ring-rose-400/30"
      };
    default:
      return {
        card: "border-indigo-500/25 bg-indigo-500/10",
        dot: "bg-indigo-400",
        badge: "bg-indigo-400/15 text-indigo-300 ring-indigo-400/30"
      };
  }
}

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

function formatCompactMoney(value: number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? `$${parsed.toFixed(2)}` : "Unavailable";
}

function getMarketDataValue(listing: NormalizedListing, key: "lowestSold" | "averageSold" | "highestSold") {
  if (key === "averageSold") {
    return (
      listing.marketData?.averageSold ??
      listing.averageSoldPrice ??
      listing.estimatedResalePrice ??
      listing.averageSalePrice ??
      null
    );
  }
  return listing.marketData?.[key] ?? listing[key] ?? null;
}

function formatMatrixMoney(value: number | null | undefined) {
  return value == null || !Number.isFinite(Number(value)) ? "N/A" : `$${Number(value).toFixed(2)}`;
}

function formatRatio(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function formatSignedProfit(value: number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "PROFIT UNAVAILABLE";
  const sign = parsed > 0 ? "+" : parsed < 0 ? "-" : "";
  return `${sign}$${Math.abs(parsed).toFixed(2)} PROFIT`;
}

function parseMoneyInput(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function ManualCompPricingPanel({ listing }: { listing: NormalizedListing }) {
  const [soldCompPrice, setSoldCompPrice] = useState("");
  const [costPaid, setCostPaid] = useState(
    listing.resolvedCostBasis != null && Number.isFinite(Number(listing.resolvedCostBasis))
      ? Number(listing.resolvedCostBasis).toFixed(2)
      : ""
  );
  const [shippingEstimate, setShippingEstimate] = useState("5.75");
  const resale = parseMoneyInput(soldCompPrice);
  const cost = parseMoneyInput(costPaid);
  const shipping = parseMoneyInput(shippingEstimate) ?? 5.75;
  const manualMath =
    resale != null && cost != null
      ? {
          fees: resale * 0.13,
          netProfit: resale - resale * 0.13 - shipping - cost,
          roi: ((resale - resale * 0.13 - shipping - cost) / cost) * 100
        }
      : null;

  return (
    <div className="border-t border-zinc-800 px-4 py-4 sm:px-5">
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-amber-200">
              Manual sold comp override
            </p>
            <p className="mt-1 text-xs font-semibold text-zinc-300">
              No sold comps found? Enter a real sold comp. Manual math is labeled and does not overwrite raw market data.
            </p>
          </div>
          <span className="rounded-full border border-amber-400/30 bg-zinc-950 px-3 py-1 text-[11px] font-black text-amber-200">
            Fallback estimate disabled
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-xs font-semibold text-zinc-300">
            Enter sold comp price
            <input
              value={soldCompPrice}
              onChange={(event) => setSoldCompPrice(event.target.value)}
              inputMode="decimal"
              placeholder="Manual price required"
              className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-300"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-zinc-300">
            Enter cost paid
            <input
              value={costPaid}
              onChange={(event) => setCostPaid(event.target.value)}
              inputMode="decimal"
              placeholder="Cost paid"
              className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-300"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-zinc-300">
            Enter shipping estimate
            <input
              value={shippingEstimate}
              onChange={(event) => setShippingEstimate(event.target.value)}
              inputMode="decimal"
              placeholder="5.75"
              className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-300"
            />
          </label>
        </div>
        <div className="mt-4 grid gap-2 text-xs text-zinc-300 sm:grid-cols-3">
          <span>Resale: {resale == null ? "Real pricing unavailable" : `$${resale.toFixed(2)}`}</span>
          <span>Profit: {manualMath == null ? "Manual price required" : formatSignedProfit(manualMath.netProfit)}</span>
          <span>ROI: {manualMath == null ? "Unavailable" : `${manualMath.roi.toFixed(1)}%`}</span>
        </div>
        {resale == null ? (
          <p className="mt-3 text-xs font-semibold text-amber-200">
            No sold comps found. Manual price required. Fallback estimate disabled.
          </p>
        ) : null}
      </div>
    </div>
  );
}
function getSourceStatusClass(status = "") {
  if (status === "BUY") return "bg-emerald-400 text-zinc-950";
  if (status === "HOLD") return "bg-amber-300 text-zinc-950";
  if (status === "SKIP") return "bg-rose-500 text-white";
  return "bg-zinc-800 text-zinc-400";
}

function SourceProfitMatrix({ listing }: { listing: NormalizedListing }) {
  const rows = listing.sourceProfitMetrics || [];
  if (!rows.length) return null;

  return (
    <div className="border-t border-zinc-800 px-4 py-4 sm:px-5">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">
        Source Profit Matrix
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.sourceId}
            className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{row.sourceName}</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                Cost {formatMatrixMoney(row.costBasis)} · Profit {formatMatrixMoney(row.netProfit)}
              </p>
            </div>
            <div className="text-right">
              <span className={`rounded-full px-2 py-1 text-[10px] font-black ${getSourceStatusClass(row.status)}`}>
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

function CrossListDraftsPanel({ listing }: { listing: NormalizedListing }) {
  const drafts = (listing.crossListDrafts || []).slice(0, 8);
  if (!drafts.length) return null;

  return (
    <div className="border-t border-zinc-800 px-4 py-4 sm:px-5">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">
        Cross-list drafts
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {drafts.map((draft) => (
          <details
            key={draft.platform}
            className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2"
          >
            <summary className="cursor-pointer text-xs font-semibold text-white">
              {draft.displayName}
              <span className="ml-2 text-[10px] font-medium text-zinc-500">
                {draft.title.length}/{draft.metadata.titleLimit}
              </span>
            </summary>
            <p className="mt-2 break-words text-xs font-semibold text-zinc-200">
              {draft.title}
            </p>
            <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-zinc-400">
              {draft.description}
            </p>
            {draft.bulletPoints.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {draft.bulletPoints.slice(0, 3).map((bullet) => (
                  <span
                    key={bullet}
                    className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300"
                  >
                    {bullet}
                  </span>
                ))}
              </div>
            ) : null}
            {draft.metadata.warnings.length ? (
              <p className="mt-2 text-[11px] font-semibold text-amber-300">
                {draft.metadata.warnings[0]}
              </p>
            ) : null}
          </details>
        ))}
      </div>
    </div>
  );
}

function InventorySyncPanel({ listing }: { listing: NormalizedListing }) {
  const snapshot = listing.inventorySyncSnapshot as any;
  const universal = snapshot?.universalListing;
  if (!universal) return null;
  const health = Array.isArray(snapshot.listingHealth) ? snapshot.listingHealth : [];
  const registry = Array.isArray(snapshot.listingRegistry) ? snapshot.listingRegistry : [];
  const profit = Array.isArray(snapshot.platformProfitEstimates) ? snapshot.platformProfitEstimates : [];
  const queue = snapshot.publishQueue || {};
  const processedJobs = Array.isArray(queue.processedJobs) ? queue.processedJobs : [];
  const deadLetters = Array.isArray(queue.deadLetters) ? queue.deadLetters : [];
  const eventFlow = Array.isArray(snapshot.syncPreview?.eventFlow) ? snapshot.syncPreview.eventFlow : [];

  return (
    <div className="border-t border-zinc-800 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500">
          Inventory core
        </p>
        <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300">
          SKU {universal.internalSku}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Stock</p>
          <p className="mt-1 text-lg font-black text-white">{universal.quantity}</p>
          <p className="text-[11px] text-zinc-500">
            Duplicate sale protection {universal.syncMetadata.duplicateSaleProtection ? "on" : "off"}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Exposure</p>
          <p className="mt-1 text-lg font-black text-white">{registry.length}</p>
          <p className="text-[11px] text-zinc-500">platform drafts tracked</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Sync</p>
          <p className="mt-1 text-lg font-black text-white">
            {universal.syncMetadata.stockLocked ? "Locked" : "Ready"}
          </p>
          <p className="text-[11px] text-zinc-500">simulated architecture only</p>
        </div>
      </div>
      {health.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {health.slice(0, 8).map((item: any) => (
            <span
              key={item.platform}
              className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300"
            >
              {item.displayName}: {item.status} {item.score}
            </span>
          ))}
        </div>
      ) : null}
      {profit.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {profit.slice(0, 4).map((item: any) => (
            <div key={item.platform} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-xs font-semibold text-white">{String(item.platform).toUpperCase()}</p>
              <p className="mt-1 text-[11px] text-zinc-400">
                Profit {formatMatrixMoney(item.estimatedNetProfit)} · ROI {item.estimatedRoi == null ? "N/A" : `${item.estimatedRoi}%`}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {snapshot.syncPreview ? (
        <p className="mt-3 text-xs text-zinc-400">
          If one unit sells on {snapshot.syncPreview.salePlatform}, mapped quantity becomes {snapshot.syncPreview.remainingQuantity} across connected drafts.
        </p>
      ) : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Publish queue</p>
          <p className="mt-1 text-lg font-black text-white">{queue.summary?.queued ?? 0}</p>
          <p className="text-[11px] text-zinc-500">queued jobs</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Synchronized</p>
          <p className="mt-1 text-lg font-black text-white">{queue.summary?.synchronized ?? 0}</p>
          <p className="text-[11px] text-zinc-500">adapter-ready simulations</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Failed</p>
          <p className="mt-1 text-lg font-black text-white">{queue.summary?.failed ?? 0}</p>
          <p className="text-[11px] text-zinc-500">validation failures</p>
        </div>
      </div>
      {processedJobs.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {processedJobs.slice(0, 8).map((job: any) => (
            <span
              key={job.id}
              className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300"
            >
              {job.targetPlatform}: {job.publishState}
            </span>
          ))}
        </div>
      ) : null}
      {deadLetters.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {deadLetters.slice(0, 4).map((entry: any) => (
            <span
              key={entry.job.id}
              className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold text-rose-200"
            >
              {entry.job.targetPlatform}: {entry.reason}
            </span>
          ))}
        </div>
      ) : null}
      {eventFlow.length ? (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Activity feed</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {eventFlow.slice(0, 6).map((event: any) => (
              <span
                key={event.id}
                className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-200"
              >
                {String(event.type).replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ListingOrchestrationPanel({ listing }: { listing: NormalizedListing }) {
  const orchestration = listing.listingOrchestration as any;
  if (!orchestration?.summary) return null;
  const adaptedListings = Array.isArray(orchestration.adaptedListings) ? orchestration.adaptedListings : [];
  const events = Array.isArray(orchestration.events) ? orchestration.events : [];

  return (
    <div className="border-t border-zinc-800 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500">
          Listing orchestration
        </p>
        <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300">
          Avg quality {orchestration.summary.averageQualityScore}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Platforms</p>
          <p className="mt-1 text-lg font-black text-white">{orchestration.summary.totalPlatforms}</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Queue ready</p>
          <p className="mt-1 text-lg font-black text-white">{orchestration.summary.queueReady}</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Review</p>
          <p className="mt-1 text-lg font-black text-white">{orchestration.summary.needsReview}</p>
        </div>
      </div>
      {adaptedListings.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {adaptedListings.slice(0, 4).map((item: any) => (
            <div key={item.platform} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-xs font-semibold text-white">{item.displayName}</p>
              <p className="mt-1 text-[11px] text-zinc-400">
                SEO {item.optimization?.seoScore ?? 0} · Conversion {item.optimization?.conversionScore ?? 0} · Mobile {item.optimization?.mobileReadabilityScore ?? 0}
              </p>
              {item.validation?.warnings?.[0] || item.validation?.errors?.[0] ? (
                <p className="mt-2 text-[11px] font-semibold text-amber-300">
                  {item.validation.errors?.[0] || item.validation.warnings?.[0]}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {events.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {events.slice(0, 6).map((event: any) => (
            <span
              key={event.id}
              className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-200"
            >
              {String(event.type).replace(/_/g, " ")} {event.platform || ""}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InventoryOSPanel({ listing }: { listing: NormalizedListing }) {
  const inventoryOS = listing.inventoryOS as any;
  const item = inventoryOS?.item;
  if (!item) return null;
  const health = inventoryOS.health || {};
  const stale = inventoryOS.stale || {};
  const allocation = Array.isArray(inventoryOS.stockAllocation) ? inventoryOS.stockAllocation : [];
  const ledger = inventoryOS.profitLedger || {};
  const timeline = Array.isArray(inventoryOS.lifecycleTimeline) ? inventoryOS.lifecycleTimeline : [];

  return (
    <div className="border-t border-zinc-800 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500">
          Inventory OS
        </p>
        <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300">
          {item.lifecycleState}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Health</p>
          <p className="mt-1 text-lg font-black text-white">{item.inventoryHealthScore}</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Dead stock</p>
          <p className="mt-1 text-lg font-black text-white">{item.deadStockRisk}</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Reserved</p>
          <p className="mt-1 text-lg font-black text-white">{item.reservedStock}</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Open profit</p>
          <p className="mt-1 text-lg font-black text-white">{formatMatrixMoney(ledger.totals?.openEstimatedProfit)}</p>
        </div>
      </div>
      {stale.staleWarnings?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {stale.staleWarnings.map((warning: string) => (
            <span
              key={warning}
              className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-200"
            >
              {warning}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {allocation.slice(0, 4).map((entry: any) => (
          <div key={entry.platform} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-xs font-semibold text-white">{String(entry.platform).toUpperCase()}</p>
            <p className="mt-1 text-[11px] text-zinc-400">
              Allocated {entry.allocatedQuantity} · Reserved {entry.reservedQuantity} · {entry.syncState}
            </p>
          </div>
        ))}
      </div>
      {timeline.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {timeline.slice(0, 10).map((step: any) => (
            <span
              key={step.state}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                step.status === "active"
                  ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
                  : step.status === "complete"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : "border-zinc-700 bg-zinc-950 text-zinc-400"
              }`}
            >
              {step.state}
            </span>
          ))}
        </div>
      ) : null}
      {inventoryOS.reorder?.reason ? (
        <p className="mt-3 text-xs text-zinc-400">{inventoryOS.reorder.reason}</p>
      ) : null}
    </div>
  );
}

function AgentCommandPanel({ listing }: { listing: NormalizedListing }) {
  const events = ((listing as any).aiAgentEvents || []) as any[];
  const agents = ((listing as any).aiAgentDecisions || []) as any[];
  const telemetry = ((listing as any).aiAgentTelemetry || {}) as any;
  if (!events.length && !agents.length) return null;

  const feeds = [
    { title: "Opportunity Feed", match: "opportunity_detected" },
    { title: "High Risk Inventory", match: "risk_detected" },
    { title: "Fast Movers", match: "velocity" },
    { title: "Long Tail Opportunities", match: "long_tail" },
    { title: "Stale Inventory", match: "stale_inventory" },
    { title: "Recommended Relists", match: "relist" },
    { title: "AI Pricing Suggestions", match: "pricing_recommended" },
    { title: "Platform Arbitrage Opportunities", match: "listing_optimized" }
  ];

  function feedCount(match: string) {
    if (match === "velocity") return agents.some((agent) => agent.agent === "velocity" && Number(agent.score) >= 60) ? 1 : 0;
    const haystack = `${events.map((event) => `${event.type} ${event.message}`).join(" ")} ${agents
      .map((agent) => `${agent.agent} ${agent.recommendation || ""} ${agent.strategy || ""} ${agent.relistTiming || ""}`)
      .join(" ")}`.toLowerCase();
    return haystack.includes(match.toLowerCase()) ? 1 : 0;
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/20">
      <div className="border-b border-zinc-800 px-4 py-4 sm:px-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
          Autonomous Sourcing Agents
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">
          {(listing as any).aiAgentSummary || "Agent telemetry ready"}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <span className="rounded-xl bg-zinc-950 px-3 py-2 text-zinc-300">
            Avg score {telemetry.averageAgentScore ?? 0}
          </span>
          <span className="rounded-xl bg-zinc-950 px-3 py-2 text-zinc-300">
            Opportunities {telemetry.opportunityCount ?? 0}
          </span>
          <span className="rounded-xl bg-zinc-950 px-3 py-2 text-zinc-300">
            Risks {telemetry.riskCount ?? 0}
          </span>
          <span className="rounded-xl bg-zinc-950 px-3 py-2 text-zinc-300">
            Queue-ready {telemetry.listingReadyCount ?? 0}
          </span>
        </div>
      </div>

      <div className="grid gap-2 border-b border-zinc-800 p-4 sm:grid-cols-2">
        {feeds.map((feed) => {
          const count = feedCount(feed.match);
          return (
            <div
              key={feed.title}
              className={`rounded-2xl border px-3 py-2 ${
                count ? "border-emerald-500/30 bg-emerald-500/10" : "border-zinc-800 bg-zinc-950"
              }`}
            >
              <p className="text-xs font-semibold text-white">{feed.title}</p>
              <p className="mt-1 text-[11px] text-zinc-400">{count ? "Signal active" : "No active signal"}</p>
            </div>
          );
        })}
      </div>

      <div className="space-y-2 p-4">
        {agents.map((agent) => (
          <div key={agent.agent} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">{agent.agent}</p>
              <span className="rounded-full bg-zinc-800 px-2 py-1 text-[10px] font-bold text-zinc-200">
                {Math.round(Number(agent.score) || 0)}/100
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-zinc-300">
              {(agent.recommendation || agent.strategy || agent.level || agent.velocity || agent.relistTiming || "Telemetry evaluated").toString()}
            </p>
            {agent.reasons?.length ? (
              <ul className="mt-2 space-y-1">
                {agent.reasons.slice(0, 2).map((reason: string) => (
                  <li key={reason} className="text-[11px] leading-4 text-zinc-500">
                    {reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function useAnimatedNumber(value = 0, duration = 500) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);

  useEffect(() => {
    if (typeof window === "undefined") {
      setDisplayValue(value);
      previousValue.current = value;
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setDisplayValue(value);
      previousValue.current = value;
      return;
    }

    const startValue = previousValue.current;
    const change = value - startValue;
    const startTime = performance.now();
    let frame = 0;

    function tick(now: number) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(startValue + change * eased);
      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      } else {
        previousValue.current = value;
      }
    }

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [duration, value]);

  return displayValue;
}

function getRoi(listing: NormalizedListing) {
  const value = Number(listing.roiPercentage ?? listing.sourcingAnalytics?.roiPercentage);
  return Number.isFinite(value) && value !== 0 ? Math.round(value) : null;
}

function getDemandScore(listing: NormalizedListing) {
  if (listing.demandScore != null) {
    return Math.max(0, Math.min(100, Math.round(Number(listing.demandScore) || 0)));
  }
  const demand = String(listing.demandLevel || "").toLowerCase();
  if (demand === "high") return 85;
  if (demand === "medium") return 62;
  if (demand === "low") return 32;
  return Math.max(0, Math.min(100, Math.round(Number(listing.marketConfidence?.value) || 45)));
}

function getBuyPassRecommendation(listing: NormalizedListing) {
  const engineAction = String(listing.decisionCard?.action || "").toUpperCase();
  if (["BUY", "MARGINAL", "HOLD", "SKIP", "MANUAL_REVIEW", "INVESTIGATE", "LONG_TAIL", "HIGH_RISK"].includes(engineAction)) {
    const label = engineAction;
    return {
      label,
      className:
        engineAction === "BUY"
          ? "border-emerald-400/30 bg-emerald-400 text-zinc-950"
          : engineAction === "MARGINAL" || engineAction === "HOLD"
            ? "border-amber-400/30 bg-amber-400 text-zinc-950"
            : engineAction === "LONG_TAIL"
              ? "border-violet-400/30 bg-violet-500 text-white"
              : engineAction === "INVESTIGATE" || engineAction === "HIGH_RISK"
                ? "border-orange-400/30 bg-orange-500 text-white"
            : engineAction === "MANUAL_REVIEW"
              ? "border-sky-400/30 bg-sky-500 text-white"
              : "border-rose-400/30 bg-rose-500 text-white"
    };
  }
  const explicit = String(listing.recommendation || "").toUpperCase();
  if (["BUY", "MARGINAL", "HOLD", "PASS", "SKIP", "MANUAL_REVIEW", "INVESTIGATE", "LONG_TAIL", "HIGH_RISK"].includes(explicit)) {
    const label = explicit === "SKIP" ? "SKIP" : explicit;
    return {
      label,
      className:
        explicit === "BUY"
          ? "border-emerald-400/30 bg-emerald-400 text-zinc-950"
          : explicit === "MARGINAL" || explicit === "HOLD"
            ? "border-amber-400/30 bg-amber-400 text-zinc-950"
            : explicit === "LONG_TAIL"
              ? "border-violet-400/30 bg-violet-500 text-white"
              : explicit === "INVESTIGATE" || explicit === "HIGH_RISK"
                ? "border-orange-400/30 bg-orange-500 text-white"
            : explicit === "MANUAL_REVIEW"
              ? "border-sky-400/30 bg-sky-500 text-white"
              : "border-rose-400/30 bg-rose-500 text-white"
    };
  }
  if (listing.marketDataUnavailable || (listing.engineTelemetry?.compCount ?? 0) <= 0) {
    return {
      label: "MANUAL_REVIEW",
      className: "border-sky-400/30 bg-sky-500 text-white"
    };
  }
  const confidence = Math.round(Number(listing.confidenceScore) || 0);
  const roi = getRoi(listing) ?? 0;
  const demandScore = getDemandScore(listing);
  const profitable = Number(listing.profitPotential) >= 10 || roi >= 35;
  const strong = Number(listing.profitPotential) >= 20 && roi >= 50;
  const risky = String(listing.sourcingAnalytics?.riskLevel?.label || "").toLowerCase().includes("high");
  const buy = (strong || (profitable && demandScore >= 55)) && confidence >= 50 && !risky;

  return {
    label: buy ? "BUY" : confidence < 50 ? "HOLD" : "PASS",
    className: buy
      ? "border-emerald-400/30 bg-emerald-400 text-zinc-950"
      : confidence < 50
        ? "border-amber-400/30 bg-amber-400 text-zinc-950"
        : "border-rose-400/30 bg-rose-500 text-white"
  };
}

function decisionBadgeLabel(value: string) {
  if (value === "BUY") return "🟢 BUY";
  if (value === "MARGINAL" || value === "HOLD") return "🟡 MARGINAL";
  return "🔴 SKIP";
}

function MarketDataCard({ listing }: { listing: NormalizedListing }) {
  const soldCount = Number(listing.marketData?.soldCount ?? listing.soldCount ?? listing.trustedCompSummary?.soldCount ?? listing.comps?.length ?? 0);
  const confidence = Number(listing.marketData?.confidence ?? listing.confidenceScore ?? 0);

  return (
    <div className="border-t border-zinc-800 px-4 py-4 sm:px-5">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">
            Market Data
          </p>
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] font-semibold text-zinc-300">
            {Math.round(confidence)}% confidence
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile
            label="Lowest Sold"
            value={formatCompactMoney(getMarketDataValue(listing, "lowestSold"))}
            helper="Recent sold floor"
          />
          <MetricTile
            label="Average Sold"
            value={formatCompactMoney(getMarketDataValue(listing, "averageSold"))}
            helper="ROI basis"
          />
          <MetricTile
            label="Highest Sold"
            value={formatCompactMoney(getMarketDataValue(listing, "highestSold"))}
            helper="Recent sold ceiling"
          />
          <MetricTile
            label="Sold Count"
            value={soldCount > 0 ? String(soldCount) : "Unavailable"}
            helper="Recent eBay solds"
          />
        </div>
      </div>
    </div>
  );
}

function SourcePricingCard({ listing }: { listing: NormalizedListing }) {
  const walmartPrice = listing.marketData?.walmartPrice ?? listing.walmartPrice ?? null;
  const costPaid = listing.resolvedCostBasis ?? walmartPrice ?? null;

  return (
    <div className="border-t border-zinc-800 px-4 py-4 sm:px-5">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500">
          Source Price
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MetricTile
            label="Walmart"
            value={formatCompactMoney(walmartPrice)}
            helper={listing.marketData?.walmartTitle || listing.walmartTitle || "Source lookup"}
          />
          <MetricTile
            label="Cost Paid"
            value={formatCompactMoney(costPaid)}
            helper="Default cost basis"
          />
        </div>
      </div>
    </div>
  );
}

function DecisionStatusCard({ listing }: { listing: NormalizedListing }) {
  const recommendation = getBuyPassRecommendation(listing);
  const normalized = recommendation.label === "HOLD" ? "MARGINAL" : recommendation.label;
  const tone =
    normalized === "BUY"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : normalized === "MARGINAL"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
        : "border-rose-500/30 bg-rose-500/10 text-rose-200";

  return (
    <div className="border-t border-zinc-800 px-4 py-4 sm:px-5">
      <div className={`rounded-2xl border p-4 ${tone}`}>
        <p className="text-[10px] uppercase tracking-widest opacity-80">
          Decision Card
        </p>
        <p className="mt-2 text-3xl font-black tracking-normal">
          {decisionBadgeLabel(normalized)}
        </p>
        <p className="mt-2 text-sm font-semibold opacity-90">
          {listing.recommendationExplanation || listing.sourcingTip}
        </p>
      </div>
    </div>
  );
}

function sourceStoreLabel(value = "") {
  if (value === "WALMART") return "Walmart";
  if (value === "DOLLAR_TREE") return "Dollar Tree";
  if (value === "MANUAL") return "Manual Cost";
  return "";
}

function candidateKey(candidate: ProductCandidate) {
  return `${candidate.upc || ""}|${candidate.title}|${candidate.source}`;
}

function persistProductCorrection(
  listing: NormalizedListing,
  action: string,
  candidate: ProductCandidate | null
) {
  if (typeof window === "undefined") return;
  try {
    const event = {
      action,
      candidate,
      correctedTitle: candidate?.title || "",
      upc: candidate?.upc || listing.upc || "",
      sourceStore: sourceStoreLabel(listing.sourceStoreType) || listing.sourceStoreType || "",
      variantOrFlavor: candidate?.matchedTokens?.join(" ") || "",
      trustedQueryPattern:
        listing.generatedSearchQueries?.find((query) => candidate?.upc && query.includes(candidate.upc)) ||
        listing.generatedSearchQueries?.[0] ||
        listing.trustedCompSummary?.generatedSearchQueries?.[0] ||
        "",
      listingUpc: listing.upc || "",
      listingTitle: listing.itemTitle || "",
      createdAt: new Date().toISOString()
    };
    const existing = JSON.parse(window.localStorage.getItem(PRODUCT_CORRECTIONS_COLLECTION) || "[]");
    window.localStorage.setItem(
      PRODUCT_CORRECTIONS_COLLECTION,
      JSON.stringify([event, ...(Array.isArray(existing) ? existing : [])].slice(0, 25))
    );
    if (!candidate) return;
    const scans = JSON.parse(window.localStorage.getItem(SCAN_HISTORY_COLLECTION) || "[]");
    if (!Array.isArray(scans)) return;
    const nextScans = scans.map((scan) => {
      const scanListing = scan?.listing || {};
      const sameUpc = listing.upc && scanListing.upc === listing.upc;
      const sameTitle = scanListing.itemTitle === listing.itemTitle;
      if (!sameUpc && !sameTitle) return scan;
      return {
        ...scan,
        listing: {
          ...scanListing,
          confirmedProductIdentity: candidate
        }
      };
    });
    window.localStorage.setItem(SCAN_HISTORY_COLLECTION, JSON.stringify(nextScans));
  } catch {
    // Correction persistence should never block the scan result UI.
  }
}

function ProductCandidatePicker({ listing }: { listing: NormalizedListing }) {
  const candidates = (listing.productCandidates || []).slice(0, 5);
  const [confirmedIdentity, setConfirmedIdentity] = useState<ProductCandidate | null>(
    listing.confirmedProductIdentity || null
  );
  const [status, setStatus] = useState("");

  useEffect(() => {
    setConfirmedIdentity(listing.confirmedProductIdentity || null);
    setStatus("");
  }, [listing]);

  function confirmCandidate(candidate: ProductCandidate, action = "use_candidate") {
    setConfirmedIdentity(candidate);
    setStatus(`Confirmed: ${candidate.title}`);
    persistProductCorrection(listing, action, candidate);
  }

  function recordCorrection(action: string, candidate: ProductCandidate | null = null) {
    setStatus(
      action === "wrong_item"
        ? "Marked wrong item. Manual review remains active."
        : action === "wrong_variant"
          ? "Marked wrong variant. Verify comps before buying."
          : "Marked bundle or multipack. Verify quantity before pricing."
    );
    persistProductCorrection(listing, action, candidate);
  }

  function enterManually() {
    const title = window.prompt("Enter the correct product title");
    if (!title?.trim()) return;
    const candidate: ProductCandidate = {
      title: title.trim(),
      brand: listing.brand || "",
      category: "",
      upc: listing.upc || "",
      source: "manual correction history",
      confidence: 100,
      matchedTokens: title.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8),
      reasonSuggested: "Reseller manually confirmed this identity."
    };
    confirmCandidate(candidate, "manual_entry");
  }

  return (
    <div className="border-t border-zinc-800 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500">
          Which item is this?
        </p>
        {confirmedIdentity ? (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-200">
            Confirmed
          </span>
        ) : null}
      </div>
      {candidates.length ? (
        <div className="mt-3 grid gap-2">
          {candidates.map((candidate) => (
            <div
              key={candidateKey(candidate)}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 break-words text-sm font-semibold text-white">
                    {candidate.title}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                    {candidate.source} · {Math.round(candidate.confidence)}% confidence
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => confirmCandidate(candidate)}
                  className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  Use this item
                </button>
              </div>
              {candidate.matchedTokens.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {candidate.matchedTokens.slice(0, 6).map((token) => (
                    <span
                      key={`${candidateKey(candidate)}-${token}`}
                      className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-zinc-300"
                    >
                      {token}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => recordCorrection("wrong_variant", candidate)}
                  className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] font-semibold text-zinc-300"
                >
                  Wrong variant
                </button>
                <button
                  type="button"
                  onClick={() => recordCorrection("bundle_multipack", candidate)}
                  className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] font-semibold text-zinc-300"
                >
                  Bundle/multipack
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-400">
          No strong product candidates yet. Keep this result in manual review until identity is confirmed.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => recordCorrection("wrong_item")}
          className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300"
        >
          Wrong item
        </button>
        <button
          type="button"
          onClick={enterManually}
          className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] font-bold text-sky-200"
        >
          Enter manually
        </button>
      </div>
      {status ? <p className="mt-2 text-xs font-semibold text-amber-300">{status}</p> : null}
    </div>
  );
}

function resellerSignalLabel(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getRecommendationReasons(listing: NormalizedListing, velocityLabel: string) {
  const reasons = new Set<string>();
  const confidence = Number(listing.confidenceScore) || 0;
  const profit = Number(listing.estimatedProfit ?? listing.profitPotential);
  const averagePrice = Number(listing.averageSalePrice ?? listing.estimatedResalePrice);
  const roi = getRoi(listing);

  if (listing.marketDataUnavailable || !Number.isFinite(averagePrice) || averagePrice <= 0) {
    reasons.add("No reliable sold comps");
  }
  if (velocityLabel === "FAST") reasons.add("Strong sold velocity detected");
  if (velocityLabel === "HEALTHY") reasons.add("Healthy sell-through history");
  if (velocityLabel === "SLOW" || velocityLabel === "DEAD") reasons.add("Weak sell-through history");
  if (confidence < 50) reasons.add("Low confidence requires manual review");
  if (!Number.isFinite(profit) || profit <= 0) reasons.add("Profit is unavailable or not positive");
  if (roi != null && roi < 15) reasons.add("ROI is below buy threshold");
  if (confidence >= 75 && Number.isFinite(averagePrice) && averagePrice > 0) {
    reasons.add("Stable sold pricing");
  }
  if (!reasons.size) reasons.add("Verified resale signals support the recommendation");
  return Array.from(reasons).slice(0, 5);
}

function MetricTile({
  label,
  value,
  helper,
  progress,
  progressClassName = "bg-emerald-400",
  className = "border-zinc-800 bg-zinc-950",
  valueClassName = "text-white"
}: {
  label: string;
  value: string;
  helper?: string;
  progress?: number;
  progressClassName?: string;
  className?: string;
  valueClassName?: string;
}) {
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));

  return (
    <div className={`min-h-24 rounded-2xl border p-4 ${className}`}>
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={`mt-2 break-words text-xl font-bold tracking-normal ${valueClassName}`}>
        {value}
      </p>
      {progress != null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${progressClassName}`}
            style={{ width: `${safeProgress}%` }}
          />
        </div>
      ) : null}
      {helper ? <p className="mt-1 text-xs leading-5 text-zinc-400">{helper}</p> : null}
    </div>
  );
}

function isFallbackEstimate(listing: NormalizedListing) {
  const text = `${listing.sourcingTip || ""} ${listing.recommendationExplanation || ""}`.toLowerCase();
  return text.includes("ai credits unavailable") || Boolean(listing.marketDataUnavailable && Number(listing.confidenceScore) < 45);
}

function getContextAwareMicrocopy(listing: NormalizedListing) {
  const profit = Number(listing.profitPotential) || 0;
  const confidence = Number(listing.confidenceScore) || 0;
  const demand = String(listing.demandLevel || "").toLowerCase();

  if (demand === "high" && profit >= 20) {
    return "Strong shelf opportunity — Fast-moving category";
  }
  if (confidence >= 50 && confidence < 75) {
    return "High flip confidence — check target category limits";
  }
  if (confidence < 50 || profit < 10) {
    return "Weak historical consistency — consider leaving on shelf";
  }
  return "Strong profit signal — verify comps before checkout";
}

function getDecisionGlowClass(recommendation: string) {
  if (recommendation === "BUY") {
    return "shadow-[0_0_28px_rgba(52,211,153,0.22)] motion-safe:animate-pulse";
  }
  if (recommendation === "PASS" || recommendation === "SKIP") {
    return "shadow-[0_0_28px_rgba(244,63,94,0.2)]";
  }
  return "shadow-[0_0_28px_rgba(251,191,36,0.18)]";
}

export function DecisionBanner({
  listing,
  hotFind = false
}: {
  listing: NormalizedListing;
  hotFind?: boolean;
}) {
  const decision = getDecisionEngine(listing);
  const velocity = getSalesVelocitySignal(listing);
  const fallback = isFallbackEstimate(listing);
  const animatedConfidence = useAnimatedNumber(decision.confidence);

  return (
    <section className={`rounded-3xl border p-4 shadow-2xl shadow-black/20 transition-shadow duration-500 sm:p-5 ${decision.badgeColor} ${getDecisionGlowClass(decision.recommendation)}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest opacity-80">Instant decision</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-2xl font-black tracking-normal sm:text-3xl">
              {decision.recommendation}
            </span>
            {hotFind ? (
              <span className="rounded-full border border-emerald-400/40 bg-emerald-400/15 px-3 py-1 text-[11px] font-black text-emerald-200 shadow-[0_0_18px_rgba(52,211,153,0.25)] motion-safe:animate-pulse">
                HOT FIND
              </span>
            ) : null}
            <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${velocity.color}`}>
              {velocity.label}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold opacity-90">{decision.explanation}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-right sm:min-w-44">
          <div className="rounded-2xl border border-black/10 bg-black/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest opacity-75">Confidence</p>
            <p className="text-lg font-black">{Math.round(animatedConfidence)}%</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-black/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest opacity-75">Risk</p>
            <p className="text-lg font-black">{decision.riskLevel}</p>
          </div>
        </div>
      </div>
      {fallback ? (
        <p className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2 text-xs text-amber-500/90">
          Real pricing unavailable — no sold comps found. Fallback estimate disabled.
        </p>
      ) : null}
    </section>
  );
}

export function ProfitSummaryCard({ listing }: { listing: NormalizedListing }) {
  const [fieldCalibrationMode, setFieldCalibrationMode] = useState(false);
  const hasThumbnail = Boolean(listing.thumbnailUrl);
  const roi = getRoi(listing);
  const demandScore = getDemandScore(listing);
  const confidence = getConfidenceDisplay(listing.confidenceScore);
  const animatedConfidence = useAnimatedNumber(confidence.value);
  const animatedDemandScore = useAnimatedNumber(demandScore);
  const recommendation = getBuyPassRecommendation(listing);
  const profitIndicator = getProfitIndicator(listing.profitPotential);
  const roiIndicator = getProfitIndicator((roi ?? 0) >= 50 ? 30 : (roi ?? 0) >= 25 ? 10 : 0);
  const sourceBadges = listing.sourceBadges?.length
    ? listing.sourceBadges
    : [listing.upc ? "Barcode" : "", "Vision"].filter(Boolean);
  const trustSignals = getResultTrustSignals(listing);
  const velocity = getSalesVelocitySignal(listing);
  const calibrationLog = (listing.calibrationLog || {}) as any;
  const recommendationReasons = getRecommendationReasons(listing, velocity.label);
  const platformBadges = ["eBay", "Amazon", "Walmart", "TikTok Shop"].filter(
    (badge) => !sourceBadges.includes(badge)
  );
  const recommendationTone =
    recommendation.label === "BUY"
      ? { card: "border-emerald-500/30 bg-emerald-500/10", text: "text-emerald-300" }
      : recommendation.label === "HOLD"
        ? { card: "border-amber-500/30 bg-amber-500/10", text: "text-amber-300" }
        : { card: "border-rose-500/30 bg-rose-500/10", text: "text-rose-300" };

  useEffect(() => {
    try {
      setFieldCalibrationMode(window.localStorage.getItem("boss-listers.fieldCalibrationMode.v1") === "true");
    } catch {
      setFieldCalibrationMode(false);
    }
  }, []);

  function toggleFieldCalibrationMode() {
    setFieldCalibrationMode((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("boss-listers.fieldCalibrationMode.v1", String(next));
      } catch {
        // Field mode is local-only and optional.
      }
      return next;
    });
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/20">
      <div className="relative aspect-video w-full overflow-hidden">
        {hasThumbnail ? (
          <img
            src={listing.thumbnailUrl}
            alt={listing.itemTitle}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-sm text-zinc-400">
            No image preview
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-black ${recommendation.className}`}>
              {recommendation.label}
            </span>
            <span className={`rounded-full border border-zinc-700 bg-black/70 px-3 py-1 text-xs font-black ${profitIndicator.text}`}>
              {formatSignedProfit(listing.estimatedProfit ?? listing.profitPotential)}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${confidence.color}`}>
              {confidence.value}% CONFIDENCE
            </span>
              <span className={`inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-black/70 px-3 py-1 text-xs font-semibold ${profitIndicator.text}`}>
                <span className={`h-2 w-2 rounded-full ${profitIndicator.dot}`} />
              {listing.profitPotential == null
                ? "Profit unavailable"
                : Number(listing.profitPotential) >= 30
                  ? "High profit"
                  : Number(listing.profitPotential) >= 10
                    ? "Moderate profit"
                    : "Low profit"}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${velocity.color}`}>
              {velocity.label}
            </span>
          </div>
          <h2 className="line-clamp-2 break-words text-lg font-semibold tracking-normal text-white sm:text-xl">
            {listing.itemTitle}
          </h2>
          <p className="mt-2 text-xs font-semibold text-zinc-300">
            {getContextAwareMicrocopy(listing)}
          </p>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
        <MetricTile
          label="Average sold"
          value={formatCompactMoney(getMarketDataValue(listing, "averageSold"))}
          helper="Market data"
        />
        <MetricTile
          label="Estimated profit"
          value={formatCompactMoney(listing.estimatedProfit ?? listing.profitPotential)}
          helper="After estimated costs"
          className={profitIndicator.card}
          valueClassName={getProfitColor(listing.profitPotential)}
        />
        <MetricTile
          label="ROI"
          value={roi == null ? "Unavailable" : `${roi}%`}
          helper="Expected return"
          className={roiIndicator.card}
          valueClassName={roiIndicator.text}
        />
        <MetricTile
          label="Demand score"
          value={`${Math.round(animatedDemandScore)}/100`}
          helper={`${listing.demandLevel} demand`}
          progress={animatedDemandScore}
          progressClassName={demandScore >= 70 ? "bg-emerald-400" : demandScore >= 45 ? "bg-amber-300" : "bg-rose-500"}
          valueClassName={demandScore >= 70 ? "text-emerald-300" : demandScore >= 45 ? "text-amber-300" : "text-rose-300"}
        />
        <MetricTile
          label="Recommendation"
          value={recommendation.label}
          helper={
            recommendation.label === "BUY"
              ? "Meets sourcing signals"
              : recommendation.label === "HOLD"
                ? "Verify before buying"
                : "Not a good buy yet"
          }
          className={recommendationTone.card}
          valueClassName={recommendationTone.text}
        />
        <MetricTile
          label="Confidence"
          value={`${Math.round(animatedConfidence)}%`}
          helper={confidence.label}
          progress={animatedConfidence}
          progressClassName={confidence.value >= 75 ? "bg-emerald-400" : confidence.value >= 50 ? "bg-yellow-300" : "bg-red-500"}
          valueClassName={confidence.value >= 75 ? "text-emerald-300" : confidence.value >= 50 ? "text-amber-300" : "text-rose-300"}
        />
      </div>

      <MarketDataCard listing={listing} />
      <DecisionStatusCard listing={listing} />
      <SourcePricingCard listing={listing} />
      <ManualCompPricingPanel listing={listing} />
      <SourceProfitMatrix listing={listing} />
      <ProductCandidatePicker listing={listing} />
      <CrossListDraftsPanel listing={listing} />
      <ListingOrchestrationPanel listing={listing} />
      <InventorySyncPanel listing={listing} />
      <InventoryOSPanel listing={listing} />
      <AgentCommandPanel listing={listing} />

      <div className="border-t border-zinc-800 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          {sourceBadges.map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300"
            >
              {badge}
            </span>
          ))}
          {sourceStoreLabel(listing.sourceStoreType) ? (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-200">
              {sourceStoreLabel(listing.sourceStoreType)}
            </span>
          ) : null}
          {listing.resolvedCostBasis != null ? (
            <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300">
              Cost ${listing.resolvedCostBasis.toFixed(2)}
            </span>
          ) : null}
          {listing.lookupSource ? (
            <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300">
              Lookup {listing.lookupSource}
            </span>
          ) : null}
          <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300">
            Resale {listing.resaleAuthoritySource || "eBay SOLD comps"}
          </span>
          {platformBadges.map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1 text-[11px] font-semibold text-zinc-500"
            >
              {badge}
            </span>
          ))}
          {listing.upc ? (
            <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300">
              UPC/EAN {listing.upc}
            </span>
          ) : null}
        </div>
        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">
              Why this result?
            </p>
            <button
              type="button"
              onClick={toggleFieldCalibrationMode}
              className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] font-semibold text-zinc-300"
            >
              Field Calibration {fieldCalibrationMode ? "On" : "Off"}
            </button>
          </div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">
            Why this recommendation?
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            {listing.recommendationExplanation || listing.sourcingTip}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {recommendationReasons.map((reason) => (
              <span
                key={reason}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] font-semibold text-zinc-300"
              >
                {reason}
              </span>
            ))}
          </div>
          {listing.marketDataUnavailable ? (
            <p className="mt-2 text-xs font-semibold text-amber-300">
              Market data unavailable. Manual sold-comp verification recommended.
            </p>
          ) : null}
          {listing.resellerSignals?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {listing.resellerSignals.map((signal) => (
                <span
                  key={signal}
                  className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-200"
                >
                  {resellerSignalLabel(signal)}
                </span>
              ))}
            </div>
          ) : null}
          {listing.missingDataPoints?.length ? (
            <div className="mt-3 space-y-1">
              {listing.missingDataPoints.map((item) => (
                <p key={item} className="text-xs font-semibold text-amber-300">
                  Missing: {item}
                </p>
              ))}
            </div>
          ) : null}
          {trustSignals.warnings.length ? (
            <div className="mt-3 space-y-1">
              {trustSignals.warnings.map((warning) => (
                <p key={warning} className="text-xs font-semibold text-amber-300">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
          {trustSignals.intelligence.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {trustSignals.intelligence.slice(0, 3).map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] font-semibold text-zinc-300"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-3 grid gap-2 text-xs text-zinc-300 sm:grid-cols-2">
            <span>
              Identity: {listing.trustedCompSummary?.identityConfidence?.score ?? listing.trustScore ?? 0}% match confidence
            </span>
            <span>
              Trust grade: {listing.trustedCompSummary?.trustGrade || "LOW"} / Confidence: {listing.trustedCompSummary?.confidenceGrade || "LOW"}
            </span>
            <span>
              Visual grade: {listing.trustedCompSummary?.visualConfidenceStage || "LOW_CONFIDENCE_UNKNOWN"}
            </span>
            <span>
              Query path: {listing.trustedCompSummary?.queryPathSelected || listing.generatedSearchQueries?.[0] || "Unavailable"}
            </span>
            <span>
              Accepted comps: {listing.trustedCompSummary?.acceptedComps ?? 0}
            </span>
            <span>
              Rejected comps: {listing.trustedCompSummary?.rejectedComps ?? 0}
            </span>
            <span>
              Recommendation: {recommendation.label}
            </span>
          </div>
          {fieldCalibrationMode && listing.calibrationLog ? (
            <div className="mt-4 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-3">
              <p className="text-[10px] uppercase tracking-widest text-sky-200">
                Field calibration mode
              </p>
              <div className="mt-2 grid gap-2 text-xs text-zinc-300 sm:grid-cols-2">
                <span>Raw OCR: {(calibrationLog.rawOcrText || []).slice(0, 6).join(", ") || "Unavailable"}</span>
                <span>Adaptive tuning: {calibrationLog.adaptiveConfidenceAdjustment ?? 0}</span>
                <span>Identity reason: {calibrationLog.identityReason || "No strong identity reason recorded"}</span>
                <span>Recommendation reason: {calibrationLog.recommendationReason || "Manual review if evidence is incomplete"}</span>
              </div>
            </div>
          ) : null}
          {fieldCalibrationMode && listing.imageRoleTelemetry ? (
            <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Image role telemetry
              </p>
              <div className="mt-2 grid gap-2 text-xs text-zinc-300 sm:grid-cols-2">
                <span>UPC image: {((listing.imageRoleTelemetry as any).upcResolvedBy || "unresolved")}</span>
                <span>Title image: {((listing.imageRoleTelemetry as any).titleResolvedBy || "unresolved")}</span>
                <span>Pricing image: {((listing.imageRoleTelemetry as any).pricingResolvedBy || "unresolved")}</span>
                <span>Failed OCR: {(((listing.imageRoleTelemetry as any).failedOcrRoles || []) as string[]).join(", ") || "none"}</span>
                <span>Confirmed: {(((listing.imageRoleTelemetry as any).confirmedSignals || []) as string[]).join(", ") || "none"}</span>
                <span>Conflicts: {(((listing.imageRoleTelemetry as any).contradictions || []) as string[]).join(", ") || "none"}</span>
              </div>
            </div>
          ) : null}
          {fieldCalibrationMode && listing.trustedCompSummary?.strongestTokens?.length ? (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Product match tokens
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {listing.trustedCompSummary.strongestTokens.slice(0, 8).map((item: any) => (
                  <span
                    key={`${item.token}-${item.weight}`}
                    className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-200"
                  >
                    {item.token} {item.weight}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {fieldCalibrationMode && listing.trustedCompSummary?.confidenceCollapseReasons?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {listing.trustedCompSummary.confidenceCollapseReasons.map((reason) => (
                <span
                  key={reason}
                  className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold text-rose-200"
                >
                  {reason.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          ) : null}
          {fieldCalibrationMode && listing.trustedCompSummary?.rejectedVisualIndicators?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {listing.trustedCompSummary.rejectedVisualIndicators.map((indicator) => (
                <span
                  key={indicator}
                  className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-200"
                >
                  {indicator}
                </span>
              ))}
            </div>
          ) : null}
          {fieldCalibrationMode && listing.trustedCompSummary?.acceptedCompReasons?.length ? (
            <div className="mt-3 space-y-1">
              {listing.trustedCompSummary.acceptedCompReasons.slice(0, 3).map((item: any, index: number) => (
                <p key={`${item.title}-${index}`} className="text-xs text-zinc-400">
                  Accepted comp: {item.reason} · token {Math.round((item.tokenOverlapScore || 0) * 100)}% · title {Math.round((item.titleSimilarityScore || 0) * 100)}%
                </p>
              ))}
            </div>
          ) : null}
          <details className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              Engine details
            </summary>
            <div className="mt-3 grid gap-2 text-xs text-zinc-300 sm:grid-cols-2">
              <span>Trust score: {listing.trustScore ?? listing.trustedCompSummary?.trustScore ?? 0}%</span>
              <span>Trusted accepted: {listing.trustedCompSummary?.acceptedComps ?? 0}</span>
              <span>Trusted rejected: {listing.trustedCompSummary?.rejectedComps ?? 0}</span>
              <span>Exact match confidence: {listing.trustedCompSummary?.identityConfidence?.score ?? 0}%</span>
              <span>Trusted sold avg: {formatCompactMoney(listing.trustedCompSummary?.averageSoldPrice)}</span>
              <span>Trusted velocity: {listing.trustedCompSummary?.velocityScore || "DEAD"}</span>
              <span>Velocity tier: {listing.trustedCompSummary?.velocityTier || "DEAD"}</span>
              <span>Sold velocity: {listing.trustedCompSummary?.sellThroughRate ?? 0}%</span>
              <span>Saturation risk: {listing.trustedCompSummary?.saturationRisk || "HIGH"}</span>
              <span>Comp count: {listing.engineTelemetry?.compCount ?? 0}</span>
              <span>Saturation: {(listing.engineTelemetry?.saturationRatio ?? 0).toFixed(2)}</span>
              <span>Velocity: {listing.engineTelemetry?.velocityScore || "DEAD"}</span>
              <span>OCR: {listing.engineTelemetry?.ocrConfidence || "LOW"}</span>
              <span>Multipack: {listing.engineTelemetry?.isMultipackOrBundle ? "Detected" : "No"}</span>
              <span>Enrichment: {listing.lookupSource ? "available" : "unavailable"}</span>
              <span>Behavior profile: {listing.resellerBehaviorProfile || "unassigned"}</span>
              <span>Adjusted confidence: {listing.adjustedConfidenceScore ?? listing.confidenceScore ?? 0}%</span>
              <span>Liquidity: {(listing.resellerEngineTelemetry as any)?.liquidityTier || "UNKNOWN"}</span>
              <span>Days to sell: {(listing.resellerEngineTelemetry as any)?.estimatedDaysToSell ?? "N/A"}</span>
              <span>Competition: {(listing.resellerEngineTelemetry as any)?.competitionPressure || "UNKNOWN"}</span>
              <span>Market saturation: {(listing.resellerEngineTelemetry as any)?.marketSaturation || "UNKNOWN"}</span>
              <span>Saturation ratio: {formatRatio((listing.resellerEngineTelemetry as any)?.saturationRatio ?? listing.trustedCompSummary?.saturationRatio)}</span>
              <span>Shipping friction: {formatRatio((listing.resellerEngineTelemetry as any)?.shippingFrictionRatio)}</span>
              <span>Reseller pain: {(listing.resellerEngineTelemetry as any)?.resellerPainScore ?? 0}/100</span>
              <span>Storage penalty: {(listing.resellerEngineTelemetry as any)?.storagePenalty ?? 0}/40</span>
              <span>Stale inventory: {(listing.resellerEngineTelemetry as any)?.staleInventoryRisk || "UNKNOWN"}</span>
              <span>Estimated sell time: {(listing.resellerEngineTelemetry as any)?.marketBehaviorSimulation?.liquidityWindowDays ?? "N/A"} days</span>
              <span>Quick flip chance: {(listing.resellerEngineTelemetry as any)?.marketBehaviorSimulation?.quickFlipProbability ?? 0}%</span>
              <span>Long-tail risk: {(listing.resellerEngineTelemetry as any)?.marketBehaviorSimulation?.longTailProbability ?? 0}%</span>
              <span>Collector demand: {(listing.resellerEngineTelemetry as any)?.marketBehaviorSimulation?.collectorDemandIndex ?? 0}%</span>
              <span>Market simulator: {(listing.resellerEngineTelemetry as any)?.marketBehaviorSimulation?.simulationRecommendation || "RISKY"}</span>
              <span>Return risk: {(listing.resellerEngineTelemetry as any)?.returnRisk ? "Detected" : "Clear"}</span>
              <span>Incomplete listing: {(listing.resellerEngineTelemetry as any)?.incompleteListingRisk ? "Detected" : "Clear"}</span>
            </div>
            {(listing.resellerEngineTelemetry as any)?.marketBehaviorSimulation?.simulationSummary ? (
              <p className="mt-3 text-xs font-semibold text-zinc-300">
                {(listing.resellerEngineTelemetry as any).marketBehaviorSimulation.simulationSummary}
              </p>
            ) : null}
            {(listing.resellerEngineTelemetry as any)?.marketBehaviorSummary ? (
              <p className="mt-3 text-xs font-semibold text-zinc-300">
                {(listing.resellerEngineTelemetry as any).marketBehaviorSummary}
              </p>
            ) : null}
            {(listing.resellerEngineTelemetry as any)?.confidenceCollapseReason?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {((listing.resellerEngineTelemetry as any).confidenceCollapseReason as string[]).map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-[11px] font-semibold text-orange-200"
                  >
                    {reason.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            ) : null}
            {(listing.resellerEngineTelemetry as any)?.confidenceDegradationReasons?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {((listing.resellerEngineTelemetry as any).confidenceDegradationReasons as string[]).slice(0, 4).map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold text-rose-200"
                  >
                    {reason}
                  </span>
                ))}
              </div>
            ) : null}
            {listing.resellerWarnings?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {listing.resellerWarnings.slice(0, 4).map((warning) => (
                  <span
                    key={warning}
                    className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-200"
                  >
                    {warning}
                  </span>
                ))}
              </div>
            ) : null}
            {listing.resellerRuleActions?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {listing.resellerRuleActions.slice(0, 6).map((rule: any) => (
                  <span
                    key={rule.ruleId}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                      rule.passed
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        : rule.severity === "BLOCKER"
                          ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                          : "border-zinc-700 bg-zinc-950 text-zinc-300"
                    }`}
                  >
                    {String(rule.ruleId || "").replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            ) : null}
            {listing.generatedSearchQueries?.length || listing.trustedCompSummary?.generatedSearchQueries?.length ? (
              <div className="mt-3">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Search query preview
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(listing.generatedSearchQueries || listing.trustedCompSummary?.generatedSearchQueries || [])
                    .slice(0, 4)
                    .map((query) => (
                      <span
                        key={query}
                        className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300"
                      >
                        {query}
                      </span>
                    ))}
                </div>
              </div>
            ) : null}
            {listing.generatedSearchQueryTelemetry?.length || listing.trustedCompSummary?.generatedSearchQueryTelemetry?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {(listing.generatedSearchQueryTelemetry || listing.trustedCompSummary?.generatedSearchQueryTelemetry || [])
                  .slice(0, 4)
                  .map((item: any) => (
                    <span
                      key={`${item.type}-${item.query}`}
                      className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300"
                    >
                      {item.type}: {item.score}
                    </span>
                  ))}
              </div>
            ) : null}
            {listing.enrichmentStages?.length || listing.trustedCompSummary?.enrichmentStages?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {(listing.enrichmentStages || listing.trustedCompSummary?.enrichmentStages || [])
                  .slice(0, 4)
                  .map((stage: any) => (
                    <span
                      key={`${stage.stage}-${stage.query}`}
                      className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-200"
                    >
                      {String(stage.stage || "").replace(/_/g, " ")}: {stage.status || "skipped"}
                    </span>
                  ))}
              </div>
            ) : null}
            {listing.trustedCompSummary?.rejectionReasons &&
            Object.keys(listing.trustedCompSummary.rejectionReasons).length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(listing.trustedCompSummary.rejectionReasons).map(([reason, count]) => (
                  <span
                    key={reason}
                    className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300"
                  >
                    {reason.replace(/_/g, " ")}: {count}
                  </span>
                ))}
              </div>
            ) : null}
            {listing.trustedCompSummary?.saturationFlags ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(listing.trustedCompSummary.saturationFlags)
                  .filter(([, value]) => Boolean(value))
                  .map(([flag]) => (
                    <span
                      key={flag}
                      className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-200"
                    >
                      {flag.replace(/([A-Z])/g, " $1").toLowerCase()}
                    </span>
                  ))}
              </div>
            ) : null}
            {listing.trustedCompSummary?.identityConfidence?.matchedKeywords?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {listing.trustedCompSummary.identityConfidence.matchedKeywords.slice(0, 8).map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-200"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            ) : null}
            {listing.trustedCompSummary?.rejectionDetails?.length ? (
              <div className="mt-3 space-y-1">
                {listing.trustedCompSummary.rejectionDetails.slice(0, 3).map((detail, index) => (
                  <p key={`${detail.reason}-${index}`} className="text-xs text-zinc-400">
                    Rejected: {detail.reason.replace(/_/g, " ")}
                    {detail.failedToken ? ` (${detail.failedToken})` : ""}
                    {detail.poisonedKeyword ? ` (${detail.poisonedKeyword})` : ""}
                  </p>
                ))}
              </div>
            ) : null}
            {listing.engineTelemetry?.confidenceBreakdown?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {listing.engineTelemetry.confidenceBreakdown.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold text-zinc-300"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </details>
        </div>
      </div>
    </section>
  );
}

export function MarketIntelligenceCard({ listing }: { listing: NormalizedListing }) {
  const styles = getDemandStyles(listing.demandLevel);
  const confidence = getConfidenceDisplay(listing.confidenceScore);
  const marketConfidence = getConfidenceDisplay(listing.marketConfidence?.value);
  const animatedConfidence = useAnimatedNumber(confidence.value);
  const animatedMarketConfidence = useAnimatedNumber(marketConfidence.value);
  const analytics = listing.sourcingAnalytics;

  return (
    <section className={`rounded-3xl border p-5 sm:p-6 ${styles.card}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${styles.dot}`} />
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${styles.dot}`} />
          </span>
          <span className="text-sm font-medium text-zinc-200">Market Intel</span>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${styles.badge}`}>
          {listing.demandLevel}
        </span>
      </div>
      <div className="mt-5 rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            AI Confidence
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${confidence.color}`}>
            {Math.round(animatedConfidence)}%
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${confidence.bar}`}
            style={{ width: `${animatedConfidence}%` }}
          />
        </div>
        <p className="mt-3 text-xs font-medium text-zinc-300">{confidence.label}</p>
        {confidence.note ? (
          <p className="mt-2 text-xs font-semibold text-red-300">{confidence.note}</p>
        ) : null}
      </div>
      <div className="mt-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            Market Confidence
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${marketConfidence.color}`}>
            {Math.round(animatedMarketConfidence)}%
          </span>
        </div>
        <p className="mt-3 text-xs font-medium text-zinc-300">
          {listing.marketConfidence?.label || marketConfidence.label}
        </p>
        {listing.recommendedMarketplace?.platform ? (
          <p className="mt-2 text-xs text-zinc-400">
            Recommended:{" "}
            <span className="font-semibold text-white">{listing.recommendedMarketplace.platform}</span>
          </p>
        ) : null}
        {listing.upc ? (
          <p className="mt-2 break-all text-xs text-zinc-500">UPC: {listing.upc}</p>
        ) : null}
      </div>
      {listing.marketplaceEligibility ? (
        <div className="mt-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              Marketplace Eligibility
            </span>
            <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold text-zinc-300">
              MVP rules
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {listing.marketplaceEligibility.platforms.map((item) => (
              <div
                key={item.platform}
                className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-white">{item.platform}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${getEligibilityClass(item.status)}`}>
                    {item.status}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-zinc-400">{item.reason}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
            <div>
              <p className="font-semibold text-emerald-300">Best</p>
              <p className="mt-1 text-zinc-400">
                {listing.marketplaceEligibility.bestPlatformsToList.join(", ") || "None yet"}
              </p>
            </div>
            <div>
              <p className="font-semibold text-amber-300">Approval</p>
              <p className="mt-1 text-zinc-400">
                {listing.marketplaceEligibility.approvalNeeded.join(", ") || "None flagged"}
              </p>
            </div>
            <div>
              <p className="font-semibold text-red-300">Avoid</p>
              <p className="mt-1 text-zinc-400">
                {listing.marketplaceEligibility.avoidListingOn.join(", ") || "None flagged"}
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {analytics ? (
        <div className="mt-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              Sourcing Analytics
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${getRiskBadgeClass(analytics.riskLevel.label)}`}>
              {analytics.riskLevel.label}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
            <div>
              <p className="text-zinc-500">ROI</p>
              <p className="mt-1 font-semibold text-emerald-300">
                {Number.isFinite(Number(analytics.roiPercentage)) && Number(analytics.roiPercentage) !== 0
                  ? `${Math.round(Number(analytics.roiPercentage))}%`
                  : "Est."}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Monthly sales</p>
              <p className="mt-1 font-semibold text-white">
                {Math.max(0, Math.round(Number(analytics.estimatedMonthlySales) || 0))}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Best buy</p>
              <p className="mt-1 font-semibold text-sky-300">
                {formatCompactMoney(analytics.bestBuyPrice)}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Collector</p>
              <p className="mt-1 font-semibold text-amber-300">
                {analytics.collectorScore.score}/100
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Difficulty</p>
              <p className="mt-1 font-semibold text-white">
                {analytics.retailArbitrageDifficulty.label}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Trend</p>
              <p className="mt-1 font-semibold text-white">{analytics.trendSignal}</p>
            </div>
          </div>
        </div>
      ) : null}
      <p className="mt-5 text-sm leading-6 text-zinc-200 sm:text-base">{listing.sourcingTip}</p>
    </section>
  );
}

export function CompsTable({ listing }: { listing: NormalizedListing }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/20">
      <div className="border-b border-zinc-800 px-5 py-4 sm:px-6">
        <h3 className="text-sm font-semibold tracking-normal text-white sm:text-base">
          Comparable Sales ({listing.comps.length})
        </h3>
      </div>
      {listing.comps.length === 0 ? (
        <div className="px-5 py-8 text-sm text-zinc-400 sm:px-6">No comparable sales found.</div>
      ) : (
        <div className="divide-y divide-zinc-800">
          {listing.comps.map((comp) => (
            <div
              key={`${comp.sourcePlatform}-${comp.dateSold}-${comp.price}`}
              className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{comp.sourcePlatform}</p>
                <p className="mt-1 break-words text-sm text-zinc-400">{comp.dateSold}</p>
              </div>
              <p className="shrink-0 text-base font-semibold text-emerald-400">
                ${comp.price.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function getLoadingSteps(progress: number) {
  return [
    { label: "Analyzing product...", doneAt: 48 },
    { label: "Reading packaging text...", doneAt: 62 },
    { label: "Calculating resale metrics...", doneAt: 78 }
  ].map((step) => ({
    ...step,
    isActive: progress >= step.doneAt - 18,
    isDone: progress >= step.doneAt
  }));
}

export function DashboardSkeleton({
  stage = "Analyzing product...",
  progress = 0
}: {
  stage?: string;
  progress?: number;
}) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
  const steps = getLoadingSteps(safeProgress);

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-emerald-500/20 bg-zinc-900 p-5 shadow-2xl shadow-black/20 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10">
            <div className="absolute inset-2 rounded-full border-2 border-emerald-400/30 border-t-emerald-300 motion-safe:animate-spin" />
            <div className="absolute inset-4 rounded-full bg-emerald-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">{stage || "Analyzing product..."}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Hold tight while Boss Listers reads the photo and builds resale metrics.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold text-emerald-300">
            {safeProgress}%
          </span>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all duration-500 ease-out"
            style={{ width: `${safeProgress}%` }}
          />
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.label}
              className={`flex min-h-11 items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                step.isActive
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                  : "border-zinc-800 bg-zinc-950/60 text-zinc-500"
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  step.isDone
                    ? "bg-emerald-300"
                    : step.isActive
                      ? "bg-amber-300 motion-safe:animate-pulse"
                      : "bg-zinc-700"
                }`}
              />
              {step.label}
            </div>
          ))}
        </div>
      </section>

      <section className="animate-pulse overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
        <div className="relative aspect-video w-full overflow-hidden bg-zinc-800">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-zinc-700/40 to-transparent motion-safe:animate-pulse" />
          <div className="absolute inset-x-4 bottom-4 space-y-3">
            <div className="h-6 w-24 rounded-full bg-zinc-700" />
            <div className="h-6 w-4/5 rounded bg-zinc-700" />
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((tile) => (
            <div key={tile} className="min-h-24 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="h-3 w-20 rounded bg-zinc-700" />
              <div className="mt-3 h-7 w-24 rounded bg-zinc-800" />
              <div className="mt-3 h-3 w-28 rounded bg-zinc-800" />
            </div>
          ))}
        </div>
      </section>
      <section className="animate-pulse rounded-3xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="h-4 w-28 rounded bg-zinc-700" />
          <div className="h-7 w-16 rounded-full bg-zinc-800" />
        </div>
        <div className="mt-5 space-y-3">
          <div className="h-12 rounded-2xl bg-zinc-800" />
          <div className="h-4 w-full rounded bg-zinc-800" />
          <div className="h-4 w-5/6 rounded bg-zinc-800" />
        </div>
      </section>
      <section className="animate-pulse overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-5 py-4 sm:px-6">
          <div className="h-4 w-40 rounded bg-zinc-700" />
        </div>
        <div className="divide-y divide-zinc-800">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
              <div className="space-y-2">
                <div className="h-4 w-28 rounded bg-zinc-700" />
                <div className="h-3 w-20 rounded bg-zinc-800" />
              </div>
              <div className="h-5 w-16 rounded bg-zinc-700" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
