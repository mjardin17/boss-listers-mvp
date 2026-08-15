export type VelocityTier = "FAST" | "MODERATE" | "SLOW" | "DEAD";

export function calculateVelocity({
  soldCount = 0,
  activeCount = 0,
  trailingDays = 90
}: {
  soldCount?: number;
  activeCount?: number;
  trailingDays?: number;
}) {
  const days = Math.max(1, Number(trailingDays) || 90);
  const sold = Math.max(0, Number(soldCount) || 0);
  const active = Math.max(0, Number(activeCount) || 0);
  const estimatedMonthlySales = Number(((sold / days) * 30).toFixed(2));
  const sellThroughVelocity = active > 0 ? Number((sold / active).toFixed(3)) : sold > 0 ? 1 : null;
  const tier: VelocityTier =
    sold <= 0 ? "DEAD" : estimatedMonthlySales >= 8 || (sellThroughVelocity ?? 0) >= 0.75
      ? "FAST"
      : estimatedMonthlySales >= 3 || (sellThroughVelocity ?? 0) >= 0.35
        ? "MODERATE"
        : "SLOW";

  return {
    trailingDays: days,
    soldCount: sold,
    activeCount: active,
    estimatedMonthlySales,
    sellThroughVelocity,
    liquidityScore: sellThroughVelocity == null ? 0 : Math.max(0, Math.min(100, Math.round(sellThroughVelocity * 100))),
    velocityTier: tier
  };
}
