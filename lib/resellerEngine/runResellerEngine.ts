import { CATEGORY_BEHAVIOR_MATRIX } from "./categoryProfiles";
import { runMarketBehaviorSimulation } from "./marketBehaviorEngine";
import { runRules } from "./rules";
import type {
  CompetitionPressure,
  LiquidityTier,
  NormalizedMarketFacts,
  ResellerBehaviorProfile,
  ResellerEngineResult,
  ResellerRecommendation
} from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function inferResellerBehaviorProfile(facts: NormalizedMarketFacts): ResellerBehaviorProfile {
  const text = `${facts.title} ${facts.brand} ${facts.category}`.toLowerCase();
  if (facts.isCollectible || /transformers|pokemon|hot wheels|funko|lego|collectible|action figure/.test(text)) {
    return facts.trustedSoldCount <= 4 ? "COLLECTIBLE" : "TOYS";
  }
  if (/vintage|discontinued|retro/.test(text)) return "LONG_TAIL_VINTAGE";
  if (facts.isConsumable || /food|snack|candy|drink|beverage|grocery|vitamin|supplement/.test(text)) return "CONSUMABLE";
  if (/beauty|cosmetic|makeup|lipstick|mascara|foundation|skin care|hair/.test(text)) return "BEAUTY";
  if (/grocery|pantry|cereal|sauce|spice|coffee|tea/.test(text)) return "GROCERY";
  if (/electronic|charger|headphone|earbud|speaker|controller|console/.test(text)) return "ELECTRONICS";
  if (/toy|figure|doll|plush|game/.test(text)) return "TOYS";
  if (/dvd|blu ray|book|cd|vinyl|game disc|media/.test(text)) return "MEDIA";
  if (/auto|car|truck|filter|wiper|spark plug|brake/.test(text)) return "AUTO_PARTS";
  return "HIGH_SATURATION_RETAIL";
}

function startingScore(facts: NormalizedMarketFacts) {
  const profitScore = facts.netProfit == null ? 0 : clamp(facts.netProfit * 2, -20, 35);
  const roiScore = facts.roi == null ? 0 : clamp(facts.roi / 4, -10, 25);
  const confidenceScore = clamp(facts.confidenceScore / 3, 0, 30);
  const compScore = clamp(facts.trustedSoldCount * 3, 0, 18);
  return 35 + profitScore + roiScore + confidenceScore + compScore;
}

function competitionPressure(facts: NormalizedMarketFacts): CompetitionPressure {
  const ratio = facts.saturationRatio;
  if (ratio == null) return facts.activeListingCount > 0 ? "UNKNOWN" : "LOW";
  if (ratio >= 8 || facts.activeListingCount >= 150) return "EXTREME";
  if (ratio >= 4 || facts.activeListingCount >= 75) return "HIGH";
  if (ratio >= 1.5 || facts.activeListingCount >= 25) return "MEDIUM";
  return "LOW";
}

function marketSaturation(pressure: CompetitionPressure) {
  if (pressure === "EXTREME") return "EXTREME";
  if (pressure === "HIGH") return "HIGH";
  if (pressure === "MEDIUM") return "MEDIUM";
  if (pressure === "LOW") return "LOW";
  return "UNKNOWN";
}

function liquidityTier(facts: NormalizedMarketFacts, profile: ResellerBehaviorProfile): LiquidityTier {
  if (facts.trustedSoldCount <= 0 || (facts.sellThroughRatio != null && facts.sellThroughRatio <= 0.02)) return "DEAD";
  if (facts.averageSoldPrice != null && facts.averageSoldPrice < 20 && (facts.saturationRatio ?? 0) >= 3) return "DEAD";
  if (facts.sellThroughRatio != null && facts.sellThroughRatio >= 0.5) return "FAST";
  if (facts.sellThroughRatio != null && facts.sellThroughRatio >= 0.2) return "MODERATE";
  if ((profile === "COLLECTIBLE" || profile === "LONG_TAIL_VINTAGE") && facts.trustedSoldCount >= 2) return "SLOW";
  if (facts.soldCount90d >= 3) return "MODERATE";
  return "SLOW";
}

