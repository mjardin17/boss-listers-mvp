import { z } from "zod";

const finiteNumber = z.number().finite();

export interface SourceCostProfile {
  readonly sourceId:
    | "walmart"
    | "target"
    | "dollartree"
    | "tjmaxx"
    | "ross"
    | "manual"
    | "wholesale"
    | "csv_upload";
  readonly sourceName: string;
  readonly costBasis: number | null;
  readonly isUserOverride: boolean;
}

export interface SourceProfitMetrics {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly costBasis: number | null;
  readonly netProfit: number | null;
  readonly returnOnInvestment: number | null;
  readonly status: "BUY" | "HOLD" | "SKIP" | "UNAVAILABLE";
}

export type VelocityScore = "HIGH" | "MODERATE" | "LOW" | "DEAD";

export type ResellerSignal =
  | "LOW_BUY_IN_COST"
  | "STRONG_COMP_DENSITY"
  | "RECENT_SOLD_ACTIVITY"
  | "HIGH_SATURATION"
  | "WEAK_TITLE_MATCHING"
  | "THIN_MARKET"
  | "MULTIPACK_AMBIGUITY";

export interface MarketComps {
  readonly averageResalePrice?: number;
  readonly recentSalesCount?: number;
  readonly staleComps?: boolean;
  readonly priceVarianceHigh?: boolean;
}

export interface MarketDataSummary {
  readonly walmartPrice: number | null;
  readonly walmartTitle: string;
  readonly soldCount: number;
  readonly lowestSold: number | null;
  readonly averageSold: number | null;
  readonly highestSold: number | null;
  readonly confidence: number;
}

export interface EngineTelemetry {
  readonly compCount: number;
  readonly velocityScore: VelocityScore;
  readonly saturationRatio: number;
  readonly confidenceBreakdown: string[];
  readonly ocrConfidence: "HIGH" | "LOW";
  readonly isMultipackOrBundle: boolean;
}

export interface NormalizedProduct {
  readonly title: string;
  readonly brand?: string;
  readonly category?: string;
  readonly upc?: string;
}

export interface ProductCandidate {
  readonly title: string;
  readonly brand: string;
  readonly category: string;
  readonly upc: string;
  readonly source: string;
  readonly confidence: number;
  readonly matchedTokens: string[];
  readonly reasonSuggested: string;
}

export interface DecisionCardData {
  readonly product: NormalizedProduct;
  readonly action: "BUY" | "MARGINAL" | "HOLD" | "SKIP" | "MANUAL_REVIEW" | "INVESTIGATE" | "LONG_TAIL" | "HIGH_RISK";
  readonly confidenceScore: number;
  readonly reasoning: string;
  readonly signals: ResellerSignal[];
  readonly missingDataPoints: string[];
  readonly telemetry: EngineTelemetry;
}

export interface CrossListDraft {
  readonly platform: string;
  readonly displayName: string;
  readonly title: string;
  readonly description: string;
  readonly bulletPoints: string[];
  readonly hashtags: string[];
  readonly category: string;
  readonly metadata: {
    readonly titleLimit: number;
    readonly conditionLanguage: string;
    readonly tone: string;
    readonly requiresBrand: boolean;
    readonly publishReady: boolean;
    readonly warnings: string[];
  };
}

export const SourceCostProfileSchema = z
  .object({
    sourceId: z.enum([
      "walmart",
      "target",
      "dollartree",
      "tjmaxx",
      "ross",
      "manual",
      "wholesale",
      "csv_upload"
    ]),
    sourceName: z.string().min(1),
    costBasis: finiteNumber.nullable(),
    isUserOverride: z.boolean()
  })
  .strict();

export const SourceProfitMetricsSchema = z
  .object({
    sourceId: z.string().min(1),
    sourceName: z.string().min(1),
    costBasis: finiteNumber.nullable(),
    netProfit: finiteNumber.nullable(),
    returnOnInvestment: finiteNumber.nullable(),
    status: z.enum(["BUY", "HOLD", "SKIP", "UNAVAILABLE"])
  })
  .strict();

export const VelocityScoreSchema = z.enum(["HIGH", "MODERATE", "LOW", "DEAD"]);
export const ResellerSignalSchema = z.enum([
  "LOW_BUY_IN_COST",
  "STRONG_COMP_DENSITY",
  "RECENT_SOLD_ACTIVITY",
  "HIGH_SATURATION",
  "WEAK_TITLE_MATCHING",
  "THIN_MARKET",
  "MULTIPACK_AMBIGUITY"
]);

export const ProductCandidateSchema = z
  .object({
    title: z.string().min(1),
    brand: z.string().catch(""),
    category: z.string().catch(""),
    upc: z.string().catch(""),
    source: z.string().min(1),
    confidence: finiteNumber.min(0).max(100).catch(0),
    matchedTokens: z.array(z.string()).catch([]),
    reasonSuggested: z.string().catch("")
  })
  .strict();

export const MarketCompsSchema = z
  .object({
    averageResalePrice: finiteNumber.optional(),
    recentSalesCount: finiteNumber.optional(),
    staleComps: z.boolean().optional(),
    priceVarianceHigh: z.boolean().optional()
  })
  .strict();

export const MarketDataSummarySchema = z
  .object({
    walmartPrice: finiteNumber.nullable().catch(null),
    walmartTitle: z.string().catch(""),
    soldCount: finiteNumber.catch(0),
    lowestSold: finiteNumber.nullable().catch(null),
    averageSold: finiteNumber.nullable().catch(null),
    highestSold: finiteNumber.nullable().catch(null),
    confidence: finiteNumber.min(0).max(100).catch(0)
  })
  .strict();

export const EngineTelemetrySchema = z
  .object({
    compCount: finiteNumber.catch(0),
    velocityScore: VelocityScoreSchema.catch("DEAD"),
    saturationRatio: finiteNumber.catch(0),
    confidenceBreakdown: z.array(z.string()).catch([]),
    ocrConfidence: z.enum(["HIGH", "LOW"]).catch("LOW"),
    isMultipackOrBundle: z.boolean().catch(false)
  })
  .strict();

export const NormalizedProductSchema = z
  .object({
    title: z.string().catch("Scanned item"),
    brand: z.string().optional(),
    category: z.string().optional(),
    upc: z.string().optional()
  })
  .strict();

export const DecisionCardDataSchema = z
  .object({
    product: NormalizedProductSchema,
    action: z.enum(["BUY", "MARGINAL", "HOLD", "SKIP", "MANUAL_REVIEW", "INVESTIGATE", "LONG_TAIL", "HIGH_RISK"]).catch("MANUAL_REVIEW"),
    confidenceScore: finiteNumber.min(0).max(100).catch(0),
    reasoning: z.string().catch("Manual review recommended."),
    signals: z.array(ResellerSignalSchema).catch([]),
    missingDataPoints: z.array(z.string()).catch([]),
    telemetry: EngineTelemetrySchema
  })
  .strict();

export const CrossListDraftSchema = z
  .object({
    platform: z.string().min(1),
    displayName: z.string().min(1),
    title: z.string().min(1),
    description: z.string().catch(""),
    bulletPoints: z.array(z.string()).catch([]),
    hashtags: z.array(z.string()).catch([]),
    category: z.string().catch("Uncategorized"),
    metadata: z
      .object({
        titleLimit: finiteNumber.catch(80),
        conditionLanguage: z.string().catch("Review condition before publishing."),
        tone: z.string().catch("marketplace"),
        requiresBrand: z.boolean().catch(false),
        publishReady: z.boolean().catch(false),
        warnings: z.array(z.string()).catch([])
      })
      .strict()
  })
  .strict();

