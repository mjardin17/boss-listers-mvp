import { analyzeDemand } from "./demandAnalyzer";
import { analyzeSaturation } from "./saturationAnalyzer";

export function evaluateMarketHealth({
  soldCount = 0,
  activeCount = 0,
  category = "",
  confidenceWeight = 0
}: {
  soldCount?: number;
  activeCount?: number;
  category?: string;
  confidenceWeight?: number;
}) {
  const demand = analyzeDemand({ soldCount, activeCount, confidenceWeight });
  const saturation = analyzeSaturation({ soldCount, activeCount });
  const lowerCategory = String(category || "").toLowerCase();
  const collectible = /collectible|toy|transformers|pokemon|hot wheels|vintage/.test(lowerCategory);
  return {
    oversaturated: saturation.oversaturated,
    longTailCollectible: collectible && soldCount > 0 && activeCount <= Math.max(6, soldCount * 2),
    fastMover: demand.estimatedVelocity === "FAST",
    seasonalItem: /holiday|christmas|halloween|seasonal/.test(lowerCategory),
    replenishable: /grocery|beauty|consumable|household/.test(lowerCategory),
    deadInventory: soldCount <= 0 || demand.demandScore < 15,
    riskLevel:
      soldCount <= 0 || saturation.saturationSeverity === "EXTREME"
        ? "HIGH"
        : demand.demandScore >= 65
          ? "LOW"
          : "MEDIUM",
    demand,
    saturation
  };
}
