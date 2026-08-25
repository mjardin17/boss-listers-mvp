import {
  validateOrRepairAnalyzeDashboardPayload,
  validateOrRepairNormalizedListing,
  type NormalizedListing
} from "./normalizedListingSchema";

export type AnalyzeDashboardResponse = {
  ok?: boolean;
  error?: string;
  brand?: string;
  productName?: string;
  category?: string;
  visibleText?: string;
  confidence?: number;
  searchQuery?: string;
  estimatedResalePrice?: number;
  averageSoldPrice?: number;
  estimatedShippingCost?: number;
  platformFees?: number;
  estimatedProfit?: number;
  roi?: number;
  marketComps?: Array<{
    title?: string;
    price?: number;
    soldDate?: string;
    sourcePlatform?: string;
    estimated?: boolean;
    confidence?: number;
  }>;
  decision?: "BUY" | "REVIEW" | "SKIP";
  breakEven?: number;
  lowestSold?: number | null;
  highestSold?: number | null;
  soldCount?: number;
  walmartPrice?: number | null;
  walmartTitle?: string;
  marketData?: {
    walmartPrice: number | null;
    walmartTitle: string;
    soldCount: number;
    lowestSold: number | null;
    averageSold: number | null;
    highestSold: number | null;
    confidence: number;
  };
  pipeline?: Array<{
    stage: string;
    status: "complete" | "estimated" | "skipped";
    detail: string;
  }>;
  resellerAnalysis?: {
    brand: string;
    productName: string;
    category: string;
    visibleText: string;
    confidence: number;
    searchQuery: string;
    estimatedResalePrice: number;
    averageSoldPrice: number;
    estimatedShippingCost: number;
    platformFees: number;
    estimatedProfit: number;
    roi: number;
    marketComps: Array<{
      title: string;
      price: number;
      soldDate: string;
      sourcePlatform: "eBay";
      estimated: boolean;
      confidence: number;
    }>;
    decision: "BUY" | "REVIEW" | "SKIP";
    buyCost: number;
    breakEven: number;
    lowestSold: number | null;
    highestSold: number | null;
    soldCount: number;
    walmartPrice: number | null;
    walmartTitle: string;
    marketData: {
      walmartPrice: number | null;
      walmartTitle: string;
      soldCount: number;
      lowestSold: number | null;
      averageSold: number | null;
      highestSold: number | null;
      confidence: number;
    };
    pipeline: Array<{
      stage: string;
      status: "complete" | "estimated" | "skipped";
      detail: string;
    }>;
  };
  listing?: NormalizedListing;
  analysis?: {
    itemTitle?: string;
    confidence?: number;
    sourcingConfidenceScore?: number;
    profitConfidenceScore?: number;
    sellThroughRatio?: number | null;
    sellThrough?: string;
    priceRange?: { suggested?: number };
    soldPriceRange?: { midpoint?: number };
    demand?: string;
    recommendationReasons?: string[];
    buyRecommendation?: string;
    recommendation?: string;
    recommendationExplanation?: string;
    estimatedResalePrice?: number;
    averageSoldPrice?: number;
    lowestSold?: number | null;
    highestSold?: number | null;
    soldCount?: number;
    walmartPrice?: number | null;
    walmartTitle?: string;
    marketData?: NormalizedListing["marketData"];
    estimatedProfit?: number;
    roiPercentage?: number;
    demandScore?: number;
    sourceBadges?: string[];
    marketDataUnavailable?: boolean;
    upc?: string;
    ocrText?: string[];
    sourceStoreType?: string;
    resolvedCostBasis?: number;
    lookupSource?: string;
    manualOverrideValue?: number | null;
    resaleAuthoritySource?: string;
    marketComps?: NormalizedListing["marketComps"];
    resellerSignals?: NormalizedListing["resellerSignals"];
    missingDataPoints?: string[];
    engineTelemetry?: NormalizedListing["engineTelemetry"];
    decisionCard?: NormalizedListing["decisionCard"];
    trustedCompSummary?: NormalizedListing["trustedCompSummary"];
    breakEven?: number | null;
  };
  imageUrls?: string[];
  pricing?: {
    selectedPrice?: number;
    expectedProfit?: { netProfit?: number };
    bestMarketplace?: { profit?: { netProfit?: number } };
  };
  scanStatus?: {
    usedVision?: boolean;
    visionAttempted?: boolean;
    fallbackActivated?: boolean;
    warning?: string;
  };
};

