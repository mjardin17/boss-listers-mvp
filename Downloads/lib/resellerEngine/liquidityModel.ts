import type { LiquidityTier, NormalizedMarketFacts, ResellerBehaviorProfile } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function estimateLiquidityWindowDays(facts: NormalizedMarketFacts, tier: LiquidityTier, profile: ResellerBehaviorProfile) {
  if (tier === "DEAD") return null;
  if (tier === "FAST") return 14;
  if (tier === "MODERATE") return 45;
  if (profile === "COLLECTIBLE" || profile === "LONG_TAIL_VINTAGE" || facts.raritySignal) return 120;
  return 90;
}

export function estimateSellThrough(facts: NormalizedMarketFacts) {
  if (facts.sellThroughRatio != null && Number.isFinite(facts.sellThroughRatio)) {
    return clamp(facts.sellThroughRatio, 0, 1);
  }
  const active = Math.max(0, facts.activeListingCount || facts.activeCount || 0);
  const sold = Math.max(0, facts.soldListingCount || facts.trustedSoldCount || 0);
  if (!active && !sold) return null;
  return clamp(sold / Math.max(1, active + sold), 0, 1);
}

export function quickFlipProbability(facts: NormalizedMarketFacts, tier: LiquidityTier, saturationSeverity: number, shippingPainScore: number) {
  const sellThrough = estimateSellThrough(facts) ?? 0;
  const tierBoost = tier === "FAST" ? 45 : tier === "MODERATE" ? 25 : tier === "SLOW" ? 8 : 0;
  const compBoost = clamp(facts.trustedSoldCount * 3, 0, 24);
  const penalty = saturationSeverity * 0.35 + shippingPainScore * 0.25;
  return Math.round(clamp(tierBoost + sellThrough * 45 + compBoost - penalty, 0, 99));
}
