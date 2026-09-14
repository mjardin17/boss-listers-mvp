import type { InventoryOSItem } from "./inventoryTypes";

function clamp(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function scoreInventoryHealth({
  item,
  saturationSeverity = 0,
  staleRisk = 0
}: {
  item: InventoryOSItem;
  saturationSeverity?: number;
  staleRisk?: number;
}) {
  const liquidityScore = clamp((item.estimatedVelocity ?? 0) * 100);
  const turnoverScore = item.currentStock === 0 ? 100 : clamp(100 - item.currentStock * 8);
  const riskScore = clamp(100 - staleRisk);
  const saturationExposureScore = clamp(100 - saturationSeverity);
  const healthScore = clamp((liquidityScore + turnoverScore + riskScore + saturationExposureScore) / 4);
  return {
    healthScore,
    liquidityScore,
    turnoverScore,
    riskScore,
    saturationExposureScore
  };
}
