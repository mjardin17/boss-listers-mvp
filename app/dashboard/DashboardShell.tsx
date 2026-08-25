"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DecisionBanner } from "../DashboardComponents";
import { ResellerCalculator } from "../ResellerCalculator";
import { loadScanHistoryRepository } from "../saas/repositories";
import type { ScanRecord } from "../saas/schemas";
import ItemActionBar from "./ItemActionBar";
import { CompsTable, MarketIntelligenceCard, ProfitSummaryCard } from "./components";
import { CorrectionPortal } from "../../components/dashboard/CorrectionPortal";
import { SalesHistoryImportPanel } from "../../components/dashboard/SalesHistoryImportPanel";
import type { NormalizedListing } from "./types";

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value = 0) {
  return `$${Math.max(0, value).toFixed(2)}`;
}

function getListingProfit(listing?: NormalizedListing | null) {
  return numeric(listing?.estimatedProfit ?? listing?.profitPotential, 0);
}

function getListingRoi(listing?: NormalizedListing | null) {
  return numeric(listing?.roiPercentage ?? listing?.sourcingAnalytics?.roiPercentage, 0);
}

function getDecision(listing?: NormalizedListing | null) {
  const explicit = String(listing?.recommendation || "").toUpperCase();
  if (explicit === "HOT FIND") return "BUY";
  if (explicit === "BUY" || explicit === "HOLD" || explicit === "PASS" || explicit === "SKIP") {
    return explicit === "SKIP" ? "PASS" : explicit;
  }

  const profit = getListingProfit(listing);
  const confidence = numeric(listing?.confidenceScore, 0);
  const demand = String(listing?.demandLevel || "").toLowerCase();
  if (profit <= 0 || demand === "low") return "PASS";
  if (profit >= 12 && confidence >= 45) return "BUY";
  return "HOLD";
}

function getMicrocopy(listing: NormalizedListing) {
  const profit = getListingProfit(listing);
  const demand = String(listing.demandLevel || "").toLowerCase();

  if (demand === "high" && profit >= 20) {
    return "🔥 Elite Sourcing Target — Fast-moving category velocity.";
  }
  if (demand === "high") {
    return "⚡ Strong shelf opportunity — Velocity outpaces liquidation risk.";
  }
  if (profit < 10 || numeric(listing.confidenceScore, 0) < 45) {
    return "🛑 Weak historical consistency — Low liquidity. Leave on shelf.";
  }
  return "⚡ Strong shelf opportunity — Velocity outpaces liquidation risk.";
}

