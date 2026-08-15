import type { ScanRecord } from "./schemas";
import { localStorageAdapter } from "./storageAdapters";

const SESSION_STREAK_COLLECTION = "boss-listers.sessionStreak.v1";

function isToday(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return false;
  return date.toDateString() === new Date().toDateString();
}

function confidence(scan: ScanRecord) {
  return Math.max(0, Math.min(100, Math.round(Number(scan.listing.confidenceScore) || 0)));
}

function roi(scan: ScanRecord) {
  return Number(scan.listing.roiPercentage ?? scan.listing.sourcingAnalytics?.roiPercentage) || 0;
}

function profit(scan: ScanRecord) {
  return Number(scan.listing.profitPotential) || 0;
}

function demandLevel(scan: ScanRecord) {
  const demand = String(scan.listing.demandLevel || "Unknown").toLowerCase();
  if (demand === "high") return "high";
  if (demand === "medium") return "medium";
  if (demand === "low") return "low";
  return "unknown";
}

function recommendation(scan: ScanRecord) {
  const explicit = String(scan.listing.recommendation || "").toUpperCase();
  if (explicit === "HOT FIND") return "BUY";
  if (explicit === "BUY" || explicit === "HOLD" || explicit === "PASS") return explicit;
  const profit = Number(scan.listing.profitPotential) || 0;
  const scanRoi = roi(scan);
  if (profit >= 20 && scanRoi >= 50 && confidence(scan) >= 60) return "BUY";
  if (profit <= 0 || scanRoi < 15) return "PASS";
  return "HOLD";
}

function scoreScan(scan: ScanRecord) {
  return (
    (Number(scan.listing.profitPotential) || 0) * 4 +
    roi(scan) * 0.4 +
    confidence(scan) * 0.25
  );
}

function isProfitableScan(scan: ScanRecord) {
  return Number(scan.listing.profitPotential) > 0 && recommendation(scan) !== "PASS";
}