export const TrustedCompSummarySchema = z
  .object({
    acceptedComps: finiteNumber.catch(0),
    rejectedComps: finiteNumber.catch(0),
    averageSoldPrice: finiteNumber.nullable().catch(null),
    soldCount: finiteNumber.catch(0),
    soldCount90d: finiteNumber.catch(0),
    activeCount: finiteNumber.catch(0),
    sellThroughRate: finiteNumber.nullable().catch(null),
    saturationRatio: finiteNumber.catch(0),
    saturationRisk: z.enum(["LOW", "MEDIUM", "HIGH"]).catch("HIGH"),
    saturationFlags: z
      .object({
        oversaturated: z.boolean().catch(false),
        floodedAmazonLiquidation: z.boolean().catch(false),
        weakSoldToActiveRatio: z.boolean().catch(false),
        staleSoldComps: z.boolean().catch(false)
      })
      .strict()
      .optional(),
    velocityScore: z.enum(["FAST", "HEALTHY", "MODERATE", "SLOW", "DEAD"]).catch("DEAD"),
    velocityTier: VelocityScoreSchema.catch("DEAD"),
    rejectionReasons: z.record(z.string(), finiteNumber).catch({}),
    generatedSearchQueries: z.array(z.string()).catch([]).optional(),
    generatedSearchQueryTelemetry: z.array(z.unknown()).catch([]).optional(),
    enrichmentStages: z
      .array(
        z
          .object({
            stage: z.string().catch(""),
            query: z.string().catch(""),
            status: z.string().catch("")
          })
          .passthrough()
      )
      .catch([])
      .optional(),
    rejectionDetails: z
      .array(
        z
          .object({
            title: z.string().catch(""),
            reason: z.string().catch("title_mismatch"),
            failedToken: z.string().catch(""),
            failedUpc: z.string().catch(""),
            staleAge: finiteNumber.nullable().catch(null),
            multipackMismatch: z.boolean().catch(false),
            poisonedKeyword: z.string().catch("")
          })
          .strict()
      )
      .catch([]),
    identityConfidence: z
      .object({
        score: finiteNumber.min(0).max(99).catch(0),
        upcMatched: z.boolean().catch(false),
        brandMatched: z.boolean().catch(false),
        titleTokenSimilarity: finiteNumber.catch(0),
        marketplaceTitleOverlap: finiteNumber.catch(0),
        matchedKeywords: z.array(z.string()).catch([]),
        rejectedKeywords: z.array(z.string()).catch([]),
        unresolvedTokens: z.array(z.string()).catch([])
      })
      .strict()
      .optional(),
    trustScore: finiteNumber.min(0).max(99).catch(0).optional(),
    queryMatchMetrics: z.array(z.unknown()).catch([]).optional(),
    acceptedCompScoring: z.unknown().optional(),
    acceptedCompReasons: z.array(z.unknown()).catch([]).optional(),
    strongestTokens: z.array(z.unknown()).catch([]).optional(),
    rejectedTokens: z.array(z.string()).catch([]).optional(),
    rejectedVisualIndicators: z.array(z.string()).catch([]).optional(),
    confidenceCollapseReasons: z.array(z.string()).catch([]).optional(),
    visualConfidenceStage: z.string().catch("LOW_CONFIDENCE_UNKNOWN").optional(),
    queryPathSelected: z.string().catch("").optional(),
    trustGrade: z.string().catch("LOW").optional(),
    confidenceGrade: z.string().catch("LOW").optional()
  })
  .strict();

export const EligibilityStatusSchema = z.enum([
  "Allowed",
  "Restricted",
  "Approval Needed",
  "Prohibited",
  "Not Recommended"
]);

export const MarketplaceEligibilitySchema = z
  .object({
    platforms: z
      .array(
        z
          .object({
            platform: z.string().min(1),
            status: EligibilityStatusSchema,
            reason: z.string().min(1),
            flags: z.array(z.string()).default([])
          })
          .strict()
      )
      .default([]),
    bestPlatformsToList: z.array(z.string()).default([]),
    avoidListingOn: z.array(z.string()).default([]),
    approvalNeeded: z.array(z.string()).default([])
  })
  .strict();

export const NormalizedCompSchema = z
  .object({
    sourcePlatform: z.string().min(1),
    price: finiteNumber,
    dateSold: z.string().min(1)
  })
  .strict();

export const AnalysisResultSchema = z
  .object({
    itemTitle: z.string().optional(),
    brand: z.string().optional(),
    category: z.string().optional(),
    condition: z.string().optional(),
    keyDetails: z.array(z.string()).optional(),
    quantity: z.string().optional(),
    priceRange: z
      .object({
        low: finiteNumber.optional(),
        suggested: finiteNumber.optional(),
        high: finiteNumber.optional()
      })
      .passthrough()
      .optional(),
    shippingNotes: z.string().optional(),
    upc: z.string().optional(),
    productImageUrl: z.string().optional(),
    productLookup: z.unknown().optional(),
    productLine: z.string().optional(),
    itemNumber: z.string().optional(),
    variant: z.string().optional(),
    edition: z.string().optional(),
    demand: z.string().optional(),
    sellThrough: z.string().optional(),
    sellThroughRatio: finiteNumber.nullable().optional(),
    bestMatches: z.array(z.unknown()).optional(),
    confidence: finiteNumber.min(0).max(1).optional(),
    summary: z.string().optional(),
    recognitionEvidence: z.array(z.string()).optional(),
    ocrText: z.array(z.string()).optional(),
    brandCandidates: z.array(z.unknown()).optional(),
    categorySignals: z.array(z.string()).optional(),
    conditionSignals: z.array(z.string()).optional(),
    packagingHints: z.array(z.string()).optional(),
    visualAnchors: z.array(z.string()).optional(),
    imageObservations: z.array(z.unknown()).optional(),
    imageRoleTelemetry: z.unknown().optional(),
    missingViews: z.array(z.string()).optional(),
    buyRecommendation: z.string().optional(),
    recommendationReasons: z.array(z.string()).optional(),
    soldPriceRange: z.unknown().optional(),
    profitConfidenceScore: finiteNumber.min(0).max(100).optional(),
    sourcingConfidenceScore: finiteNumber.min(0).max(100).optional(),
    confidenceScore: finiteNumber.min(0).max(100).optional(),
    estimatedResalePrice: finiteNumber.optional(),
    averageSoldPrice: finiteNumber.optional(),
    lowestSold: finiteNumber.nullable().optional(),
    highestSold: finiteNumber.nullable().optional(),
    soldCount: finiteNumber.optional(),
    walmartPrice: finiteNumber.nullable().optional(),
    walmartTitle: z.string().optional(),
    marketData: MarketDataSummarySchema.optional(),
    estimatedProfit: finiteNumber.optional(),
    roiPercentage: finiteNumber.optional(),
    demandScore: finiteNumber.min(0).max(100).optional(),
    recommendation: z.string().optional(),
    recommendationExplanation: z.string().optional(),
    sourceBadges: z.array(z.string()).optional(),
    marketDataUnavailable: z.boolean().optional(),
    sourceCostProfiles: z.array(SourceCostProfileSchema).optional(),
    sourceProfitMetrics: z.array(SourceProfitMetricsSchema).optional(),
    sourceStoreType: z.string().optional(),
    resolvedCostBasis: finiteNumber.optional(),
    lookupSource: z.string().optional(),
    manualOverrideValue: finiteNumber.nullable().optional(),
    resaleAuthoritySource: z.string().optional(),
    pricingSource: z.string().optional(),
    pricingHierarchy: z.array(z.string()).catch([]).optional(),
    userVerifiedCorrection: z.unknown().optional(),
    matchedPersonalSale: z.unknown().optional(),
    scanFingerprint: z.string().optional(),
    matchingKeys: z.array(z.string()).catch([]).optional(),
    marketComps: MarketCompsSchema.optional(),
    resellerSignals: z.array(ResellerSignalSchema).optional(),
    missingDataPoints: z.array(z.string()).optional(),
    engineTelemetry: EngineTelemetrySchema.optional(),
    decisionCard: DecisionCardDataSchema.optional(),
    trustedCompSummary: TrustedCompSummarySchema.optional(),
    productCandidates: z.array(ProductCandidateSchema).catch([]).optional(),
    confirmedProductIdentity: ProductCandidateSchema.nullable().optional(),
    generatedSearchQueries: z.array(z.string()).catch([]).optional(),
    generatedSearchQueryTelemetry: z.array(z.unknown()).catch([]).optional(),
    enrichmentStages: z.array(z.unknown()).catch([]).optional(),
    trustScore: finiteNumber.min(0).max(99).optional(),
    calibrationLog: z.unknown().optional(),
    resellerBehaviorProfile: z.string().optional(),
    resellerRuleActions: z.array(z.unknown()).catch([]).optional(),
    resellerWarnings: z.array(z.string()).catch([]).optional(),
    adjustedRecommendation: z.string().optional(),
    adjustedConfidenceScore: finiteNumber.min(0).max(100).optional(),
    explanationSummary: z.string().optional(),
    resellerEngineTelemetry: z.unknown().optional(),
    crossListDrafts: z.array(CrossListDraftSchema).catch([]).optional(),
    listingOrchestration: z.unknown().optional(),
    inventorySyncSnapshot: z.unknown().optional(),
    inventoryOS: z.unknown().optional(),
    aiAgentSummary: z.string().optional(),
    aiAgentEvents: z.array(z.unknown()).catch([]).optional(),
    aiAgentTelemetry: z.unknown().optional(),
    aiAgentDecisions: z.array(z.unknown()).catch([]).optional(),
    executionFlow: z.array(z.string()).catch([]).optional(),
    agentDecisionHierarchy: z.array(z.string()).catch([]).optional(),
    breakEven: finiteNumber.nullable().optional()
  })
  .passthrough();

