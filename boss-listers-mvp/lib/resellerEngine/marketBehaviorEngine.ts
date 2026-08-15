import { collectorDemandIndex, longTailProbability } from "./collectiblePatienceModel";
import { estimateLiquidityWindowDays, estimateSellThrough, quickFlipProbability } from "./liquidityModel";
import { listingCompetitionDensity, saturationSeverity, staleInventoryProbability } from "./saturationModel";
import { shippingPainScore, storageBurdenScore } from "./shippingRiskModel";
import type {
  LiquidityTier,
  MarketBehaviorSimulation,
  NormalizedMarketFacts,
  ResellerBehaviorProfile
} from "./types";

function simulationRecommendation({
  facts,
  quickFlip,
  longTail,
  collectorDemand,
  saturation,
  shippingPain,
  staleProbability,
  tier
}: {
  facts: NormalizedMarketFacts;
  quickFlip: number;
  longTail: number;
  collectorDemand: number;
  saturation: number;
  shippingPain: number;
  staleProbability: number;
  tier: LiquidityTier;
}): MarketBehaviorSimulation["simulationRecommendation"] {
  if (facts.averageSoldPrice == null || facts.netProfit == null || facts.roi == null || facts.trustedSoldCount <= 0) {
    return "RISKY";
  }
  if (facts.bulkCompDetected && !facts.isMultipack) return "SKIP";
  if (facts.averageSoldPrice < 20 && (saturation >= 55 || shippingPain >= 45)) return "SKIP";
  if (tier === "DEAD" || staleProbability >= 80) return "SKIP";
  if (collectorDemand >= 65 && longTail >= 55) return "LONG-TAIL HOLD";
  if (quickFlip >= 78 && facts.netProfit >= 8 && saturation < 45 && shippingPain < 45) return "STRONG BUY";
  if (quickFlip >= 58 && facts.netProfit >= 6 && saturation < 65) return "BUY";
  if (saturation >= 65 || shippingPain >= 65) return "RISKY";
  return "HOLD";
}

export function runMarketBehaviorSimulation({
  facts,
  profile,
  liquidityTier
}: {
  facts: NormalizedMarketFacts;
  profile: ResellerBehaviorProfile;
  liquidityTier: LiquidityTier;
}): MarketBehaviorSimulation {
  const estimatedSellThrough = estimateSellThrough(facts);
  const competitionDensity = listingCompetitionDensity(facts);
  const saturation = saturationSeverity(facts);
  const shippingPain = shippingPainScore(facts);
  const storageBurden = storageBurdenScore(facts);
  const staleProbability = staleInventoryProbability(facts, saturation);
  const collectorDemand = collectorDemandIndex(facts, profile);
  const longTail = longTailProbability(facts, collectorDemand, staleProbability);
  const quickFlip = quickFlipProbability(facts, liquidityTier, saturation, shippingPain);
  const recommendation = simulationRecommendation({
    facts,
    quickFlip,
    longTail,
    collectorDemand,
    saturation,
    shippingPain,
    staleProbability,
    tier: liquidityTier
  });
  const simulationSummary =
    recommendation === "STRONG BUY"
      ? "High sell-through, low competition, and practical shipping support a fast flip."
      : recommendation === "BUY"
        ? "Market behavior supports buying, but margin and competition should still be checked."
        : recommendation === "LONG-TAIL HOLD"
          ? "Collector demand supports patience despite slower liquidity."
          : recommendation === "SKIP"
            ? "Market behavior indicates poor sourcing efficiency after competition, shipping, or stale inventory risk."
            : recommendation === "RISKY"
              ? "Market behavior has enough friction to require manual verification before buying."
              : "Market behavior supports watching this item rather than rushing the buy.";

  return {
    liquidityWindowDays: estimateLiquidityWindowDays(facts, liquidityTier, profile),
    estimatedSellThrough,
    collectorDemandIndex: collectorDemand,
    saturationSeverity: saturation,
    storageBurdenScore: storageBurden,
    shippingPainScore: shippingPain,
    listingCompetitionDensity: competitionDensity,
    staleInventoryProbability: staleProbability,
    quickFlipProbability: quickFlip,
    longTailProbability: longTail,
    simulationRecommendation: recommendation,
    simulationSummary
  };
}
