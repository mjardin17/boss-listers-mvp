import type { NormalizedMarketFacts, ResellerBehaviorProfile } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function collectorDemandIndex(facts: NormalizedMarketFacts, profile: ResellerBehaviorProfile) {
  if (!facts.isCollectible && profile !== "COLLECTIBLE" && profile !== "LONG_TAIL_VINTAGE") return 0;
  const rarity = facts.raritySignal ? 28 : 0;
  const identity = clamp((facts.titleMatchScore + facts.visualMatchScore) * 28, 0, 32);
  const soldEvidence = clamp(facts.trustedSoldCount * 7, 0, 28);
  const scarcity = facts.activeListingCount <= 3 ? 12 : facts.activeListingCount <= 8 ? 7 : 0;
  const bundlePenalty = facts.bulkCompDetected && !facts.isMultipack ? 20 : 0;
  return Math.round(clamp(rarity + identity + soldEvidence + scarcity - bundlePenalty, 0, 99));
}

export function longTailProbability(facts: NormalizedMarketFacts, collectorDemandIndex: number, staleInventoryProbability: number) {
  if (!facts.isCollectible && !facts.raritySignal) return 0;
  const slowMarketBoost = facts.sellThroughRatio == null || facts.sellThroughRatio < 0.25 ? 20 : 8;
  const lowSupplyBoost = facts.activeListingCount <= 8 ? 14 : 0;
  return Math.round(clamp(collectorDemandIndex * 0.65 + slowMarketBoost + lowSupplyBoost - staleInventoryProbability * 0.2, 0, 99));
}
