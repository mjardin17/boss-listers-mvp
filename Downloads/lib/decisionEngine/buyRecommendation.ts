export type DecisionState = "STRONG_BUY" | "BUY" | "MANUAL_REVIEW" | "RISKY" | "PASS";

export function recommendBuy({
  confidenceScore,
  estimatedNetProfit,
  estimatedROI,
  sellThroughSpeed,
  inventoryRisk,
  soldCount
}: {
  confidenceScore: number;
  estimatedNetProfit: number | null;
  estimatedROI: number | null;
  sellThroughSpeed: string;
  inventoryRisk: string;
  soldCount: number;
}): DecisionState {
  if (soldCount <= 0 || estimatedNetProfit == null || estimatedROI == null) return "MANUAL_REVIEW";
  if (estimatedNetProfit <= 0 || estimatedROI < 10) return "PASS";
  if (inventoryRisk === "HIGH") return "RISKY";
  if (confidenceScore >= 80 && estimatedNetProfit >= 15 && estimatedROI >= 45 && ["FAST", "MODERATE"].includes(sellThroughSpeed)) {
    return "STRONG_BUY";
  }
  if (confidenceScore >= 55 && estimatedNetProfit >= 8 && estimatedROI >= 25) return "BUY";
  return "MANUAL_REVIEW";
}
