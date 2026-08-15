import { runInventoryAgent } from "./inventoryAgent";
import { runListingAgent } from "./listingAgent";
import { runOptimizationAgent } from "./optimizationAgent";
import { runPricingAgent } from "./pricingAgent";
import { runRiskAgent } from "./riskAgent";
import { runSourcingAgent } from "./sourcingAgent";
import { runVelocityAgent } from "./velocityAgent";

export function runExecutionAgents(context: any = {}) {
  const agents = [
    runSourcingAgent(context),
    runPricingAgent(context),
    runRiskAgent(context),
    runVelocityAgent(context),
    runInventoryAgent(context),
    runOptimizationAgent(context),
    runListingAgent(context)
  ];
  const events = agents.flatMap((agent) => agent.events || []);
  const risk = agents.find((agent) => agent.agent === "risk") as any;
  const sourcing = agents.find((agent) => agent.agent === "sourcing") as any;
  const velocity = agents.find((agent) => agent.agent === "velocity") as any;
  const summary =
    risk?.level === "HIGH"
      ? "High risk detected; verify before sourcing."
      : sourcing?.recommendation === "OPPORTUNITY_DETECTED" || sourcing?.recommendation === "LONG_TAIL_OPPORTUNITY"
        ? "Opportunity detected from trusted telemetry."
        : velocity?.score >= 60
          ? "Velocity is workable, but sourcing still depends on sold evidence and profit."
          : "No autonomous buy signal; manual review remains safest.";
  return {
    executionFlow: ["SCAN", "ANALYZE", "SCORE", "VALIDATE", "OPTIMIZE", "STORE", "PUBLISH", "TRACK", "SYNC"],
    decisionHierarchy: ["sold comps", "identity confidence", "saturation", "shipping friction", "liquidity", "inventory health", "listing readiness"],
    agents,
    events,
    summary,
    telemetry: {
      opportunityCount: events.filter((event) => event.type === "opportunity_detected").length,
      riskCount: events.filter((event) => event.type === "risk_detected").length,
      listingReadyCount: Number((agents.find((agent) => agent.agent === "listing") as any)?.publishReady || 0),
      averageAgentScore: Math.round(agents.reduce((sum, agent) => sum + Number(agent.score || 0), 0) / agents.length)
    }
  };
}
