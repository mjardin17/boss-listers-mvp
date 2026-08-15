import type { NormalizedMarketFacts } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function shippingPainScore(facts: NormalizedMarketFacts) {
  const soldPrice = facts.averageSoldPrice;
  const friction =
    soldPrice != null && soldPrice > 0
      ? ((facts.shippingOverhead + facts.oversizedPenalty) / soldPrice) * 100
      : 35;
  const complexity =
    facts.shippingComplexity === "HIGH" ? 24 : facts.shippingComplexity === "MEDIUM" ? 12 : 0;
  const weight =
    facts.estimatedWeightClass === "OVERSIZE" ? 24 : facts.estimatedWeightClass === "HEAVY" ? 16 : 0;
  const fragile = facts.fragileRisk ? 14 : 0;
  return Math.round(clamp(friction + complexity + weight + fragile, 0, 100));
}

export function storageBurdenScore(facts: NormalizedMarketFacts) {
  const weight =
    facts.estimatedWeightClass === "OVERSIZE" ? 34 : facts.estimatedWeightClass === "HEAVY" ? 22 : 0;
  const fragile = facts.fragileRisk ? 12 : 0;
  const lowTicket = facts.averageSoldPrice != null && facts.averageSoldPrice < 20 ? 10 : 0;
  const slow = facts.sellThroughRatio != null && facts.sellThroughRatio < 0.1 ? 14 : 0;
  return Math.round(clamp(weight + fragile + lowTicket + slow, 0, 100));
}