function estimatedDaysToSell(facts: NormalizedMarketFacts, tier: LiquidityTier) {
  if (tier === "DEAD") return null;
  if (tier === "FAST") return 14;
  if (tier === "MODERATE") return 45;
  if (facts.isCollectible || facts.raritySignal) return 120;
  return 90;
}

function storagePenalty(facts: NormalizedMarketFacts) {
  let penalty = 0;
  if (facts.estimatedWeightClass === "HEAVY") penalty += 12;
  if (facts.estimatedWeightClass === "OVERSIZE") penalty += 22;
  if (facts.shippingComplexity === "HIGH") penalty += 10;
  if (facts.averageSoldPrice != null && facts.averageSoldPrice < 20) penalty += 8;
  if (facts.isConsumable) penalty += 8;
  return clamp(penalty, 0, 40);
}

function staleInventoryRisk(facts: NormalizedMarketFacts, tier: LiquidityTier): "LOW" | "MEDIUM" | "HIGH" | "EXTREME" {
  if (tier === "DEAD") return "EXTREME";
  if ((facts.saturationRatio ?? 0) >= 5 || facts.staleCompRatio >= 0.5) return "HIGH";
  if (tier === "SLOW" || facts.latestCompAgeDays != null && facts.latestCompAgeDays > 90) return "MEDIUM";
  return "LOW";
}

function resellerPainScore({
  facts,
  pressure,
  tier,
  storage
}: {
  facts: NormalizedMarketFacts;
  pressure: CompetitionPressure;
  tier: LiquidityTier;
  storage: number;
}) {
  const pressurePain = pressure === "EXTREME" ? 25 : pressure === "HIGH" ? 18 : pressure === "MEDIUM" ? 8 : 0;
  const liquidityPain = tier === "DEAD" ? 30 : tier === "SLOW" ? 16 : tier === "MODERATE" ? 6 : 0;
  const shippingPain =
    facts.averageSoldPrice != null && facts.averageSoldPrice > 0
      ? clamp(((facts.shippingOverhead + facts.oversizedPenalty) / facts.averageSoldPrice) * 40, 0, 22)
      : 10;
  const evidencePain = facts.trustedSoldCount < 2 ? 18 : facts.trustedSoldCount < 4 ? 10 : 0;
  const contaminationPain = facts.bulkCompDetected && !facts.isMultipack ? 18 : 0;
  return Math.round(clamp(pressurePain + liquidityPain + shippingPain + evidencePain + contaminationPain + storage, 0, 100));
}

function confidenceCollapseReasons(facts: NormalizedMarketFacts) {
  return [
    facts.trustedSoldCount < 2 ? "low_comp_density" : "",
    facts.titleMatchScore > 0 && facts.titleMatchScore < 0.35 ? "title_mismatch" : "",
    facts.saturationRatio != null && facts.saturationRatio >= 5 ? "excessive_active_listings" : "",
    facts.bulkCompDetected && !facts.isMultipack ? "bundle_contamination" : "",
    facts.upc && facts.visualMatchScore < 0.3 ? "weak_upc_alignment" : "",
    facts.returnRisk ? "return_risk" : "",
    facts.incompleteListingRisk ? "incomplete_listing_risk" : "",
    facts.roi != null && facts.roi > 300 && facts.trustedSoldCount < 6 ? "unrealistic_roi" : ""
  ].filter(Boolean);
}