function scansPerMinute(scans: ScanRecord[]) {
  if (scans.length < 2) return scans.length;
  const times = scans
    .map((scan) => new Date(scan.timestamp).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => a - b);
  if (times.length < 2) return scans.length;
  const elapsedMinutes = Math.max((times[times.length - 1] - times[0]) / 60000, 1);
  return scans.length / elapsedMinutes;
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
    const delta = value - startValue;
    const startTime = performance.now();
    let frame = 0;

    function tick(now: number) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(startValue + delta * eased);
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

export default function DashboardShell({
  initialListingData
}: {
  initialListingData: NormalizedListing;
}) {
  const router = useRouter();
  const [listingData, setListingData] = useState<NormalizedListing | null>(
    initialListingData
  );
  const [sessionScans, setSessionScans] = useState<ScanRecord[]>([]);
  const hapticHotFindRef = useRef(false);
  const sessionMetrics = useMemo(() => {
    const currentProfit = getListingProfit(listingData);
    const allScans = sessionScans;
    const buyScans = allScans.filter((scan) => getDecision(scan.listing) === "BUY");
    const projectedHaulProfit = buyScans.reduce(
      (sum, scan) => sum + getListingProfit(scan.listing),
      0
    );
    const sessionAverageProfit = allScans.length
      ? allScans.reduce((sum, scan) => sum + Math.max(0, getListingProfit(scan.listing)), 0) /
        allScans.length
      : 0;
    const newestFirst = [...allScans].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    let consecutivePassCount = 0;
    for (const scan of newestFirst) {
      if (getDecision(scan.listing) !== "PASS") break;
      consecutivePassCount += 1;
    }

    return {
      projectedHaulProfit,
      sessionScanCount: allScans.length,
      scansPerMinute: scansPerMinute(allScans),
      consecutivePassCount,
      isHotFind:
        Boolean(listingData) &&
        currentProfit > 15 &&
        sessionAverageProfit > 0 &&
        currentProfit >= sessionAverageProfit * 2
    };
  }, [listingData, sessionScans]);
  const animatedProjectedHaul = useAnimatedNumber(sessionMetrics.projectedHaulProfit);
  const decision = getDecision(listingData);
  const decisionAnimation =
    decision === "BUY"
      ? "animate-buy-pulse"
      : decision === "HOLD"
        ? "animate-hold-pulse"
        : "";

  useEffect(() => {
    let mounted = true;
    void loadScanHistoryRepository().then((scans) => {
      if (mounted) setSessionScans(scans);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionMetrics.isHotFind || hapticHotFindRef.current) return;
    hapticHotFindRef.current = true;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([100, 50, 100]);
    }
  }, [sessionMetrics.isHotFind]);

  function handleScanAnother() {
    setListingData(null);
    router.push("/");
  }

  if (!listingData) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 text-zinc-300">
        Listing discarded.
      </section>
    );
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/20">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Projected haul
                </p>
                <p className="mt-1 text-sm font-black text-emerald-300">
                  {money(animatedProjectedHaul)}
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">Scans</p>
                <p className="mt-1 text-sm font-black text-white">
                  {sessionMetrics.sessionScanCount}
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">SPM</p>
                <p className="mt-1 text-sm font-black text-sky-300">
                  {sessionMetrics.scansPerMinute.toFixed(1)}
                </p>
              </div>
            </div>
            {sessionMetrics.consecutivePassCount >= 3 ? (
              <p className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs font-semibold text-zinc-300">
                💎 Keep pushing. Profitable store shelves usually cluster.
              </p>
            ) : null}
          </section>

          <ProfitSummaryCard listing={listingData} />
          <CorrectionPortal listing={listingData} onCorrectionApplied={setListingData} />
          {(listingData as any).matchedPersonalSale ? (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
              Matched your previous sale: ${Number((listingData as any).matchedPersonalSale.sale?.soldPrice).toFixed(2)}
              {" "}on {(listingData as any).matchedPersonalSale.sale?.soldDate || "unknown date"}
              {" "}via {(listingData as any).matchedPersonalSale.sale?.platform || "unknown platform"}.
              <span className="block text-xs text-emerald-200">
                {(listingData as any).matchedPersonalSale.matchType || "USER_VERIFIED_SALE"} / {(listingData as any).matchedPersonalSale.matchScore ?? 0}% match confidence.
                {" "}Confidence boost +{(listingData as any).matchedPersonalSale.confidenceBoost ?? 0}. {(listingData as any).matchedPersonalSale.matchReason}
              </span>
              {Array.isArray((listingData as any).matchedPersonalSale.matchingSignals) && (listingData as any).matchedPersonalSale.matchingSignals.length ? (
                <span className="mt-2 block text-xs text-emerald-200">
                  Match signals: {(listingData as any).matchedPersonalSale.matchingSignals.slice(0, 4).join("; ")}
                </span>
              ) : null}
              {Array.isArray((listingData as any).matchedPersonalSale.rejectedSignals) && (listingData as any).matchedPersonalSale.rejectedSignals.length ? (
                <span className="mt-1 block text-xs text-amber-200">
                  Reduced confidence: {(listingData as any).matchedPersonalSale.rejectedSignals.slice(0, 4).join("; ")}
                </span>
              ) : null}
            </div>
          ) : null}
          <SalesHistoryImportPanel />
          <p className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-200">
            {getMicrocopy(listingData)}
          </p>
          {sessionMetrics.isHotFind ? (
            <div className="animate-hot-find rounded-2xl border border-emerald-400/50 bg-emerald-400/15 px-4 py-3 text-center text-sm font-black text-emerald-100">
              HOT FIND
            </div>
          ) : null}
          <div className={decisionAnimation}>
            <DecisionBanner listing={listingData} hotFind={sessionMetrics.isHotFind} />
          </div>
          <ResellerCalculator listing={listingData} />
          <button
            type="button"
            onClick={handleScanAnother}
            className="relative z-[60] block min-h-14 w-full rounded-2xl border-2 border-white bg-red-600 px-4 py-4 text-center text-base font-black uppercase tracking-wide text-white shadow-[0_0_28px_rgba(220,38,38,0.55)] transition hover:bg-red-500"
          >
            Scan Another
          </button>
          <CompsTable listing={listingData} />
        </div>

        <MarketIntelligenceCard listing={listingData} />
      </div>

      <ItemActionBar
        onDiscard={() => setListingData(null)}
        onSave={() => console.log("Exporting...")}
      />
    </>
  );
}