export function normalizeAnalyzeDashboardResponse(
  data: AnalyzeDashboardResponse
): NormalizedListing {
  if (data?.listing) {
    return validateOrRepairAnalyzeDashboardPayload({
      ...data,
      ok: true,
      scanStatus: data.scanStatus || {
        usedVision: false,
        visionAttempted: false,
        fallbackActivated: true,
        warning: ""
      }
    }).listing;
  }

  if (!data?.analysis || typeof data.analysis !== "object") {
    throw new Error("Analyze response did not include a dashboard listing.");
  }

  const analysis = data.analysis;
  const preservedTitle =
    analysis.itemTitle ||
    analysis.ocrText?.find((text) => typeof text === "string" && text.trim()) ||
    "";
  if (!preservedTitle && !analysis.upc) {
    throw new Error("Analyze response did not include product identity data.");
  }
  const analysisWithPricing = analysis as typeof analysis & {
    pricingSource?: string;
    resellerOverride?: { type?: string };
  };
  const pricingWithSource = data?.pricing as typeof data.pricing & { pricingSource?: string };
  const hasPricingAuthority =
    analysisWithPricing.pricingSource === "verified_sold_comps" ||
    analysisWithPricing.pricingSource === "USER_VERIFIED_SALE" ||
    analysisWithPricing.pricingSource === "manual_sold_comp" ||
    analysisWithPricing.pricingSource === "USER_VERIFIED" ||
    pricingWithSource?.pricingSource === "verified_sold_comps" ||
    pricingWithSource?.pricingSource === "USER_VERIFIED_SALE" ||
    pricingWithSource?.pricingSource === "manual_sold_comp" ||
    pricingWithSource?.pricingSource === "USER_VERIFIED" ||
    analysisWithPricing.resellerOverride?.type === "reseller_provided";
  const hasPriceSignal =
    hasPricingAuthority &&
    (Number.isFinite(Number(analysis.estimatedResalePrice)) ||
      Number.isFinite(Number(analysis.soldPriceRange?.midpoint)) ||
      Number.isFinite(Number(data?.pricing?.selectedPrice)));
  const hasProfitSignal =
    hasPricingAuthority &&
    (Number.isFinite(Number(analysis.estimatedProfit)) ||
      Number.isFinite(Number(data?.pricing?.bestMarketplace?.profit?.netProfit)) ||
      Number.isFinite(Number(data?.pricing?.expectedProfit?.netProfit)));
  const hasConfidenceSignal =
    Number(analysis.confidence) > 0 ||
    Number(analysis.sourcingConfidenceScore) > 0 ||
    Number(analysis.profitConfidenceScore) > 0;
  const sellThroughRate =
    analysis.sellThroughRatio != null
      ? `${Math.round(Number(analysis.sellThroughRatio) * 100)}%`
      : analysis.sellThrough || "Unavailable";
  const demand = analysis.demand
    ? analysis.demand[0]?.toUpperCase() + analysis.demand.slice(1)
    : "Unavailable";

  return validateOrRepairNormalizedListing(
    {
      itemTitle: preservedTitle || analysis.upc || "",
      thumbnailUrl: data?.imageUrls?.[0] || "",
      sellThroughRate,
      averageSalePrice:
        hasPriceSignal
          ? Number(analysis.estimatedResalePrice) ||
            Number(analysis.soldPriceRange?.midpoint) ||
            Number(data?.pricing?.selectedPrice)
          : null,
      profitPotential:
        hasProfitSignal
          ? Number(analysis.estimatedProfit) ||
            Number(data?.pricing?.bestMarketplace?.profit?.netProfit) ||
            Number(data?.pricing?.expectedProfit?.netProfit)
          : null,
      demandLevel: demand,
      sourcingTip:
        analysis.recommendationExplanation ||
        analysis.recommendationReasons?.[0] ||
        "Analysis returned incomplete marketplace data. Manual verification recommended.",
      confidenceScore: hasConfidenceSignal
        ? Math.round(
            Math.max(
              0,
              Math.min(
                100,
                Number(analysis.confidence) > 0
                  ? Number(analysis.confidence) * 100
                  : Number(analysis.sourcingConfidenceScore) ||
                      Number(analysis.profitConfidenceScore) ||
                      0
              )
            )
          )
        : undefined,
      upc: analysis.upc || "",
      recommendation: analysis.recommendation || "",
      recommendationExplanation: analysis.recommendationExplanation || "",
      estimatedResalePrice: hasPriceSignal ? Number(analysis.estimatedResalePrice) || undefined : undefined,
      averageSoldPrice: hasPriceSignal ? Number(analysis.averageSoldPrice) || undefined : undefined,
      lowestSold: analysis.lowestSold ?? null,
      highestSold: analysis.highestSold ?? null,
      soldCount: Number(analysis.soldCount) || 0,
      walmartPrice: analysis.walmartPrice ?? null,
      walmartTitle: analysis.walmartTitle || "",
      marketData: analysis.marketData,
      estimatedProfit: hasProfitSignal ? Number(analysis.estimatedProfit) || undefined : undefined,
      roiPercentage: Number.isFinite(Number(analysis.roiPercentage))
        ? Number(analysis.roiPercentage)
        : undefined,
      demandScore: Number(analysis.demandScore) || undefined,
      sourceBadges: Array.isArray(analysis.sourceBadges) ? analysis.sourceBadges : [],
      marketDataUnavailable: Boolean(analysis.marketDataUnavailable || !hasPriceSignal || !hasProfitSignal),
      sourceStoreType: analysis.sourceStoreType || "",
      resolvedCostBasis: Number.isFinite(Number(analysis.resolvedCostBasis))
        ? Number(analysis.resolvedCostBasis)
        : undefined,
      lookupSource: analysis.lookupSource || "",
      manualOverrideValue:
        analysis.manualOverrideValue == null ? null : Number(analysis.manualOverrideValue),
      resaleAuthoritySource: analysis.resaleAuthoritySource || "eBay SOLD comps",
      marketComps: analysis.marketComps,
      resellerSignals: analysis.resellerSignals || [],
      missingDataPoints: analysis.missingDataPoints || [],
      engineTelemetry: analysis.engineTelemetry,
      decisionCard: analysis.decisionCard,
      trustedCompSummary: analysis.trustedCompSummary,
      breakEven: analysis.breakEven ?? null,
      comps: []
    },
    "clientAnalyze.response"
  );
}
