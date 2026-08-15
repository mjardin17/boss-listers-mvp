export function runPricingAgent({ analysis = {}, pricing = {} }: any = {}) {
  const averageSold = Number(analysis.averageSoldPrice ?? analysis.estimatedResalePrice ?? pricing.averageSoldPrice);
  const activePressure = String(analysis.activeListingPressure || pricing.marketSignals?.activeListingPressure || "unknown");
  const confidence = Number(analysis.confidenceScore || 0);
  const hasPrice = Number.isFinite(averageSold) && averageSold > 0;
  const strategy = !hasPrice
    ? "NO_PRICE_RECOMMENDATION"
    : activePressure === "high"
      ? "FAST_SALE_POSITIONING"
      : confidence >= 70
        ? "MAX_PROFIT_POSITIONING"
        : "MARKET_MIDPOINT_POSITIONING";
  const idealListPrice =
    strategy === "FAST_SALE_POSITIONING"
      ? Number((averageSold * 0.94).toFixed(2))
      : strategy === "MAX_PROFIT_POSITIONING"
        ? Number((averageSold * 1.06).toFixed(2))
        : hasPrice
          ? Number(averageSold.toFixed(2))
          : null;
  return {
    agent: "pricing",
    score: hasPrice ? Math.min(100, confidence + 10) : 0,
    strategy,
    idealListPrice,
    reasons: [
      hasPrice ? "Sold-price anchor available" : "No sold-price anchor available",
      activePressure === "high" ? "Active competition suggests faster-sale positioning" : "No high active pressure signal"
    ],
    events: hasPrice ? [{ type: "pricing_recommended", severity: "info", message: `Pricing strategy: ${strategy}.` }] : []
  };
}
