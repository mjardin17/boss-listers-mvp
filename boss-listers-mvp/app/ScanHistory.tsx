"use client";

import { useMemo, useState } from "react";
import type { NormalizedListing } from "./types";
import {
  loadScanHistoryRepository,
  saveScanToHistoryRepository
} from "./saas/repositories";
import type { ScanRecord } from "./saas/schemas";

export type StoredScan = ScanRecord;

export function loadScanHistory(): Promise<StoredScan[]> {
  return loadScanHistoryRepository();
}

export function saveScanToHistory(listing: NormalizedListing): Promise<StoredScan[]> {
  return saveScanToHistoryRepository(listing);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent scan";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function weakHistoryTitle(value = "") {
  const cleaned = String(value || "").trim().toLowerCase();
  return (
    !cleaned ||
    /^\d{4}-\d{2}-\d{2}t\d{2}/.test(cleaned) ||
    /^(scanned item|unknown|unknown item|item|product)$/.test(cleaned)
  );
}

function scanDisplayTitle(scan: StoredScan) {
  const listing = scan.listing;
  if (listing.confirmedProductIdentity?.title) return listing.confirmedProductIdentity.title;
  if (!weakHistoryTitle(listing.itemTitle)) return listing.itemTitle;
  if (listing.brand && listing.upc) return `${listing.brand} UPC ${listing.upc}`;
  if (listing.upc) return `UPC ${listing.upc}`;
  if (listing.brand) return `${listing.brand} item`;
  return "Unidentified item";
}

function moneyOrUnavailable(value: number | null | undefined, label: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? `${label} $${parsed.toFixed(2)}` : `${label} unavailable`;
}

function sourceStoreLabel(value = "") {
  if (value === "WALMART") return "Walmart";
  if (value === "DOLLAR_TREE") return "Dollar Tree";
  if (value === "MANUAL") return "Manual Cost";
  return "";
}

function numericMetric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : -1;
}

function scanPlatform(scan: StoredScan) {
  return (
    scan.listing.recommendedMarketplace?.platform ||
    scan.listing.lookupSource ||
    scan.listing.sourceStoreType ||
    "Unassigned"
  );
}

