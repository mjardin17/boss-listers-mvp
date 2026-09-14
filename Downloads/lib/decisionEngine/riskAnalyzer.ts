export type InventoryRisk = "LOW" | "MEDIUM" | "HIGH";

export function analyzeDecisionRisk({
  confidenceScore = 0,
  soldCount = 0,
  saturationRatio = 0,
  missingDataPoints = [],
  staleInventoryRisk = ""
}: {
  confidenceScore?: number;
  soldCount?: number;
  saturationRatio?: number;
  missingDataPoints?: string[];
  staleInventoryRisk?: string;
}): { inventoryRisk: InventoryRisk; riskReasons: string[] } {
  const reasons = [
    soldCount <= 0 ? "Missing sold comps" : "",
    confidenceScore < 45 ? "Low confidence score" : "",
    saturationRatio >= 5 ? "Active listing saturation" : "",
    missingDataPoints.length ? "Missing market evidence" : "",
    /high|extreme/i.test(staleInventoryRisk) ? "Stale inventory risk" : ""
  ].filter(Boolean);
  const inventoryRisk: InventoryRisk = reasons.length >= 3 || soldCount <= 0 ? "HIGH" : reasons.length ? "MEDIUM" : "LOW";
  return { inventoryRisk, riskReasons: reasons };
}
