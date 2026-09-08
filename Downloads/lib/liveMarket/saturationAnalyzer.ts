export function analyzeSaturation({
  activeCount = 0,
  soldCount = 0
}: {
  activeCount?: number;
  soldCount?: number;
}) {
  const active = Math.max(0, Number(activeCount) || 0);
  const sold = Math.max(0, Number(soldCount) || 0);
  const saturationRatio = sold > 0 ? Number((active / sold).toFixed(2)) : active > 0 ? 99 : 0;
  const severity =
    saturationRatio >= 8 ? "EXTREME" : saturationRatio >= 4 ? "HIGH" : saturationRatio >= 2 ? "MODERATE" : "LOW";
  return {
    activeListingCount: active,
    soldListingCount: sold,
    saturationRatio,
    competitionDensity: active,
    oversaturated: severity === "HIGH" || severity === "EXTREME",
    saturationSeverity: severity
  };
}
