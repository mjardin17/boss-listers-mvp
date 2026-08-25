export function weightConfidence({
  baseConfidence = 0,
  soldCount = 0,
  riskPenalty = 0,
  velocityBonus = 0
}: {
  baseConfidence?: number;
  soldCount?: number;
  riskPenalty?: number;
  velocityBonus?: number;
}) {
  const evidenceBonus = Math.min(18, Math.max(0, soldCount) * 3);
  return Math.max(0, Math.min(99, Math.round(Number(baseConfidence || 0) + evidenceBonus + velocityBonus - riskPenalty)));
}