function isHotFind(scan: ScanRecord) {
  return (
    String(scan.listing.recommendation || "").toUpperCase() === "HOT FIND" ||
    (Number(scan.listing.profitPotential) >= 25 && roi(scan) >= 60 && confidence(scan) >= 70)
  );
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

function consecutivePassCount(scans: ScanRecord[]) {
  const newestFirst = [...scans].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  let count = 0;
  for (const scan of newestFirst) {
    if (recommendation(scan) !== "PASS") break;
    count += 1;
  }
  return count;
}

export function isHotFindAgainstSession(
  currentListing: { profitPotential?: number | null },
  scans: ScanRecord[]
) {
  const currentProfit = Math.max(0, Number(currentListing.profitPotential) || 0);
  const sessionScans = getTodaySessionScans(scans);
  const priorScans = sessionScans.filter(
    (scan) => Math.abs(profit(scan) - currentProfit) > 0.01
  );
  const comparisonScans = priorScans.length ? priorScans : sessionScans;
  const averageProfit = comparisonScans.length
    ? comparisonScans.reduce((sum, scan) => sum + Math.max(0, profit(scan)), 0) /
      comparisonScans.length
    : 0;
  return {
    isHotFind: averageProfit > 0 && currentProfit >= averageProfit * 2,
    currentProfit,
    sessionAverageProfit: averageProfit
  };
}

export function getTodaySessionScans(scans: ScanRecord[]) {
  return scans.filter((scan) => isToday(scan.timestamp));
}

export function buildResellerSessionMetrics(scans: ScanRecord[]) {
  const sessionScans = getTodaySessionScans(scans);
  const roiValues = sessionScans.map(roi).filter((value) => value > 0);
  const totalEstimatedProfit = sessionScans.reduce(
    (sum, scan) => sum + (Number(scan.listing.profitPotential) || 0),
    0
  );
  const buyCount = sessionScans.filter((scan) => recommendation(scan) === "BUY").length;
  const passCount = sessionScans.filter((scan) => recommendation(scan) === "PASS").length;
  const holdCount = sessionScans.filter((scan) => recommendation(scan) === "HOLD").length;
  const confidenceIndicators = {
    high: sessionScans.filter((scan) => confidence(scan) >= 75).length,
    medium: sessionScans.filter((scan) => confidence(scan) >= 50 && confidence(scan) < 75).length,
    low: sessionScans.filter((scan) => confidence(scan) < 50).length
  };
  const demandIndicators = {
    high: sessionScans.filter((scan) => demandLevel(scan) === "high").length,
    medium: sessionScans.filter((scan) => demandLevel(scan) === "medium").length,
    low: sessionScans.filter((scan) => demandLevel(scan) === "low").length,
    unknown: sessionScans.filter((scan) => demandLevel(scan) === "unknown").length
  };
  const highConfidenceFlipsCount = sessionScans.filter(
    (scan) => recommendation(scan) === "BUY" && confidence(scan) >= 75
  ).length;
  const totalBuyScans = buyCount;
  const projectedHaulProfit = sessionScans
    .filter(isProfitableScan)
    .reduce((sum, scan) => sum + (Number(scan.listing.profitPotential) || 0), 0);
  const newestFirst = [...sessionScans].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  let consecutiveProfitableScans = 0;
  for (const scan of newestFirst) {
    if (!isProfitableScan(scan)) break;
    consecutiveProfitableScans += 1;
  }
  const bestScanOfDay = sessionScans.reduce<ScanRecord | null>(
    (best, scan) => (!best || scoreScan(scan) > scoreScan(best) ? scan : best),
    null
  );
  const bestRoiScan = sessionScans.reduce<ScanRecord | null>(
    (best, scan) => (!best || roi(scan) > roi(best) ? scan : best),
    null
  );
  const highestProfitItem = sessionScans.reduce<ScanRecord | null>(
    (best, scan) =>
      !best || Number(scan.listing.profitPotential) > Number(best.listing.profitPotential)
        ? scan
        : best,
    null
  );
  const lowestConfidenceItem = sessionScans.reduce<ScanRecord | null>(
    (lowest, scan) => (!lowest || confidence(scan) < confidence(lowest) ? scan : lowest),
    null
  );
  const highestConfidenceItem = sessionScans.reduce<ScanRecord | null>(
    (best, scan) => (!best || confidence(scan) > confidence(best) ? scan : best),
    null
  );
  const topFinds = [...sessionScans]
    .sort(
      (a, b) =>
        Number(b.listing.profitPotential) - Number(a.listing.profitPotential) ||
        roi(b) - roi(a)
    )
    .slice(0, 3);

  return {
    sessionScans,
    totalScansToday: sessionScans.length,
    totalScans: sessionScans.length,
    estimatedPotentialProfit: totalEstimatedProfit,
    totalEstimatedProfit,
    averageRoi: roiValues.length
      ? roiValues.reduce((sum, value) => sum + value, 0) / roiValues.length
      : 0,
    buyCount,
    passCount,
    holdCount,
    totalBuyScans,
    buyPassRatio: passCount > 0 ? buyCount / passCount : buyCount,
    highConfidenceFlipsCount,
    hotFindCount: sessionScans.filter(isHotFind).length,
    projectedHaulProfit,
    consecutiveProfitableScans,
    streakCount: consecutiveProfitableScans,
    hotStreakActive: consecutiveProfitableScans >= 3,
    bestScanOfDay,
    bestRoiScan,
    highestProfitItem,
    lowestConfidenceItem,
    highestConfidenceItem,
    averageProjectedRoi: roiValues.length
      ? roiValues.reduce((sum, value) => sum + value, 0) / roiValues.length
      : 0,
    scansPerMinute: scansPerMinute(sessionScans),
    consecutivePassCount: consecutivePassCount(sessionScans),
    confidenceIndicators,
    demandIndicators,
    topFinds
  };
}

export function persistSessionStreakSnapshot(scans: ScanRecord[]) {
  const metrics = buildResellerSessionMetrics(scans);
  const today = new Date().toISOString().slice(0, 10);
  const existing = localStorageAdapter.readCollection<{
    id: string;
    date: string;
    dailyScanStreak: number;
    consecutiveProfitableScans: number;
    projectedHaulProfit: number;
    hotFindCount: number;
  }>(SESSION_STREAK_COLLECTION);
  const previousToday = existing.find((item) => item.date === today);
  const snapshot = {
    id: today,
    date: today,
    dailyScanStreak: Math.max(previousToday?.dailyScanStreak || 0, metrics.totalScansToday),
    consecutiveProfitableScans: metrics.consecutiveProfitableScans,
    projectedHaulProfit: metrics.projectedHaulProfit,
    hotFindCount: metrics.hotFindCount
  };
  localStorageAdapter.writeCollection(SESSION_STREAK_COLLECTION, [
    snapshot,
    ...existing.filter((item) => item.date !== today).slice(0, 13)
  ]);
  return snapshot;
}

export function getScanConfidence(scan: ScanRecord) {
  return confidence(scan);
}

export function getScanRoi(scan: ScanRecord) {
  return roi(scan);
}
