import { analyzeDecisionRisk } from "./riskAnalyzer";
import { predictProfit } from "./profitPredictor";
import { resolveSellThroughSpeed } from "./marketVelocity";
import { analyzeSellThrough } from "./sellThroughAnalyzer";
import { weightConfidence } from "./confidenceWeighting";
import { recommendBuy, type DecisionState } from "./buyRecommendation";

export type BuyDecisionOutput = {
  decisionState: DecisionState;
  confidenceScore: number;
  estimatedNetProfit: number | null;
  estimatedROI: number | null;
  sellThroughSpeed: string;
  inventoryRisk: string;
  competitionLevel: string;
  recommendationReasoning: string[];
};

export function buildBuyDecision(input: any = {}): BuyDecisionOutput {
  const listing = input.listing || input.analysis || input;
  const trusted = listing.trustedCompSummary || input.trustedCompSummary || {};
  const soldCount = Number(trusted.soldCount || trusted.acceptedComps || listing.engineTelemetry?.compCount || 0);
  const activeCount = Number(trusted.activeCount || 0);
  const profit = predictProfit({
    salePrice: listing.averageSoldPrice ?? listing.estimatedResalePrice,
    costBasis: listing.resolvedCostBasis,
    netProfit: listing.estimatedProfit ?? listing.netProfit ?? listing.profitPotential
  });
  const sellThroughSpeed = resolveSellThroughSpeed(
    trusted.velocityTier || trusted.velocityScore || listing.engineTelemetry?.velocityScore,
    soldCount
  );
  const sellThrough = analyzeSellThrough({ soldCount, activeCount });
  const risk = analyzeDecisionRisk({
    confidenceScore: Number(listing.confidenceScore || 0),
    soldCount,
    saturationRatio: Number(trusted.saturationRatio || 0),
    missingDataPoints: listing.missingDataPoints || [],
    staleInventoryRisk: listing.resellerEngineTelemetry?.staleInventoryRisk
  });
  const riskPenalty = risk.inventoryRisk === "HIGH" ? 30 : risk.inventoryRisk === "MEDIUM" ? 12 : 0;
  const confidenceScore = weightConfidence({
    baseConfidence: Number(listing.confidenceScore || 0),
    soldCount,
    riskPenalty,
    velocityBonus: sellThroughSpeed === "FAST" ? 8 : sellThroughSpeed === "MODERATE" ? 4 : 0
  });
  const decisionState = recommendBuy({
    confidenceScore,
    estimatedNetProfit: profit.estimatedNetProfit,
    estimatedROI: profit.estimatedROI,
    sellThroughSpeed,
    inventoryRisk: risk.inventoryRisk,
    soldCount
  });
  const recommendationReasoning = [
    soldCount > 0 ? "Strong sold history" : "Missing sold comps",
    profit.estimatedNetProfit != null && profit.estimatedNetProfit > 0 ? "Healthy profit margin" : "Profit unavailable or weak",
    sellThrough.competitionLevel === "LOW" ? "Low active competition" : `${sellThrough.competitionLevel} active competition`,
    sellThroughSpeed === "FAST" || sellThroughSpeed === "MODERATE" ? "Stable category demand" : "Weak sell-through history",
    ...risk.riskReasons
  ];
  return {
    decisionState,
    confidenceScore,
    estimatedNetProfit: profit.estimatedNetProfit,
    estimatedROI: profit.estimatedROI,
    sellThroughSpeed,
    inventoryRisk: risk.inventoryRisk,
    competitionLevel: sellThrough.competitionLevel,
    recommendationReasoning: Array.from(new Set(recommendationReasoning))
  };
}
