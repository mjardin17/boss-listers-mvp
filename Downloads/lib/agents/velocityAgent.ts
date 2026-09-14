export function runVelocityAgent({ analysis = {}, trustedCompSummary = {} }: any = {}) {
  const velocity = trustedCompSummary.velocityTier || trustedCompSummary.velocityScore || analysis.engineTelemetry?.velocityScore || "DEAD";
  const monthly = Number((analysis.resellerEngineTelemetry as any)?.marketBehaviorSimulation?.estimatedSellThrough || 0);
  const score = velocity === "HIGH" || velocity === "FAST" ? 85 : velocity === "MODERATE" || velocity === "HEALTHY" ? 60 : velocity === "LOW" || velocity === "SLOW" ? 30 : 0;
  return {
    agent: "velocity",
    score,
    velocity,
    turnoverProbability: score,
    replenishable: /grocery|beauty|consumable|household/i.test(`${analysis.category || ""}`) && score >= 60,
    reasons: [`Velocity tier: ${velocity}`, monthly > 0 ? `Estimated sell-through signal: ${monthly}` : "No monthly sell-through signal"],
    events: score <= 25 ? [{ type: "velocity_drop", severity: "medium", message: "Low velocity detected." }] : []
  };
}
