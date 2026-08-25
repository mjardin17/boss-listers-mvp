export function runRiskAgent({ analysis = {}, trustedCompSummary = {} }: any = {}) {
  const warnings = [
    ...(analysis.resellerWarnings || []),
    ...((analysis.resellerEngineTelemetry as any)?.confidenceDegradationReasons || [])
  ];
  const soldCount = Number(trustedCompSummary.soldCount || 0);
  const shippingPain = Number((analysis.resellerEngineTelemetry as any)?.marketBehaviorSimulation?.shippingPainScore || 0);
  const returnRisk = Boolean((analysis.resellerEngineTelemetry as any)?.returnRisk);
  const riskScore = Math.min(100, (soldCount <= 0 ? 35 : 0) + Math.min(35, shippingPain * 0.4) + (returnRisk ? 20 : 0) + Math.min(25, warnings.length * 5));
  return {
    agent: "risk",
    score: riskScore,
    level: riskScore >= 70 ? "HIGH" : riskScore >= 35 ? "MEDIUM" : "LOW",
    reasons: [
      soldCount <= 0 ? "No sold evidence increases sourcing risk" : "Sold evidence exists",
      shippingPain >= 60 ? "Shipping economics are painful" : "Shipping pain is not extreme",
      returnRisk ? "Return-risk category detected" : "No return-risk flag"
    ],
    events: riskScore >= 60 ? [{ type: "risk_detected", severity: "high", message: "High sourcing risk detected." }] : []
  };
}