function marketBehaviorSummary({
  facts,
  profile,
  tier,
  pressure,
  warnings
}: {
  facts: NormalizedMarketFacts;
  profile: ResellerBehaviorProfile;
  tier: LiquidityTier;
  pressure: CompetitionPressure;
  warnings: string[];
}) {
  if (warnings.length) return warnings[0];
  if ((profile === "COLLECTIBLE" || profile === "LONG_TAIL_VINTAGE") && tier === "SLOW") {
    return "Sparse comps accepted due to collectible behavior and lower market supply.";
  }
  if (pressure === "HIGH" || pressure === "EXTREME") {
    return "High saturation and competition pressure reduce sourcing quality despite sold evidence.";
  }
  if (facts.isConsumable && tier !== "FAST") {
    return "Consumables require fast liquidity and clean bundle economics.";
  }
  if (facts.returnRisk || facts.incompleteListingRisk) {
    return "Electronics and incomplete-condition signals require stronger margin and comp certainty.";
  }
  if (facts.averageSoldPrice != null && facts.averageSoldPrice < 20 && (facts.saturationRatio ?? 0) >= 3) {
    return "Low-ticket saturated inventory is not efficient enough for real reseller sourcing.";
  }
  if (tier === "FAST") return "Fast liquidity signal with acceptable market pressure.";
  return "Reseller behavior checks favor cautious verification before buying.";
}

function decide({
  facts,
  score,
  confidence,
  blockers,
  profile,
  liquidity,
  pressure,
  collapseReasons,
  painScore
}: {
  facts: NormalizedMarketFacts;
  score: number;
  confidence: number;
  blockers: string[];
  profile: ReturnType<typeof inferResellerBehaviorProfile>;
  liquidity: LiquidityTier;
  pressure: CompetitionPressure;
  collapseReasons: string[];
  painScore: number;
}): ResellerRecommendation {
  const categoryProfile = CATEGORY_BEHAVIOR_MATRIX[profile];
  if (facts.netProfit == null || facts.roi == null || facts.averageSoldPrice == null) return "INVESTIGATE";
  const lowTicketDead = facts.averageSoldPrice < 20 && liquidity === "DEAD";
  const badRetailPain = painScore >= 70 && !categoryProfile.longTailAllowed;
  const bundleTrap = facts.bulkCompDetected && !facts.isMultipack && facts.isConsumable;
  if (lowTicketDead || bundleTrap || (badRetailPain && !facts.returnRisk && !facts.incompleteListingRisk)) return "SKIP";
  if (blockers.length) return facts.averageSoldPrice != null && facts.netProfit != null ? "HIGH_RISK" : "INVESTIGATE";
  if (collapseReasons.length >= 2 && !categoryProfile.longTailAllowed) return "HIGH_RISK";
  if (liquidity === "DEAD") return "SKIP";
  if (facts.isConsumable && liquidity !== "FAST") return "SKIP";
  if (
    facts.isCollectible &&
    facts.raritySignal &&
    categoryProfile.longTailAllowed &&
    score >= 62 &&
    facts.trustedSoldCount >= categoryProfile.minTrustedSolds &&
    facts.titleMatchScore >= 0.5 &&
    facts.visualMatchScore >= 0.55
  ) {
    return "LONG_TAIL";
  }
  if (confidence < categoryProfile.minConfidenceForBuy) return score >= 70 ? "HOLD" : "INVESTIGATE";
  if (facts.netProfit < categoryProfile.minNetProfitForBuy) return "SKIP";
  if (facts.roi < categoryProfile.minRoiForBuy) return "SKIP";
  if (facts.saturationRatio != null && facts.saturationRatio > categoryProfile.maxSaturationRatio) {
    return categoryProfile.longTailAllowed ? "HOLD" : "SKIP";
  }
  if (pressure === "EXTREME" && !categoryProfile.longTailAllowed) return "SKIP";
  if (score >= 78) return "BUY";
  if (score >= 55) return "HOLD";
  return "SKIP";
}

