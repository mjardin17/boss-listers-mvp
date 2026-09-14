import { calculateVelocity } from "./velocityEngine";
import { analyzeSaturation } from "./saturationAnalyzer";

export function analyzeDemand({
  soldCount = 0,
  activeCount = 0,
  confidenceWeight = 0
}: {
  soldCount?: number;
  activeCount?: number;
  confidenceWeight?: number;
}) {
  const velocity = calculateVelocity({ soldCount, activeCount });
  const saturation = analyzeSaturation({ soldCount, activeCount });
  const saturationPenalty = saturation.oversaturated ? Math.min(35, saturation.saturationRatio * 4) : 0;
  const demandScore = Math.max(
    0,
    Math.min(100, Math.round(velocity.liquidityScore * 0.55 + confidenceWeight * 0.45 - saturationPenalty))
  );
  return {
    demandScore,
    estimatedVelocity: velocity.velocityTier,
    estimatedMonthlySales: velocity.estimatedMonthlySales,
    competitionDensity: saturation.competitionDensity,
    liquidityScore: velocity.liquidityScore
  };
}
