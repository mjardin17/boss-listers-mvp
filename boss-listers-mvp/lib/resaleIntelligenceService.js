import { validateCompTitleMatch } from "./compsIntelligence";

function clamp(value, min, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function firstPositive(...values) {
  return values.map(Number).find((value) => Number.isFinite(value) && value > 0) || 0;
}

function firstFinite(...values) {
  const value = values
    .filter((item) => item != null && item !== "")
    .map(Number)
    .find((number) => Number.isFinite(number));
  return Number.isFinite(value) ? value : null;
}

function firstPositiveFinite(...values) {
  return values.map(Number).find((number) => Number.isFinite(number) && number > 0) || 0;
}

function demandFromLevel(level = "") {
  const normalized = String(level).toLowerCase();
  if (normalized === "high") return 82;
  if (normalized === "medium") return 58;
  if (normalized === "low") return 30;
  return 42;
}

function titleSourceFromAnalysis(analysis = {}, productLookup = null) {
  return {
    title: productLookup?.title || analysis.itemTitle || analysis.title || "",
    model: analysis.model || analysis.itemTitle || productLookup?.title || "",
    upc: analysis.upc || productLookup?.upc || ""
  };
}

function filterMarketCompsByTitle(marketData = [], source = {}) {
  let acceptedCompCount = 0;
  let rejectedCompCount = 0;
  let titleConfidenceTotal = 0;
  const filtered = marketData.map((item) => {
    if (!Array.isArray(item.comps) || !item.comps.length) return item;
    const comps = item.comps.filter((comp) => {
      const result = validateCompTitleMatch(comp, source);
      if (!result.accepted) {
        rejectedCompCount += 1;
        return false;
      }
      acceptedCompCount += 1;
      titleConfidenceTotal += Number(result.overlap) || 0;
      return true;
    });
    return {
      ...item,
      comps,
      soldCount: comps.length,
      averageSoldPrice: firstPositive(...comps.map((comp) => comp.price))
    };
  });
  const total = acceptedCompCount + rejectedCompCount;
  return {
    marketData: filtered,
    titleMatchMetrics: {
      acceptedCompCount,
      rejectedCompCount,
      semanticRejectionRate: total ? Number((rejectedCompCount / total).toFixed(2)) : 0,
      titleMatchConfidence: acceptedCompCount
        ? Number((titleConfidenceTotal / acceptedCompCount).toFixed(2))
        : 0
    }
  };
}

function summarizeMarket(marketData = [], source = {}) {
  const filteredMarket = filterMarketCompsByTitle(marketData, source);
  const connected = filteredMarket.marketData.filter((item) => Number(item.confidence) > 0 || item.comps?.length);
  const averageSoldPrice = firstPositive(
    ...connected.map((item) => item.averageSoldPrice),
    ...connected.flatMap((item) => item.comps || []).map((comp) => comp.price)
  );
  const soldCount = connected.reduce((sum, item) => sum + (Number(item.soldCount) || 0), 0);
  const activeListingCount = connected.reduce(
    (sum, item) => sum + (Number(item.activeListingCount) || 0),
    0
  );
  const sellThroughRate = firstPositive(...connected.map((item) => item.sellThroughRate));
  const confidence = clamp(
    connected.reduce((sum, item) => sum + (Number(item.confidence) || 0), 0) /
      Math.max(1, connected.length),
    0,
    1
  );

  return {
    hasMarketComps: connected.some((item) => Number(item.soldCount) > 0 || item.comps?.length),
    averageSoldPrice,
    soldCount,
    activeListingCount,
    sellThroughRate,
    confidence,
    titleMatchMetrics: filteredMarket.titleMatchMetrics
  };
}

function buildSourceBadges({ upc, visionUsed, marketData }) {
  const badges = [];
  if (upc) badges.push("Barcode");
  if (visionUsed) badges.push("Vision");
  for (const item of marketData || []) {
    if (Number(item.confidence) > 0 || item.comps?.length) badges.push(item.platform);
  }
  return Array.from(new Set(badges));
}

export function buildResaleIntelligence({
  analysis = {},
  pricing = {},
  marketData = [],
  productLookup = null,
  barcodeDetected = false,
  visionUsed = false
} = {}) {
  const market = summarizeMarket(marketData, titleSourceFromAnalysis(analysis, productLookup));
  const hasSoldComps = market.hasMarketComps || pricing.marketSignals?.liveStatus?.sold === "live";
  const estimatedResalePrice = firstPositive(
    market.averageSoldPrice,
    analysis.soldPriceRange?.midpoint,
    hasSoldComps ? analysis.priceRange?.suggested : null,
    hasSoldComps ? pricing.selectedPrice : null,
    hasSoldComps ? pricing.recommendedPrice : null
  );
  const estimatedProfit = firstFinite(
    hasSoldComps ? analysis.bestMarketplace?.netProfit : null,
    hasSoldComps ? pricing.bestMarketplace?.profit?.netProfit : null,
    hasSoldComps ? pricing.expectedProfit?.netProfit : null,
    hasSoldComps ? pricing.profitSummary?.netProfit : null
  );
  const acquisitionCost = firstPositiveFinite(
    pricing.expectedProfit?.costOfGoods,
    pricing.bestMarketplace?.profit?.costOfGoods,
    pricing.profitSummary?.costOfGoods,
    analysis.acquisitionCost,
    analysis.costOfGoods
  );
  const explicitRoi = firstPositiveFinite(
    pricing.bestMarketplace?.profit?.roiPct,
    pricing.expectedProfit?.roiPct,
    pricing.profitSummary?.roiPct,
    analysis.sourcingAnalytics?.roiPercentage,
    analysis.roiPercentage
  );
  const roiPercentage =
    estimatedProfit != null && acquisitionCost > 0
      ? (estimatedProfit / acquisitionCost) * 100
      : hasSoldComps
        ? explicitRoi || undefined
        : undefined;
  const demandScore = clamp(
    firstPositive(
      market.sellThroughRate > 0 && market.sellThroughRate <= 1
        ? market.sellThroughRate * 100
        : market.sellThroughRate,
      analysis.sellThroughRatio != null ? Number(analysis.sellThroughRatio) * 100 : 0,
      hasSoldComps ? demandFromLevel(analysis.demand) : 0
    ),
    0,
    100,
    0
  );
  const sellThroughPercent = clamp(
    firstPositive(
      market.sellThroughRate > 0 && market.sellThroughRate <= 1
        ? market.sellThroughRate * 100
        : market.sellThroughRate,
      analysis.sellThroughRatio != null ? Number(analysis.sellThroughRatio) * 100 : 0
    ),
    0,
    100,
    0
  );
  const productConfidence = clamp(
    firstPositive(Number(analysis.confidence) * 100, Number(productLookup?.confidence) * 100),
    0,
    100
  );
  let confidenceScore = Math.round(
    productConfidence * 0.45 +
      clamp(Number(pricing.marketSignals?.profitConfidenceScore), 0, 100) * 0.2 +
      clamp(market.confidence * 100, 0, 100) * 0.25 +
      (barcodeDetected ? 10 : 0)
  );

  if (!market.hasMarketComps) confidenceScore = Math.min(confidenceScore, barcodeDetected ? 45 : 35);
  if (market.titleMatchMetrics.semanticRejectionRate >= 0.5) {
    confidenceScore = Math.min(confidenceScore, 55);
  }
  if (market.titleMatchMetrics.titleMatchConfidence > 0 && market.titleMatchMetrics.titleMatchConfidence < 0.6) {
    confidenceScore = Math.min(confidenceScore, 50);
  }
  if (!analysis.itemTitle && !productLookup?.title) confidenceScore = Math.min(confidenceScore, 45);
  confidenceScore = clamp(confidenceScore, 0, 100);

  let recommendation = "HOLD";
  if (!hasSoldComps || estimatedProfit == null) {
    recommendation = "HOLD";
  } else if (estimatedProfit <= 0 || sellThroughPercent < 30) {
    recommendation = "SKIP";
  } else if (estimatedProfit > 0 && sellThroughPercent > 60 && confidenceScore > 70) {
    recommendation = "BUY";
  }

  const marketUnavailable = !market.hasMarketComps;
  const explanationParts = [];
  if (recommendation === "BUY") {
    explanationParts.push(
      roiPercentage == null
        ? `Strong sell-through and healthy margin; profit is estimated near $${estimatedProfit.toFixed(2)}.`
        : `Strong sell-through and healthy margin: profit is estimated near $${estimatedProfit.toFixed(2)} with ${Math.round(roiPercentage)}% ROI.`
    );
  } else if (recommendation === "SKIP") {
    explanationParts.push("Weak resale spread after fees or sell-through below the sourcing threshold.");
  } else {
    explanationParts.push("Low comp volume or mixed signals; proceed cautiously.");
  }
  if (market.soldCount > 0) explanationParts.push(`Based on ${market.soldCount} recent sold comps.`);
  if (barcodeDetected && market.hasMarketComps) explanationParts.push("Barcode matched with marketplace evidence.");
  else if (barcodeDetected) explanationParts.push("Barcode detected, but comp depth is limited.");
  if (marketUnavailable) explanationParts.push("No sold marketplace comps available, so confidence is capped.");
  if (market.titleMatchMetrics.rejectedCompCount > 0) {
    explanationParts.push(`${market.titleMatchMetrics.rejectedCompCount} weak title matches were excluded.`);
  }
  if (productConfidence < 45) explanationParts.push("Low OCR/image clarity; estimated identification only.");
  if (market.soldCount >= 8) explanationParts.push("High confidence based on stronger sold history.");
  if (confidenceScore < 50) explanationParts.push("Manual verification recommended.");

  return {
    estimatedResalePrice: estimatedResalePrice > 0 ? Number(estimatedResalePrice.toFixed(2)) : undefined,
    estimatedProfit: estimatedProfit == null ? undefined : Number(estimatedProfit.toFixed(2)),
    roiPercentage: roiPercentage == null ? undefined : Number(roiPercentage.toFixed(1)),
    demandScore: Math.round(demandScore),
    confidenceScore: Math.round(confidenceScore),
    recommendation,
    explanation: explanationParts.join(" "),
    confidenceExplanation: explanationParts.join(" "),
    marketDataUnavailable: marketUnavailable,
    titleMatchMetrics: market.titleMatchMetrics,
    sourceBadges: buildSourceBadges({ upc: analysis.upc || productLookup?.upc, visionUsed, marketData })
  };
}