export const NormalizedListingSchema = z
  .object({
    itemTitle: z.string().min(1).catch("Scanned item"),
    thumbnailUrl: z.string().catch(""),
    sellThroughRate: z.string().min(1).catch("Unavailable"),
    averageSalePrice: finiteNumber.nullable().catch(null),
    profitPotential: finiteNumber.nullable().catch(null),
    demandLevel: z.union([z.literal("High"), z.literal("Medium"), z.literal("Low"), z.string().min(1)]).catch("Unknown"),
    sourcingTip: z.string().min(1).catch("Review comps before sourcing this item."),
    confidenceScore: finiteNumber.min(0).max(100).catch(0).optional(),
    estimatedResalePrice: finiteNumber.optional(),
    averageSoldPrice: finiteNumber.optional(),
    lowestSold: finiteNumber.nullable().optional(),
    highestSold: finiteNumber.nullable().optional(),
    soldCount: finiteNumber.optional(),
    walmartPrice: finiteNumber.nullable().optional(),
    walmartTitle: z.string().optional(),
    marketData: MarketDataSummarySchema.optional(),
    estimatedProfit: finiteNumber.optional(),
    roiPercentage: finiteNumber.optional(),
    demandScore: finiteNumber.min(0).max(100).optional(),
    recommendation: z.string().optional(),
    recommendationExplanation: z.string().optional(),
    sourceBadges: z.array(z.string()).optional(),
    marketDataUnavailable: z.boolean().optional(),
    sourceCostProfiles: z.array(SourceCostProfileSchema).optional(),
    sourceProfitMetrics: z.array(SourceProfitMetricsSchema).optional(),
    sourceStoreType: z.string().optional(),
    resolvedCostBasis: finiteNumber.optional(),
    lookupSource: z.string().optional(),
    manualOverrideValue: finiteNumber.nullable().optional(),
    resaleAuthoritySource: z.string().optional(),
    pricingSource: z.string().optional(),
    pricingHierarchy: z.array(z.string()).catch([]).optional(),
    userVerifiedCorrection: z.unknown().optional(),
    matchedPersonalSale: z.unknown().optional(),
    scanFingerprint: z.string().optional(),
    matchingKeys: z.array(z.string()).catch([]).optional(),
    ocrText: z.array(z.string()).catch([]).optional(),
    visualAnchors: z.array(z.string()).catch([]).optional(),
    packagingHints: z.array(z.string()).catch([]).optional(),
    marketComps: MarketCompsSchema.optional(),
    resellerSignals: z.array(ResellerSignalSchema).catch([]).optional(),
    missingDataPoints: z.array(z.string()).catch([]).optional(),
    engineTelemetry: EngineTelemetrySchema.optional(),
    decisionCard: DecisionCardDataSchema.optional(),
    trustedCompSummary: TrustedCompSummarySchema.optional(),
    productCandidates: z.array(ProductCandidateSchema).catch([]).optional(),
    confirmedProductIdentity: ProductCandidateSchema.nullable().optional(),
    generatedSearchQueries: z.array(z.string()).catch([]).optional(),
    generatedSearchQueryTelemetry: z.array(z.unknown()).catch([]).optional(),
    enrichmentStages: z.array(z.unknown()).catch([]).optional(),
    trustScore: finiteNumber.min(0).max(99).optional(),
    calibrationLog: z.unknown().optional(),
    imageRoleTelemetry: z.unknown().optional(),
    resellerBehaviorProfile: z.string().optional(),
    resellerRuleActions: z.array(z.unknown()).catch([]).optional(),
    resellerWarnings: z.array(z.string()).catch([]).optional(),
    adjustedRecommendation: z.string().optional(),
    adjustedConfidenceScore: finiteNumber.min(0).max(100).optional(),
    explanationSummary: z.string().optional(),
    resellerEngineTelemetry: z.unknown().optional(),
    crossListDrafts: z.array(CrossListDraftSchema).catch([]).optional(),
    listingOrchestration: z.unknown().optional(),
    inventorySyncSnapshot: z.unknown().optional(),
    inventoryOS: z.unknown().optional(),
    aiAgentSummary: z.string().optional(),
    aiAgentEvents: z.array(z.unknown()).catch([]).optional(),
    aiAgentTelemetry: z.unknown().optional(),
    aiAgentDecisions: z.array(z.unknown()).catch([]).optional(),
    executionFlow: z.array(z.string()).catch([]).optional(),
    agentDecisionHierarchy: z.array(z.string()).catch([]).optional(),
    breakEven: finiteNumber.nullable().optional(),
    brand: z.string().optional(),
    category: z.string().optional(),
    upc: z.string().optional(),
    visibleText: z.string().optional(),
    searchQuery: z.string().optional(),
    estimatedShippingCost: finiteNumber.optional(),
    platformFees: finiteNumber.optional(),
    scanPipeline: z.array(z.unknown()).catch([]).optional(),
    marketConfidence: z
      .object({
        value: finiteNumber.min(0).max(100),
        label: z.string().min(1)
      })
      .strict()
      .optional(),
    recommendedMarketplace: z
      .object({
        platform: z.string().min(1),
        reason: z.string().min(1)
      })
      .strict()
      .optional(),
    marketplaceEligibility: MarketplaceEligibilitySchema.optional(),
    sourcingAnalytics: z
      .object({
        roiPercentage: finiteNumber.nullable(),
        estimatedMonthlySales: finiteNumber,
        collectorScore: z
          .object({
            score: finiteNumber.min(0).max(100),
            label: z.string().min(1)
          })
          .strict(),
        retailArbitrageDifficulty: z
          .object({
            score: finiteNumber.min(0).max(100),
            label: z.string().min(1)
          })
          .strict(),
        riskLevel: z
          .object({
            label: z.union([
              z.literal("Low Risk"),
              z.literal("Medium Risk"),
              z.literal("High Risk"),
              z.string().min(1)
            ]),
            score: finiteNumber.min(0).max(100)
          })
          .strict(),
        bestBuyPrice: finiteNumber,
        trendSignal: z.string().min(1)
      })
      .strict()
      .optional(),
    comps: z.array(NormalizedCompSchema).catch([])
  })
  .strict();