export function ScanHistory({
  scans,
  onOpen
}: {
  scans: StoredScan[];
  onOpen: (scan: StoredScan) => void;
}) {
  const [sortMode, setSortMode] = useState<"recent" | "roi" | "confidence" | "velocity">("recent");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const platforms = useMemo(
    () => Array.from(new Set(scans.map(scanPlatform).filter(Boolean))).slice(0, 8),
    [scans]
  );
  const visibleScans = useMemo(() => {
    return scans
      .filter((scan) => platformFilter === "all" || scanPlatform(scan) === platformFilter)
      .slice()
      .sort((a, b) => {
        if (sortMode === "roi") return numericMetric(b.listing.roiPercentage) - numericMetric(a.listing.roiPercentage);
        if (sortMode === "confidence") return numericMetric(b.listing.confidenceScore) - numericMetric(a.listing.confidenceScore);
        if (sortMode === "velocity") {
          return numericMetric(b.listing.engineTelemetry?.compCount) - numericMetric(a.listing.engineTelemetry?.compCount);
        }
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
  }, [platformFilter, scans, sortMode]);
  const comparedScans = compareIds
    .map((id) => scans.find((scan) => scan.id === id))
    .filter((scan): scan is StoredScan => Boolean(scan));

  if (!scans.length) return null;

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/20 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Recent scans</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Reopen a previous result stored on this device.
          </p>
        </div>
        <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs font-medium text-zinc-300">
          {scans.length}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {(["recent", "roi", "confidence", "velocity"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setSortMode(mode)}
            className={`rounded-xl border px-3 py-2 font-semibold capitalize ${
              sortMode === mode
                ? "border-emerald-400 bg-emerald-400 text-zinc-950"
                : "border-zinc-700 bg-zinc-950 text-zinc-300"
            }`}
          >
            {mode}
          </button>
        ))}
      </div>
      {platforms.length ? (
        <select
          value={platformFilter}
          onChange={(event) => setPlatformFilter(event.target.value)}
          className="mt-3 min-h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-xs font-semibold text-zinc-200 outline-none focus:border-emerald-400"
        >
          <option value="all">All platforms</option>
          {platforms.map((platform) => (
            <option key={platform} value={platform}>
              {platform}
            </option>
          ))}
        </select>
      ) : null}
      {comparedScans.length ? (
        <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
          <p className="font-semibold text-white">Compare scans</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {comparedScans.map((scan) => (
              <div key={scan.id} className="rounded-xl bg-zinc-900 p-2">
                <p className="line-clamp-1 font-semibold text-zinc-100">{scanDisplayTitle(scan)}</p>
                <p className="mt-1 text-zinc-400">
                  Profit {moneyOrUnavailable(scan.listing.profitPotential, "")} ·{" "}
                  {scan.listing.confidenceScore ?? 0}% confidence ·{" "}
                  {scan.listing.engineTelemetry?.velocityScore || "DEAD"} velocity
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800">
        {visibleScans.map((scan) => (
          <button
            key={scan.id}
            type="button"
            onClick={() => onOpen(scan)}
            className="flex w-full items-center gap-3 bg-zinc-950 p-3 text-left transition hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              {scan.listing.thumbnailUrl ? (
                <img
                  src={scan.listing.thumbnailUrl}
                  alt=""
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                  No img
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold text-white">
                {scanDisplayTitle(scan)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {[scan.listing.upc ? `UPC ${scan.listing.upc}` : "", formatTimestamp(scan.timestamp)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-zinc-900 px-2 py-1 text-zinc-300">
                  {moneyOrUnavailable(scan.listing.averageSalePrice, "Avg")}
                </span>
                <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-emerald-300">
                  {moneyOrUnavailable(scan.listing.profitPotential, "Profit")}
                </span>
                <span className="rounded-full bg-sky-400/10 px-2 py-1 text-sky-300">
                  {scan.listing.recommendation || scan.listing.demandLevel || "MANUAL_REVIEW"}
                </span>
                {scan.listing.confidenceScore != null ? (
                  <span className="rounded-full bg-amber-400/10 px-2 py-1 text-amber-300">
                    {scan.listing.confidenceScore}% confidence
                  </span>
                ) : null}
                {sourceStoreLabel(scan.listing.sourceStoreType) ? (
                  <span className="rounded-full bg-zinc-900 px-2 py-1 text-zinc-300">
                    {sourceStoreLabel(scan.listing.sourceStoreType)}
                  </span>
                ) : null}
                {scan.listing.engineTelemetry?.velocityScore ? (
                  <span className="rounded-full bg-zinc-900 px-2 py-1 text-zinc-300">
                    {scan.listing.engineTelemetry.velocityScore} velocity
                  </span>
                ) : null}
                {scan.listing.engineTelemetry?.compCount != null ? (
                  <span className="rounded-full bg-zinc-900 px-2 py-1 text-zinc-300">
                    {scan.listing.engineTelemetry.compCount} comps
                  </span>
                ) : null}
                {scan.listing.trustedCompSummary?.acceptedComps != null ? (
                  <span className="rounded-full bg-zinc-900 px-2 py-1 text-zinc-300">
                    {scan.listing.trustedCompSummary.acceptedComps} trusted
                  </span>
                ) : null}
                {scan.listing.resolvedCostBasis != null ? (
                  <span className="rounded-full bg-zinc-900 px-2 py-1 text-zinc-300">
                    Cost ${scan.listing.resolvedCostBasis.toFixed(2)}
                  </span>
                ) : null}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    setCompareIds((current) =>
                      current.includes(scan.id)
                        ? current.filter((id) => id !== scan.id)
                        : [...current.slice(-1), scan.id]
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    setCompareIds((current) =>
                      current.includes(scan.id)
                        ? current.filter((id) => id !== scan.id)
                        : [...current.slice(-1), scan.id]
                    );
                  }}
                  className={`rounded-full px-2 py-1 ${
                    compareIds.includes(scan.id)
                      ? "bg-emerald-400 text-zinc-950"
                      : "bg-zinc-900 text-zinc-300"
                  }`}
                >
                  Compare
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
