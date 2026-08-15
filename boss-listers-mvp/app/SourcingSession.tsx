"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StoredScan } from "./ScanHistory";
import { getFreeTierScanUsage } from "./saas/monetization";
import {
  buildResellerSessionMetrics,
  getScanConfidence,
  getScanRoi,
  getTodaySessionScans,
  isHotFindAgainstSession,
  persistSessionStreakSnapshot
} from "./saas/sessionMetrics";

function money(value: number | null | undefined = undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "Unavailable";
  return `$${Math.max(0, Number(value)).toFixed(2)}`;
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
    let frame = 0;
    const startTime = performance.now();

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

function confidence(scan: StoredScan) {
  return getScanConfidence(scan);
}

function roi(scan: StoredScan) {
  return getScanRoi(scan);
}

function roiLabel(value: number) {
  return Number.isFinite(value) && value > 0 ? `${Math.round(value)}%` : "N/A";
}

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function exportSession(scans: StoredScan[], format: "json" | "csv") {
  if (typeof window === "undefined") return;
  const sessionScans = getTodaySessionScans(scans);
  const summary = buildResellerSessionMetrics(scans);
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        sessionDate: stamp,
        summary: {
          totalScans: summary.totalScans,
          totalEstimatedProfit: Number(summary.totalEstimatedProfit.toFixed(2)),
          averageRoi: Number(summary.averageRoi.toFixed(1)),
          buyCount: summary.buyCount,
          passCount: summary.passCount,
          highConfidenceFlipsCount: summary.highConfidenceFlipsCount,
          bestScanOfDay: summary.bestScanOfDay?.listing.itemTitle || "",
          highestProfitItem: summary.highestProfitItem?.listing.itemTitle || "",
          lowestConfidenceItem: summary.lowestConfidenceItem?.listing.itemTitle || ""
        },
        scans: sessionScans
      },
      null,
      2
    );
    downloadFile(`boss-listers-session-${stamp}.json`, "application/json", payload);
    return;
  }

  const rows = [
    [
      "timestamp",
      "itemTitle",
      "averageSalePrice",
      "profitPotential",
      "roiPercentage",
      "confidenceScore",
      "demandLevel",
      "recommendedMarketplace",
      "riskLevel",
      "bestBuyPrice",
      "trendSignal"
    ],
    ...sessionScans.map((scan) => [
      scan.timestamp,
      scan.listing.itemTitle,
      scan.listing.averageSalePrice,
      scan.listing.profitPotential,
      roi(scan),
      confidence(scan),
      scan.listing.demandLevel,
      scan.listing.recommendedMarketplace?.platform || "",
      scan.listing.sourcingAnalytics?.riskLevel.label || "",
      scan.listing.sourcingAnalytics?.bestBuyPrice || 0,
      scan.listing.sourcingAnalytics?.trendSignal || ""
    ])
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  downloadFile(`boss-listers-session-${stamp}.csv`, "text/csv", csv);
}

