import type { InventoryOSItem } from "./inventoryTypes";

export function evaluateStaleInventory(item: InventoryOSItem, saturationSeverity = 0) {
  const lowVelocity = item.estimatedVelocity != null && item.estimatedVelocity < 0.1;
  const poorRoi = item.estimatedProfit != null && item.acquisitionCost != null && item.estimatedProfit < item.acquisitionCost * 0.25;
  const saturated = saturationSeverity >= 70;
  const risk = Math.min(100, (lowVelocity ? 35 : 0) + (poorRoi ? 30 : 0) + (saturated ? 35 : 0));
  return {
    deadStockRisk: risk,
    staleWarnings: [
      lowVelocity ? "Slow inventory velocity." : "",
      poorRoi ? "Profit does not justify holding period." : "",
      saturated ? "Excessive market saturation exposure." : ""
    ].filter(Boolean),
    markdownRecommendation:
      risk >= 75 ? "Markdown or avoid replenishment." : risk >= 45 ? "Review price and relist strategy." : "Hold current strategy.",
    relistRecommendation: risk >= 60 ? "Refresh title, photos, and platform fit before relisting." : ""
  };
}
