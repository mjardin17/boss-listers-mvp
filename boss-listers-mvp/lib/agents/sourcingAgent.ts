export function runSourcingAgent({ analysis = {}, trustedCompSummary = {}, pricing = {} }: any = {}) {
  const soldCount = Number(trustedCompSummary.soldCount || trustedCompSummary.acceptedComps || 0);
  const saturationRatio = Number(trustedCompSummary.saturationRatio || 0);
  const profit = Number(analysis.estimatedProfit ?? analysis.netProfit);
  const confidence = Number(analysis.confidenceScore || trustedCompSummary.trustScore || 0);
  const longTail = /collectible|toy|transformers|pokemon|hot wheels|vintage/i.test(
    `${analysis.category || ""} ${analysis.itemTitle || ""}`
  );
  const opportunity =
    soldCount > 0 && Number.isFinite(profit) && profit > 0 && confidence >= 45 && saturationRatio < 5;
  return {
    agent: "sourcing",
    score: opportunity ? Math.min(100, Math.round(confidence + Math.min(profit, 30))) : Math.max(0, Math.min(45, confidence)),
    recommendation: opportunity ? (longTail ? "LONG_TAIL_OPPORTUNITY" : "OPPORTUNITY_DETECTED") : "NO_CLEAR_OPPORTUNITY",
    reasons: [
      soldCount > 0 ? `${soldCount} trusted sold comps available` : "No trusted sold comps available",
      Number.isFinite(profit) && profit > 0 ? `Positive net profit signal: $${profit.toFixed(2)}` : "Profit unavailable or not positive",
      saturationRatio >= 5 ? "Saturation pressure is elevated" : "Saturation is not blocking"
    ],
    events: opportunity
      ? [{ type: "opportunity_detected", severity: longTail ? "medium" : "high", message: longTail ? "Long-tail sourcing opportunity detected." : "Sourcing opportunity detected." }]
      : []
  };
}
