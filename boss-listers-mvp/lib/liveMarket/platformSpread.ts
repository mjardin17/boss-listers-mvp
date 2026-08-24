import type { SoldCompsSummary } from "./soldCompsEngine";

export function calculatePlatformSpread(summaries: SoldCompsSummary[]) {
  const available = summaries.filter((summary) => summary.averageSoldPrice != null);
  if (!available.length) {
    return {
      unavailable: true,
      bestPlatform: null,
      spread: [],
      reason: "No sold-price platform spread is available."
    };
  }
  const spread = available
    .map((summary) => ({
      platform: summary.platform,
      averageSoldPrice: summary.averageSoldPrice,
      soldCount: summary.soldCount,
      confidenceWeight: summary.confidenceWeight
    }))
    .sort((a, b) => Number(b.averageSoldPrice) - Number(a.averageSoldPrice));
  return {
    unavailable: false,
    bestPlatform: spread[0]?.platform || null,
    spread,
    reason: ""
  };
}
