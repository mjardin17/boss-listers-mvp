export type ResellerBehaviorProfile =
  | "COLLECTIBLE"
  | "LONG_TAIL_VINTAGE"
  | "CONSUMABLE"
  | "BEAUTY"
  | "GROCERY"
  | "TOYS"
  | "ELECTRONICS"
  | "MEDIA"
  | "AUTO_PARTS"
  | "HIGH_SATURATION_RETAIL";

export type ResellerRecommendation = "BUY" | "HOLD" | "SKIP" | "INVESTIGATE" | "LONG_TAIL" | "HIGH_RISK";
export type MarketSimulationRecommendation = "STRONG BUY" | "BUY" | "HOLD" | "LONG-TAIL HOLD" | "RISKY" | "SKIP";
export type RuleSeverity = "INFO" | "WARN" | "BLOCKER";
export type LiquidityTier = "FAST" | "MODERATE" | "SLOW" | "DEAD";
export type CompetitionPressure = "LOW" | "MEDIUM" | "HIGH" | "EXTREME" | "UNKNOWN";

export interface CategoryBehaviorProfile {
  profile: ResellerBehaviorProfile;
  minTrustedSolds: number;
  minConfidenceForBuy: number;
  maxSaturationRatio: number;
  minSellThroughRate: number | null;
  minRoiForBuy: number;
  minNetProfitForBuy: number;
  staleCompToleranceDays: number;
  requiresBundleValidation: boolean;
  requiresStrictUpc: boolean;
  shippingTolerance: "LOW" | "MEDIUM" | "HIGH";
  longTailAllowed: boolean;
}

export interface NormalizedMarketFacts {
  title: string;
  brand: string;
  category: string;
  upc: string;
  sourceStoreType: string;
  costBasis: number | null;
  averageSoldPrice: number | null;
  netProfit: number | null;
  roi: number | null;
  trustedSoldCount: number;
  soldCount90d: number;
  activeCount: number;
  activeListingCount: number;
  soldListingCount: number;
  sellThroughRate: number | null;
  sellThroughRatio: number | null;
  saturationRatio: number | null;
  confidenceScore: number;
  titleMatchScore: number;
  visualMatchScore: number;
  compRejectionRate: number;
  shippingOverhead: number;
  estimatedWeightClass: "LIGHT" | "STANDARD" | "HEAVY" | "OVERSIZE" | "UNKNOWN";
  shippingComplexity: "LOW" | "MEDIUM" | "HIGH";
  fragileRisk: boolean;
  returnRisk: boolean;
  incompleteListingRisk: boolean;
  oversizedPenalty: number;
  isBundleDependent: boolean;
  isMultipack: boolean;
  bulkCompDetected: boolean;
  isConsumable: boolean;
  isCollectible: boolean;
  raritySignal: boolean;
  latestCompAgeDays: number | null;
  staleCompRatio: number;
}

export interface ResellerRuleAction {
  ruleId: string;
  passed: boolean;
  severity: RuleSeverity;
  scoreDelta: number;
  confidenceDelta: number;
  reason: string;
}

export interface MarketBehaviorSimulation {
  liquidityWindowDays: number | null;
  estimatedSellThrough: number | null;
  collectorDemandIndex: number;
  saturationSeverity: number;
  storageBurdenScore: number;
  shippingPainScore: number;
  listingCompetitionDensity: number;
  staleInventoryProbability: number;
  quickFlipProbability: number;
  longTailProbability: number;
  simulationRecommendation: MarketSimulationRecommendation;
  simulationSummary: string;
}

export interface ResellerEngineResult {
  resellerBehaviorProfile: ResellerBehaviorProfile;
  resellerRuleActions: ResellerRuleAction[];
  resellerWarnings: string[];
  adjustedRecommendation: ResellerRecommendation;
  adjustedConfidenceScore: number;
  explanationSummary: string;
  saturationRatio: number | null;
  shippingFrictionRatio: number | null;
  returnRisk: boolean;
  incompleteListingRisk: boolean;
  confidenceDegradationReasons: string[];
  confidenceCollapseReason: string[];
  estimatedDaysToSell: number | null;
  liquidityTier: LiquidityTier;
  competitionPressure: CompetitionPressure;
  marketSaturation: "LOW" | "MEDIUM" | "HIGH" | "EXTREME" | "UNKNOWN";
  marketBehaviorSummary: string;
  finalRecommendationReasoning: string;
  resellerPainScore: number;
  storagePenalty: number;
  staleInventoryRisk: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  marketBehaviorSimulation: MarketBehaviorSimulation;
}