export const ScanStatusSchema = z
  .object({
    usedVision: z.boolean().catch(false),
    visionAttempted: z.boolean().catch(false),
    fallbackActivated: z.boolean().catch(false).optional(),
    warning: z.string().catch("")
  })
  .passthrough();

export const AnalyzeDashboardPayloadSchema = z
  .object({
    ok: z.literal(true),
    listing: NormalizedListingSchema,
    scanStatus: ScanStatusSchema
  })
  .passthrough();

export type NormalizedListing = z.infer<typeof NormalizedListingSchema>;
export type AnalyzeDashboardPayload = z.infer<typeof AnalyzeDashboardPayloadSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type TrustedCompSummary = z.infer<typeof TrustedCompSummarySchema>;

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: unknown, min: number, max: number, fallback = 0) {
  return Math.max(min, Math.min(max, asNumber(value, fallback)));
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function repairSourceCostProfiles(value: unknown): SourceCostProfile[] {
  return asArray<Record<string, any>>(value)
    .map((source) => ({
      sourceId: source?.sourceId,
      sourceName: asString(source?.sourceName, "Source"),
      costBasis: source?.costBasis == null ? null : Math.max(0, asNumber(source.costBasis, 0)),
      isUserOverride: Boolean(source?.isUserOverride)
    }))
    .filter((source): source is SourceCostProfile => SourceCostProfileSchema.safeParse(source).success);
}

function repairSourceProfitMetrics(value: unknown): SourceProfitMetrics[] {
  return asArray<Record<string, any>>(value)
    .map((source) => ({
      sourceId: asString(source?.sourceId, "source"),
      sourceName: asString(source?.sourceName, "Source"),
      costBasis: source?.costBasis == null ? null : Math.max(0, asNumber(source.costBasis, 0)),
      netProfit: source?.netProfit == null ? null : asNumber(source.netProfit, 0),
      returnOnInvestment:
        source?.returnOnInvestment == null ? null : asNumber(source.returnOnInvestment, 0),
      status: ["BUY", "HOLD", "SKIP", "UNAVAILABLE"].includes(String(source?.status))
        ? source.status
        : "UNAVAILABLE"
    }))
    .filter((source): source is SourceProfitMetrics => SourceProfitMetricsSchema.safeParse(source).success);
}

function repairResellerSignals(value: unknown): ResellerSignal[] {
  return asArray<unknown>(value).filter((item): item is ResellerSignal =>
    ResellerSignalSchema.safeParse(item).success
  );
}

function repairEngineTelemetry(value: unknown): EngineTelemetry {
  const source = value && typeof value === "object" ? (value as Record<string, any>) : {};
  const telemetry = {
    compCount: Math.max(0, asNumber(source.compCount, 0)),
    velocityScore: VelocityScoreSchema.safeParse(source.velocityScore).success
      ? source.velocityScore
      : "DEAD",
    saturationRatio: Math.max(0, asNumber(source.saturationRatio, 0)),
    confidenceBreakdown: asArray<unknown>(source.confidenceBreakdown).map(String).filter(Boolean),
    ocrConfidence: source.ocrConfidence === "HIGH" ? "HIGH" : "LOW",
    isMultipackOrBundle: Boolean(source.isMultipackOrBundle)
  };
  return EngineTelemetrySchema.parse(telemetry);
}

function repairMarketComps(value: unknown): MarketComps | undefined {
  const source = value && typeof value === "object" ? (value as Record<string, any>) : {};
  if (!Object.keys(source).length) return undefined;
  return {
    averageResalePrice:
      source.averageResalePrice == null ? undefined : Math.max(0, asNumber(source.averageResalePrice, 0)),
    recentSalesCount:
      source.recentSalesCount == null ? undefined : Math.max(0, asNumber(source.recentSalesCount, 0)),
    staleComps: Boolean(source.staleComps),
    priceVarianceHigh: Boolean(source.priceVarianceHigh)
  };
}

function repairDecisionCard(value: unknown, fallback: Record<string, any>): DecisionCardData {
  const source = value && typeof value === "object" ? (value as Record<string, any>) : {};
  const telemetry = repairEngineTelemetry(source.telemetry || fallback.engineTelemetry);
  return {
    product: {
      title: asString(source.product?.title, asString(fallback.itemTitle, "Scanned item")),
      brand: asString(source.product?.brand, asString(fallback.brand, "")),
      category: asString(source.product?.category, asString(fallback.category, "")),
      upc: asString(source.product?.upc, asString(fallback.upc, ""))
    },
    action: ["BUY", "HOLD", "SKIP", "MANUAL_REVIEW"].includes(String(source.action))
      ? source.action
      : "MANUAL_REVIEW",
    confidenceScore: clamp(source.confidenceScore ?? fallback.confidenceScore, 0, 100, 0),
    reasoning: asString(
      source.reasoning,
      asString(fallback.recommendationExplanation || fallback.sourcingTip, "Manual review recommended.")
    ),
    signals: repairResellerSignals(source.signals || fallback.resellerSignals),
    missingDataPoints: asArray<unknown>(source.missingDataPoints || fallback.missingDataPoints).map(String),
    telemetry
  };
}

function repairTrustedCompSummary(value: unknown) {
  const source = value && typeof value === "object" ? (value as Record<string, any>) : {};
  const summary = {
    acceptedComps: Math.max(0, asNumber(source.acceptedComps, 0)),
    rejectedComps: Math.max(0, asNumber(source.rejectedComps, 0)),
    averageSoldPrice:
      source.averageSoldPrice == null ? null : Math.max(0, asNumber(source.averageSoldPrice, 0)),
    soldCount: Math.max(0, asNumber(source.soldCount, 0)),
    soldCount90d: Math.max(0, asNumber(source.soldCount90d, 0)),
    activeCount: Math.max(0, asNumber(source.activeCount, 0)),
    sellThroughRate:
      source.sellThroughRate == null ? null : Math.max(0, asNumber(source.sellThroughRate, 0)),
    saturationRatio: Math.max(0, asNumber(source.saturationRatio, 0)),
    saturationRisk: ["LOW", "MEDIUM", "HIGH"].includes(String(source.saturationRisk))
      ? source.saturationRisk
      : "HIGH",
    saturationFlags:
      source.saturationFlags && typeof source.saturationFlags === "object"
        ? {
            oversaturated: Boolean(source.saturationFlags.oversaturated),
            floodedAmazonLiquidation: Boolean(source.saturationFlags.floodedAmazonLiquidation),
            weakSoldToActiveRatio: Boolean(source.saturationFlags.weakSoldToActiveRatio),
            staleSoldComps: Boolean(source.saturationFlags.staleSoldComps)
          }
        : {
            oversaturated: false,
            floodedAmazonLiquidation: false,
            weakSoldToActiveRatio: false,
            staleSoldComps: false
          },
    velocityScore: ["FAST", "HEALTHY", "MODERATE", "SLOW", "DEAD"].includes(String(source.velocityScore))
      ? source.velocityScore
      : "DEAD",
    velocityTier: VelocityScoreSchema.safeParse(source.velocityTier).success
      ? source.velocityTier
      : source.velocityScore === "FAST" || source.velocityScore === "HEALTHY"
        ? "HIGH"
        : source.velocityScore === "MODERATE"
          ? "MODERATE"
          : source.velocityScore === "DEAD"
            ? "DEAD"
            : "LOW",
    rejectionReasons:
      source.rejectionReasons && typeof source.rejectionReasons === "object"
        ? Object.fromEntries(
            Object.entries(source.rejectionReasons).map(([key, count]) => [key, Math.max(0, asNumber(count, 0))])
          )
        : {},
    generatedSearchQueries: asArray<unknown>(source.generatedSearchQueries).map(String).filter(Boolean),
    generatedSearchQueryTelemetry: asArray<unknown>(source.generatedSearchQueryTelemetry),
    enrichmentStages: asArray<Record<string, any>>(source.enrichmentStages).map((stage) => ({
      stage: asString(stage?.stage, ""),
      query: asString(stage?.query, ""),
      status: asString(stage?.status, "")
    })),
    rejectionDetails: asArray<Record<string, any>>(source.rejectionDetails).map((item) => ({
      title: asString(item?.title, ""),
      reason: asString(item?.reason, "title_mismatch"),
      failedToken: asString(item?.failedToken, ""),
      failedUpc: asString(item?.failedUpc, ""),
      staleAge: item?.staleAge == null ? null : Math.max(0, asNumber(item.staleAge, 0)),
      multipackMismatch: Boolean(item?.multipackMismatch),
      poisonedKeyword: asString(item?.poisonedKeyword, "")
    })),
    identityConfidence:
      source.identityConfidence && typeof source.identityConfidence === "object"
        ? {
            score: clamp(source.identityConfidence.score, 0, 99, 0),
            upcMatched: Boolean(source.identityConfidence.upcMatched),
            brandMatched: Boolean(source.identityConfidence.brandMatched),
            titleTokenSimilarity: Math.max(0, asNumber(source.identityConfidence.titleTokenSimilarity, 0)),
            marketplaceTitleOverlap: Math.max(0, asNumber(source.identityConfidence.marketplaceTitleOverlap, 0)),
            matchedKeywords: asArray<unknown>(source.identityConfidence.matchedKeywords).map(String),
            rejectedKeywords: asArray<unknown>(source.identityConfidence.rejectedKeywords).map(String),
            unresolvedTokens: asArray<unknown>(source.identityConfidence.unresolvedTokens).map(String)
          }
        : undefined,
    trustScore: source.trustScore == null ? undefined : clamp(source.trustScore, 0, 99, 0),
    queryMatchMetrics: asArray<unknown>(source.queryMatchMetrics),
    acceptedCompScoring: source.acceptedCompScoring,
    acceptedCompReasons: asArray<unknown>(source.acceptedCompReasons),
    strongestTokens: asArray<unknown>(source.strongestTokens),
    rejectedTokens: asArray<unknown>(source.rejectedTokens).map(String),
    rejectedVisualIndicators: asArray<unknown>(source.rejectedVisualIndicators).map(String),
    confidenceCollapseReasons: asArray<unknown>(source.confidenceCollapseReasons).map(String),
    visualConfidenceStage: asString(source.visualConfidenceStage, "LOW_CONFIDENCE_UNKNOWN"),
    queryPathSelected: asString(source.queryPathSelected, ""),
    trustGrade: asString(source.trustGrade, "LOW"),
    confidenceGrade: asString(source.confidenceGrade, "LOW")
  };
  return TrustedCompSummarySchema.parse(summary);
}

function repairProductCandidates(value: unknown): ProductCandidate[] {
  return asArray<Record<string, any>>(value)
    .map((candidate) => ({
      title: asString(candidate?.title, ""),
      brand: asString(candidate?.brand, ""),
      category: asString(candidate?.category, ""),
      upc: asString(candidate?.upc, ""),
      source: asString(candidate?.source, "scan"),
      confidence: clamp(candidate?.confidence, 0, 100, 0),
      matchedTokens: asArray<unknown>(candidate?.matchedTokens).map(String),
      reasonSuggested: asString(candidate?.reasonSuggested, "")
    }))
    .filter((candidate) => candidate.title)
    .slice(0, 5);
}

function repairConfirmedProductIdentity(value: unknown): ProductCandidate | null {
  const [candidate] = repairProductCandidates(value ? [value] : []);
  return candidate || null;
}

function repairCrossListDrafts(value: unknown): CrossListDraft[] {
  return asArray<Record<string, any>>(value)
    .map((draft) => ({
      platform: asString(draft?.platform, ""),
      displayName: asString(draft?.displayName, asString(draft?.platform, "Marketplace")),
      title: asString(draft?.title, "Resale item"),
      description: asString(draft?.description, ""),
      bulletPoints: asArray<unknown>(draft?.bulletPoints).map(String),
      hashtags: asArray<unknown>(draft?.hashtags).map(String),
      category: asString(draft?.category, "Uncategorized"),
      metadata: {
        titleLimit: Math.max(1, asNumber(draft?.metadata?.titleLimit, 80)),
        conditionLanguage: asString(draft?.metadata?.conditionLanguage, "Review condition before publishing."),
        tone: asString(draft?.metadata?.tone, "marketplace"),
        requiresBrand: Boolean(draft?.metadata?.requiresBrand),
        publishReady: Boolean(draft?.metadata?.publishReady),
        warnings: asArray<unknown>(draft?.metadata?.warnings).map(String)
      }
    }))
    .filter((draft): draft is CrossListDraft => CrossListDraftSchema.safeParse(draft).success);
}

export function repairAnalysisResult(value: unknown): AnalysisResult {
  const source = value && typeof value === "object" ? (value as Record<string, any>) : {};
  return {
    ...source,
    itemTitle: asString(source.itemTitle, ""),
    brand: asString(source.brand, ""),
    category: asString(source.category, ""),
    condition: asString(source.condition, ""),
    keyDetails: asArray<unknown>(source.keyDetails).map(String),
    quantity: asString(source.quantity, ""),
    priceRange:
      source.priceRange && typeof source.priceRange === "object"
        ? {
            ...source.priceRange,
            low: source.priceRange.low == null ? undefined : asNumber(source.priceRange.low, 0),
            suggested:
              source.priceRange.suggested == null
                ? undefined
                : asNumber(source.priceRange.suggested, 0),
            high: source.priceRange.high == null ? undefined : asNumber(source.priceRange.high, 0)
          }
        : undefined,
    shippingNotes: asString(source.shippingNotes, ""),
    upc: asString(source.upc, ""),
    productImageUrl: asString(source.productImageUrl, ""),
    productLine: asString(source.productLine, ""),
    itemNumber: asString(source.itemNumber, ""),
    variant: asString(source.variant, ""),
    edition: asString(source.edition, ""),
    demand: asString(source.demand, ""),
    sellThrough: asString(source.sellThrough, ""),
    sellThroughRatio:
      source.sellThroughRatio == null ? null : asNumber(source.sellThroughRatio, 0),
    bestMatches: asArray<unknown>(source.bestMatches),
    confidence: clamp(source.confidence, 0, 1, 0),
    estimatedResalePrice:
      source.estimatedResalePrice == null ? undefined : Math.max(0, asNumber(source.estimatedResalePrice, 0)),
    averageSoldPrice:
      source.averageSoldPrice == null ? undefined : Math.max(0, asNumber(source.averageSoldPrice, 0)),
    lowestSold: source.lowestSold == null ? null : Math.max(0, asNumber(source.lowestSold, 0)),
    highestSold: source.highestSold == null ? null : Math.max(0, asNumber(source.highestSold, 0)),
    soldCount: Math.max(0, asNumber(source.soldCount, 0)),
    walmartPrice: source.walmartPrice == null ? null : Math.max(0, asNumber(source.walmartPrice, 0)),
    walmartTitle: asString(source.walmartTitle, ""),
    marketData:
      source.marketData && typeof source.marketData === "object"
        ? {
            walmartPrice:
              source.marketData.walmartPrice == null
                ? null
                : Math.max(0, asNumber(source.marketData.walmartPrice, 0)),
            walmartTitle: asString(source.marketData.walmartTitle, ""),
            soldCount: Math.max(0, asNumber(source.marketData.soldCount, 0)),
            lowestSold:
              source.marketData.lowestSold == null
                ? null
                : Math.max(0, asNumber(source.marketData.lowestSold, 0)),
            averageSold:
              source.marketData.averageSold == null
                ? null
                : Math.max(0, asNumber(source.marketData.averageSold, 0)),
            highestSold:
              source.marketData.highestSold == null
                ? null
                : Math.max(0, asNumber(source.marketData.highestSold, 0)),
            confidence: clamp(source.marketData.confidence, 0, 100, 0)
          }
        : undefined,
    summary: asString(source.summary, ""),
    recognitionEvidence: asArray<unknown>(source.recognitionEvidence).map(String),
    ocrText: asArray<unknown>(source.ocrText).map(String),
    brandCandidates: asArray<unknown>(source.brandCandidates),
    categorySignals: asArray<unknown>(source.categorySignals).map(String),
    conditionSignals: asArray<unknown>(source.conditionSignals).map(String),
    packagingHints: asArray<unknown>(source.packagingHints).map(String),
    visualAnchors: asArray<unknown>(source.visualAnchors).map(String),
    imageObservations: asArray<unknown>(source.imageObservations),
    imageRoleTelemetry: source.imageRoleTelemetry,
    missingViews: asArray<unknown>(source.missingViews).map(String),
    recommendationReasons: asArray<unknown>(source.recommendationReasons).map(String),
    sourceBadges: asArray<unknown>(source.sourceBadges).map(String),
    marketDataUnavailable: Boolean(source.marketDataUnavailable),
    sourceCostProfiles: repairSourceCostProfiles(source.sourceCostProfiles),
    sourceProfitMetrics: repairSourceProfitMetrics(source.sourceProfitMetrics),
    sourceStoreType: asString(source.sourceStoreType, ""),
    resolvedCostBasis:
      source.resolvedCostBasis == null ? undefined : Math.max(0, asNumber(source.resolvedCostBasis, 0)),
    lookupSource: asString(source.lookupSource, ""),
    manualOverrideValue:
      source.manualOverrideValue == null ? null : Math.max(0, asNumber(source.manualOverrideValue, 0)),
    resaleAuthoritySource: asString(source.resaleAuthoritySource, ""),
    marketComps: repairMarketComps(source.marketComps),
    resellerSignals: repairResellerSignals(source.resellerSignals),
    missingDataPoints: asArray<unknown>(source.missingDataPoints).map(String),
    engineTelemetry: repairEngineTelemetry(source.engineTelemetry),
    decisionCard: repairDecisionCard(source.decisionCard, source),
    trustedCompSummary: repairTrustedCompSummary(source.trustedCompSummary),
    productCandidates: repairProductCandidates(source.productCandidates),
    confirmedProductIdentity: repairConfirmedProductIdentity(source.confirmedProductIdentity),
    generatedSearchQueries: asArray<unknown>(source.generatedSearchQueries).map(String).filter(Boolean),
    generatedSearchQueryTelemetry: asArray<unknown>(source.generatedSearchQueryTelemetry),
    enrichmentStages: asArray<unknown>(source.enrichmentStages),
    trustScore: source.trustScore == null ? undefined : clamp(source.trustScore, 0, 99, 0),
    calibrationLog: source.calibrationLog,
    resellerBehaviorProfile: asString(source.resellerBehaviorProfile, ""),
    resellerRuleActions: asArray<unknown>(source.resellerRuleActions),
    resellerWarnings: asArray<unknown>(source.resellerWarnings).map(String),
    adjustedRecommendation: asString(source.adjustedRecommendation, ""),
    adjustedConfidenceScore:
      source.adjustedConfidenceScore == null ? undefined : clamp(source.adjustedConfidenceScore, 0, 100, 0),
    explanationSummary: asString(source.explanationSummary, ""),
    resellerEngineTelemetry: source.resellerEngineTelemetry,
    crossListDrafts: repairCrossListDrafts(source.crossListDrafts),
    listingOrchestration: source.listingOrchestration,
    inventorySyncSnapshot: source.inventorySyncSnapshot,
    inventoryOS: source.inventoryOS,
    aiAgentSummary: asString(source.aiAgentSummary, ""),
    aiAgentEvents: asArray<unknown>(source.aiAgentEvents),
    aiAgentTelemetry: source.aiAgentTelemetry,
    aiAgentDecisions: asArray<unknown>(source.aiAgentDecisions),
    executionFlow: asArray<unknown>(source.executionFlow).map(String),
    agentDecisionHierarchy: asArray<unknown>(source.agentDecisionHierarchy).map(String),
    breakEven: source.breakEven == null ? null : Math.max(0, asNumber(source.breakEven, 0))
  };
}

export function validateOrRepairAnalysisResult(value: unknown, context = "analysis") {
  const parsed = AnalysisResultSchema.safeParse(value);
  if (parsed.success) {
    console.info("Boss Listers analysis schema validation success", { context });
    return parsed.data;
  }

  console.error("Boss Listers analysis schema validation failed", {
    context,
    issues: parsed.error.issues
  });
  const repaired = repairAnalysisResult(value);
  const repairedParsed = AnalysisResultSchema.safeParse(repaired);
  if (repairedParsed.success) {
    console.info("Boss Listers analysis schema validation repaired", { context });
    return repairedParsed.data;
  }
  return repairAnalysisResult({});
}

function sanitizeEligibilityStatus(value: unknown): z.infer<typeof EligibilityStatusSchema> {
  const result = EligibilityStatusSchema.safeParse(value);
  return result.success ? result.data : "Not Recommended";
}

export function repairNormalizedListing(value: unknown): NormalizedListing {
  const source = value && typeof value === "object" ? (value as Record<string, any>) : {};
  const marketConfidence =
    source.marketConfidence && typeof source.marketConfidence === "object"
      ? {
          value: clamp(source.marketConfidence.value, 0, 100, 0),
          label: asString(source.marketConfidence.label, "Market read")
        }
      : undefined;
  const recommendedMarketplace =
    source.recommendedMarketplace && typeof source.recommendedMarketplace === "object"
      ? {
          platform: asString(source.recommendedMarketplace.platform, "eBay"),
          reason: asString(
            source.recommendedMarketplace.reason,
            "Review marketplace fit before listing."
          )
        }
      : undefined;
  const marketplaceEligibility =
    source.marketplaceEligibility && typeof source.marketplaceEligibility === "object"
      ? {
          platforms: asArray<Record<string, any>>(source.marketplaceEligibility.platforms).map(
            (item) => ({
              platform: asString(item?.platform, "Marketplace"),
              status: sanitizeEligibilityStatus(item?.status),
              reason: asString(item?.reason, "Review marketplace rules before listing."),
              flags: asArray<unknown>(item?.flags).map(String)
            })
          ),
          bestPlatformsToList: asArray<unknown>(
            source.marketplaceEligibility.bestPlatformsToList
          ).map(String),
          avoidListingOn: asArray<unknown>(source.marketplaceEligibility.avoidListingOn).map(
            String
          ),
          approvalNeeded: asArray<unknown>(source.marketplaceEligibility.approvalNeeded).map(
            String
          )
        }
      : undefined;
  const sourcingAnalytics =
    source.sourcingAnalytics && typeof source.sourcingAnalytics === "object"
      ? {
          roiPercentage:
            source.sourcingAnalytics.roiPercentage == null
              ? null
              : asNumber(source.sourcingAnalytics.roiPercentage, 0),
          estimatedMonthlySales: Math.max(0, asNumber(source.sourcingAnalytics.estimatedMonthlySales, 0)),
          collectorScore: {
            score: clamp(source.sourcingAnalytics.collectorScore?.score, 0, 100, 0),
            label: asString(source.sourcingAnalytics.collectorScore?.label, "Standard Demand")
          },
          retailArbitrageDifficulty: {
            score: clamp(source.sourcingAnalytics.retailArbitrageDifficulty?.score, 0, 100, 0),
            label: asString(source.sourcingAnalytics.retailArbitrageDifficulty?.label, "Moderate")
          },
          riskLevel: {
            label: asString(source.sourcingAnalytics.riskLevel?.label, "Medium Risk"),
            score: clamp(source.sourcingAnalytics.riskLevel?.score, 0, 100, 0)
          },
          bestBuyPrice: Math.max(0, asNumber(source.sourcingAnalytics.bestBuyPrice, 0)),
          trendSignal: asString(source.sourcingAnalytics.trendSignal, "Stable demand")
        }
      : undefined;

  return {
    itemTitle: asString(source.itemTitle, "Scanned item"),
    thumbnailUrl: typeof source.thumbnailUrl === "string" ? source.thumbnailUrl : "",
    sellThroughRate: asString(source.sellThroughRate, "Unavailable"),
    averageSalePrice:
      source.averageSalePrice == null ? null : Math.max(0, asNumber(source.averageSalePrice, 0)),
    profitPotential:
      source.profitPotential == null ? null : asNumber(source.profitPotential, 0),
    demandLevel: asString(source.demandLevel, "Unknown"),
    sourcingTip: asString(source.sourcingTip, "Review comps before sourcing this item."),
    confidenceScore:
      source.confidenceScore == null ? undefined : clamp(source.confidenceScore, 0, 100, 0),
    estimatedResalePrice:
      source.estimatedResalePrice == null ? undefined : Math.max(0, asNumber(source.estimatedResalePrice, 0)),
    estimatedProfit:
      source.estimatedProfit == null ? undefined : asNumber(source.estimatedProfit, 0),
    roiPercentage:
      source.roiPercentage == null ? undefined : asNumber(source.roiPercentage, 0),
    demandScore: source.demandScore == null ? undefined : clamp(source.demandScore, 0, 100, 0),
    recommendation: typeof source.recommendation === "string" ? source.recommendation : "",
    recommendationExplanation:
      typeof source.recommendationExplanation === "string" ? source.recommendationExplanation : "",
    sourceBadges: asArray<unknown>(source.sourceBadges).map(String),
    marketDataUnavailable: Boolean(source.marketDataUnavailable),
    sourceCostProfiles: repairSourceCostProfiles(source.sourceCostProfiles),
    sourceProfitMetrics: repairSourceProfitMetrics(source.sourceProfitMetrics),
    sourceStoreType: typeof source.sourceStoreType === "string" ? source.sourceStoreType : "",
    resolvedCostBasis:
      source.resolvedCostBasis == null ? undefined : Math.max(0, asNumber(source.resolvedCostBasis, 0)),
    lookupSource: typeof source.lookupSource === "string" ? source.lookupSource : "",
    manualOverrideValue:
      source.manualOverrideValue == null ? null : Math.max(0, asNumber(source.manualOverrideValue, 0)),
    resaleAuthoritySource:
      typeof source.resaleAuthoritySource === "string" ? source.resaleAuthoritySource : "",
    pricingSource: typeof source.pricingSource === "string" ? source.pricingSource : "",
    pricingHierarchy: asArray<unknown>(source.pricingHierarchy).map(String),
    userVerifiedCorrection: source.userVerifiedCorrection,
    matchedPersonalSale: source.matchedPersonalSale,
    scanFingerprint: asString(source.scanFingerprint, ""),
    matchingKeys: asArray<unknown>(source.matchingKeys).map(String),
    ocrText: asArray<unknown>(source.ocrText).map(String),
    visualAnchors: asArray<unknown>(source.visualAnchors).map(String),
    packagingHints: asArray<unknown>(source.packagingHints).map(String),
    marketComps: repairMarketComps(source.marketComps),
    resellerSignals: repairResellerSignals(source.resellerSignals),
    missingDataPoints: asArray<unknown>(source.missingDataPoints).map(String),
    engineTelemetry: repairEngineTelemetry(source.engineTelemetry),
    decisionCard: repairDecisionCard(source.decisionCard, source),
    trustedCompSummary: repairTrustedCompSummary(source.trustedCompSummary),
    productCandidates: repairProductCandidates(source.productCandidates),
    confirmedProductIdentity: repairConfirmedProductIdentity(source.confirmedProductIdentity),
    generatedSearchQueries: asArray<unknown>(source.generatedSearchQueries).map(String).filter(Boolean),
    generatedSearchQueryTelemetry: asArray<unknown>(source.generatedSearchQueryTelemetry),
    enrichmentStages: asArray<unknown>(source.enrichmentStages),
    trustScore: source.trustScore == null ? undefined : clamp(source.trustScore, 0, 99, 0),
    calibrationLog: source.calibrationLog,
    imageRoleTelemetry: source.imageRoleTelemetry,
    resellerBehaviorProfile: asString(source.resellerBehaviorProfile, ""),
    resellerRuleActions: asArray<unknown>(source.resellerRuleActions),
    resellerWarnings: asArray<unknown>(source.resellerWarnings).map(String),
    adjustedRecommendation: asString(source.adjustedRecommendation, ""),
    adjustedConfidenceScore:
      source.adjustedConfidenceScore == null ? undefined : clamp(source.adjustedConfidenceScore, 0, 100, 0),
    explanationSummary: asString(source.explanationSummary, ""),
    resellerEngineTelemetry: source.resellerEngineTelemetry,
    crossListDrafts: repairCrossListDrafts(source.crossListDrafts),
    listingOrchestration: source.listingOrchestration,
    inventorySyncSnapshot: source.inventorySyncSnapshot,
    inventoryOS: source.inventoryOS,
    aiAgentSummary: asString(source.aiAgentSummary, ""),
    aiAgentEvents: asArray<unknown>(source.aiAgentEvents),
    aiAgentTelemetry: source.aiAgentTelemetry,
    aiAgentDecisions: asArray<unknown>(source.aiAgentDecisions),
    executionFlow: asArray<unknown>(source.executionFlow).map(String),
    agentDecisionHierarchy: asArray<unknown>(source.agentDecisionHierarchy).map(String),
    breakEven: source.breakEven == null ? null : Math.max(0, asNumber(source.breakEven, 0)),
    brand: typeof source.brand === "string" ? source.brand : "",
    category: typeof source.category === "string" ? source.category : "",
    upc: typeof source.upc === "string" ? source.upc : "",
    visibleText: typeof source.visibleText === "string" ? source.visibleText : "",
    searchQuery: typeof source.searchQuery === "string" ? source.searchQuery : "",
    averageSoldPrice:
      source.averageSoldPrice == null ? undefined : Math.max(0, asNumber(source.averageSoldPrice, 0)),
    lowestSold: source.lowestSold == null ? null : Math.max(0, asNumber(source.lowestSold, 0)),
    highestSold: source.highestSold == null ? null : Math.max(0, asNumber(source.highestSold, 0)),
    soldCount: Math.max(0, asNumber(source.soldCount, 0)),
    walmartPrice: source.walmartPrice == null ? null : Math.max(0, asNumber(source.walmartPrice, 0)),
    walmartTitle: asString(source.walmartTitle, ""),
    marketData:
      source.marketData && typeof source.marketData === "object"
        ? {
            walmartPrice:
              source.marketData.walmartPrice == null
                ? null
                : Math.max(0, asNumber(source.marketData.walmartPrice, 0)),
            walmartTitle: asString(source.marketData.walmartTitle, ""),
            soldCount: Math.max(0, asNumber(source.marketData.soldCount, 0)),
            lowestSold:
              source.marketData.lowestSold == null
                ? null
                : Math.max(0, asNumber(source.marketData.lowestSold, 0)),
            averageSold:
              source.marketData.averageSold == null
                ? null
                : Math.max(0, asNumber(source.marketData.averageSold, 0)),
            highestSold:
              source.marketData.highestSold == null
                ? null
                : Math.max(0, asNumber(source.marketData.highestSold, 0)),
            confidence: clamp(source.marketData.confidence, 0, 100, 0)
          }
        : undefined,
    estimatedShippingCost:
      source.estimatedShippingCost == null ? undefined : Math.max(0, asNumber(source.estimatedShippingCost, 0)),
    platformFees:
      source.platformFees == null ? undefined : Math.max(0, asNumber(source.platformFees, 0)),
    scanPipeline: asArray<unknown>(source.scanPipeline),
    marketConfidence,
    recommendedMarketplace,
    marketplaceEligibility,
    sourcingAnalytics,
    comps: asArray<Record<string, any>>(source.comps).map((comp) => ({
      sourcePlatform: asString(comp?.sourcePlatform, asString(comp?.platform, "Marketplace")),
      price: Math.max(0, asNumber(comp?.price, 0)),
      dateSold: asString(comp?.dateSold, asString(comp?.soldAt, "Recent"))
    }))
  };
}

export function validateOrRepairNormalizedListing(value: unknown, context = "listing") {
  const parsed = NormalizedListingSchema.safeParse(value);
  if (parsed.success) {
    console.info("Boss Listers schema validation success", { context });
    return parsed.data;
  }

  console.error("Boss Listers schema validation failed", {
    context,
    issues: parsed.error.issues
  });
  const repaired = repairNormalizedListing(value);
  const repairedParsed = NormalizedListingSchema.safeParse(repaired);
  if (repairedParsed.success) {
    console.info("Boss Listers schema validation repaired", { context });
    return repairedParsed.data;
  }

  console.error("Boss Listers repaired schema validation failed", {
    context,
    issues: repairedParsed.error.issues
  });
  return {
    itemTitle: "Scanned item",
    thumbnailUrl: "",
    sellThroughRate: "Unavailable",
    averageSalePrice: null,
    profitPotential: null,
    demandLevel: "Unknown",
    sourcingTip: "Review comps before sourcing this item.",
    confidenceScore: 0,
    resellerSignals: [],
    missingDataPoints: ["No trustworthy sold comps available."],
    engineTelemetry: repairEngineTelemetry({}),
    decisionCard: repairDecisionCard({}, { recommendation: "MANUAL_REVIEW" }),
    trustedCompSummary: repairTrustedCompSummary({}),
    productCandidates: [],
    confirmedProductIdentity: null,
    generatedSearchQueries: [],
    generatedSearchQueryTelemetry: [],
    enrichmentStages: [],
    trustScore: 0,
    calibrationLog: undefined,
    imageRoleTelemetry: undefined,
    resellerBehaviorProfile: "",
    resellerRuleActions: [],
    resellerWarnings: [],
    adjustedRecommendation: "MANUAL_REVIEW",
    adjustedConfidenceScore: 0,
    explanationSummary: "",
    resellerEngineTelemetry: undefined,
    crossListDrafts: [],
    listingOrchestration: undefined,
    inventorySyncSnapshot: undefined,
    inventoryOS: undefined,
    breakEven: null,
    brand: "",
    upc: "",
    comps: []
  };
}

export function repairAnalyzeDashboardPayload(value: Record<string, any>) {
  const payload = value && typeof value === "object" ? value : {};
  return {
    ...payload,
    ok: true,
    listing: validateOrRepairNormalizedListing(payload.listing, "analyze.listing"),
    scanStatus: {
      usedVision: Boolean(payload.scanStatus?.usedVision),
      visionAttempted: Boolean(payload.scanStatus?.visionAttempted),
      fallbackActivated: Boolean(payload.scanStatus?.fallbackActivated),
      warning: typeof payload.scanStatus?.warning === "string" ? payload.scanStatus.warning : ""
    },
    instrumentation: {
      ...(payload.instrumentation || {}),
      malformedPayloadRepair: true
    }
  };
}

export function validateOrRepairAnalyzeDashboardPayload(value: Record<string, any>) {
  const parsed = AnalyzeDashboardPayloadSchema.safeParse(value);
  if (parsed.success) {
    console.info("Boss Listers analyze payload schema validation success");
    return parsed.data;
  }

  console.error("Boss Listers analyze payload schema validation failed", {
    issues: parsed.error.issues
  });
  const repaired = repairAnalyzeDashboardPayload(value);
  const repairedParsed = AnalyzeDashboardPayloadSchema.safeParse(repaired);
  if (repairedParsed.success) {
    console.info("Boss Listers analyze payload schema validation repaired");
    return repairedParsed.data;
  }

  console.error("Boss Listers repaired analyze payload validation failed", {
    issues: repairedParsed.error.issues
  });
  return repairAnalyzeDashboardPayload({});
}