export function runResellerEngine(facts: NormalizedMarketFacts): ResellerEngineResult {
  const resellerBehaviorProfile = inferResellerBehaviorProfile(facts);
  const profile = CATEGORY_BEHAVIOR_MATRIX[resellerBehaviorProfile];
  const resellerRuleActions = runRules(facts, profile);
  const blockers = resellerRuleActions
    .filter((rule) => rule.severity === "BLOCKER" && !rule.passed)
    .map((rule) => rule.reason);
  const resellerWarnings = resellerRuleActions
    .filter((rule) => !rule.passed && rule.severity !== "INFO")
    .map((rule) => rule.reason);
  const score = clamp(
    startingScore(facts) + resellerRuleActions.reduce((sum, rule) => sum + rule.scoreDelta, 0),
    0,
    100
  );
  const adjustedConfidenceScore = clamp(
    Math.round(facts.confidenceScore + resellerRuleActions.reduce((sum, rule) => sum + rule.confidenceDelta, 0)),
    0,
    99
  );
  const pressure = competitionPressure(facts);
  const liquidity = liquidityTier(facts, resellerBehaviorProfile);
  const marketBehaviorSimulation = runMarketBehaviorSimulation({
    facts,
    profile: resellerBehaviorProfile,
    liquidityTier: liquidity
  });
  const daysToSell = estimatedDaysToSell(facts, liquidity);
  const confidenceCollapseReason = confidenceCollapseReasons(facts);
  const storage = storagePenalty(facts);
  const staleRisk = staleInventoryRisk(facts, liquidity);
  const painScore = resellerPainScore({ facts, pressure, tier: liquidity, storage });
  const adjustedRecommendation = decide({
    facts,
    score,
    confidence: adjustedConfidenceScore,
    blockers,
    profile: resellerBehaviorProfile,
    liquidity,
    pressure,
    collapseReasons: confidenceCollapseReason,
    painScore
  });
  const explanationSummary =
    resellerWarnings[0] ||
    (adjustedRecommendation === "BUY"
      ? "Reseller rules support this buy after sold-comp, saturation, velocity, and friction checks."
      : adjustedRecommendation === "HOLD"
        ? "Reseller rules found enough evidence to watch or verify before buying."
        : adjustedRecommendation === "SKIP"
          ? "Reseller rules reject this opportunity after profit, velocity, or saturation checks."
          : adjustedRecommendation === "LONG_TAIL"
            ? "Long-tail collectible logic allows slower velocity when supply is low and variant evidence is strong."
            : adjustedRecommendation === "HIGH_RISK"
              ? "High-risk reseller conditions detected; do not buy without manual verification."
              : "Investigate because market evidence is incomplete.");
  const shippingFrictionRatio =
    facts.averageSoldPrice != null && facts.averageSoldPrice > 0
      ? Number(((facts.shippingOverhead + facts.oversizedPenalty) / facts.averageSoldPrice).toFixed(2))
      : null;
  const confidenceDegradationReasons = resellerRuleActions
    .filter((rule) => !rule.passed && rule.confidenceDelta < 0)
    .map((rule) => rule.reason);
  const summary = marketBehaviorSummary({
    facts,
    profile: resellerBehaviorProfile,
    tier: liquidity,
    pressure,
    warnings: resellerWarnings
  });

  return {
    resellerBehaviorProfile,
    resellerRuleActions,
    resellerWarnings,
    adjustedRecommendation,
    adjustedConfidenceScore,
    explanationSummary,
    saturationRatio: facts.saturationRatio,
    shippingFrictionRatio,
    returnRisk: facts.returnRisk,
    incompleteListingRisk: facts.incompleteListingRisk,
    confidenceDegradationReasons,
    confidenceCollapseReason,
    estimatedDaysToSell: daysToSell,
    liquidityTier: liquidity,
    competitionPressure: pressure,
    marketSaturation: marketSaturation(pressure),
    marketBehaviorSummary: summary,
    finalRecommendationReasoning: summary || explanationSummary,
    resellerPainScore: painScore,
    storagePenalty: storage,
    staleInventoryRisk: staleRisk,
    marketBehaviorSimulation
  };
}