function downloadFile(filename: string, type: string, content: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function SourcingSessionPanel({
  scans,
  onOpen
}: {
  scans: StoredScan[];
  onOpen: (scan: StoredScan) => void;
}) {
  const summary = useMemo(() => buildResellerSessionMetrics(scans), [scans]);
  const scanUsage = useMemo(() => getFreeTierScanUsage(scans), [scans]);
  const animatedProjectedHaul = useAnimatedNumber(summary.projectedHaulProfit);
  const animatedTotalProfit = useAnimatedNumber(summary.totalEstimatedProfit);
  const animatedAverageRoi = useAnimatedNumber(summary.averageRoi);
  const newestScan = summary.sessionScans[0];
  const hotFind = newestScan ? isHotFindAgainstSession(newestScan.listing, summary.sessionScans) : null;
  const [streakSnapshot, setStreakSnapshot] = useState<ReturnType<
    typeof persistSessionStreakSnapshot
  > | null>(null);

  useEffect(() => {
    setStreakSnapshot(persistSessionStreakSnapshot(scans));
  }, [scans]);

  if (!summary.totalScans) {
    return (
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/20 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Sourcing session</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Today&apos;s scan totals will appear here as you source.
            </p>
          </div>
          <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs font-medium text-zinc-300">
            0 scans
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/20 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Sourcing session</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Today&apos;s estimated haul from saved scans on this device.
          </p>
        </div>
        <div className="flex gap-2">
          {hotFind?.isHotFind ? (
            <span className="inline-flex min-h-10 items-center rounded-xl border border-emerald-400/40 bg-emerald-400/15 px-3 text-xs font-black text-emerald-200 shadow-[0_0_18px_rgba(52,211,153,0.22)] motion-safe:animate-pulse">
              HOT FIND
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => exportSession(scans, "json")}
            className="min-h-10 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-xs font-semibold text-zinc-200 transition hover:border-emerald-400/60"
          >
            JSON
          </button>
          <button
            type="button"
            onClick={() => exportSession(scans, "csv")}
            className="min-h-10 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-xs font-semibold text-zinc-200 transition hover:border-emerald-400/60"
          >
            CSV
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Projected haul</p>
          <p className="mt-1 text-sm font-bold text-emerald-300">
            {money(animatedProjectedHaul)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Items scanned</p>
          <p className="mt-1 text-sm font-bold text-white">{summary.totalScans}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Best find today</p>
          <p className="mt-1 line-clamp-1 text-sm font-bold text-sky-300">
            {summary.highestProfitItem
              ? `${money(summary.highestProfitItem.listing.profitPotential)} profit`
              : "No profitable find yet"}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">SPM</p>
          <p className="mt-1 text-sm font-bold text-white">
            {summary.scansPerMinute.toFixed(1)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Top confidence</p>
          <p className="mt-1 text-sm font-bold text-sky-300">
            {summary.highestConfidenceItem
              ? `${confidence(summary.highestConfidenceItem)}%`
              : "N/A"}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Avg ROI</p>
          <p className="mt-1 text-sm font-bold text-emerald-300">
            {roiLabel(animatedAverageRoi)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">BUY scans</p>
          <p className="mt-1 text-sm font-bold text-emerald-300">{summary.totalBuyScans}</p>
        </div>
      </div>

      {summary.consecutivePassCount >= 3 ? (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-300">
          Keep scanning — profitable shelves usually cluster.
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Scans</p>
          <p className="mt-2 text-xl font-semibold text-white">{summary.totalScans}</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Haul Profit</p>
          <p className="mt-2 text-xl font-semibold text-emerald-300">
            {money(animatedProjectedHaul)}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Avg ROI</p>
          <p className="mt-2 text-xl font-semibold text-sky-300">
            {roiLabel(animatedAverageRoi)}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Low Conf.</p>
          <p className="mt-2 text-xl font-semibold text-amber-300">
            {summary.lowestConfidenceItem ? `${confidence(summary.lowestConfidenceItem)}%` : "N/A"}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">BUY / PASS</p>
          <p className="mt-2 text-xl font-semibold text-white">
            {summary.buyCount} / {summary.passCount}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">High-Conf Flips</p>
          <p className="mt-2 text-xl font-semibold text-emerald-300">
            {summary.highConfidenceFlipsCount}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Confidence</p>
          <p className="mt-2 text-sm font-semibold text-zinc-200">
            H {summary.confidenceIndicators.high} / M {summary.confidenceIndicators.medium} / L{" "}
            {summary.confidenceIndicators.low}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Demand</p>
          <p className="mt-2 text-sm font-semibold text-zinc-200">
            H {summary.demandIndicators.high} / M {summary.demandIndicators.medium} / L{" "}
            {summary.demandIndicators.low}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">
              Free tier scans today
            </p>
            <p className="mt-1 text-sm font-semibold text-zinc-200">
              {scanUsage.usedToday} used / {scanUsage.remaining} remaining
            </p>
          </div>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
            {streakSnapshot?.dailyScanStreak || summary.totalScansToday} scan streak
          </span>
          {summary.bestScanOfDay ? (
            <button
              type="button"
              onClick={() => summary.bestScanOfDay && onOpen(summary.bestScanOfDay)}
              className="min-h-10 rounded-xl border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 transition hover:border-emerald-400/60"
            >
              Best scan of the day
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
          <p className="text-[10px] uppercase tracking-widest text-emerald-300">
            Session profit potential
          </p>
          <p className="mt-2 text-lg font-bold text-emerald-200">
            {money(animatedTotalProfit)}
          </p>
        </div>
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-3">
          <p className="text-[10px] uppercase tracking-widest text-sky-300">Best ROI today</p>
          <p className="mt-2 text-lg font-bold text-sky-200">
            {summary.bestRoiScan ? roiLabel(roi(summary.bestRoiScan)) : "N/A"}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3">
          <p className="text-[10px] uppercase tracking-widest text-amber-300">Current streak</p>
          <p className="mt-2 text-sm font-bold text-amber-200">
            {summary.consecutiveProfitableScans
              ? `${summary.consecutiveProfitableScans} profitable finds in a row`
              : "Next profitable scan starts a streak"}
          </p>
          {summary.hotStreakActive ? (
            <p className="mt-1 text-xs font-semibold text-amber-300">Hot streak active</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={!summary.highestProfitItem}
          onClick={() => summary.highestProfitItem && onOpen(summary.highestProfitItem)}
          className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-left transition hover:border-emerald-400/50 disabled:opacity-60"
        >
          <p className="text-[10px] uppercase tracking-widest text-emerald-300">
            Highest profit item
          </p>
          <p className="mt-2 line-clamp-2 text-sm font-semibold text-white">
            {summary.highestProfitItem?.listing.itemTitle || "No scans yet"}
          </p>
          <p className="mt-1 text-xs text-emerald-200">
            {money(summary.highestProfitItem?.listing.profitPotential || 0)}
          </p>
        </button>
        <button
          type="button"
          disabled={!summary.lowestConfidenceItem}
          onClick={() => summary.lowestConfidenceItem && onOpen(summary.lowestConfidenceItem)}
          className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-left transition hover:border-amber-400/50 disabled:opacity-60"
        >
          <p className="text-[10px] uppercase tracking-widest text-amber-300">
            Lowest confidence item
          </p>
          <p className="mt-2 line-clamp-2 text-sm font-semibold text-white">
            {summary.lowestConfidenceItem?.listing.itemTitle || "No scans yet"}
          </p>
          <p className="mt-1 text-xs text-amber-200">
            {summary.lowestConfidenceItem ? `${confidence(summary.lowestConfidenceItem)}% confidence` : ""}
          </p>
        </button>
      </div>

      {summary.topFinds.length ? (
        <div className="mt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-white">Top Finds Today</h3>
            <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-medium text-zinc-400">
              {summary.topFinds.length}
            </span>
          </div>
          <div className="space-y-2">
            {summary.topFinds.map((scan, index) => (
              <button
                key={scan.id}
                type="button"
                onClick={() => onOpen(scan)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-left transition hover:border-emerald-400/50"
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                    #{index + 1}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-white">
                    {scan.listing.itemTitle}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    ROI {roiLabel(roi(scan))} / {confidence(scan)}% confidence
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold text-emerald-300">
                  {money(scan.listing.profitPotential)}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
