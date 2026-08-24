export function optimizePlatformPricing({ draft = {}, listing = {} }: any = {}) {
  const average = Number(listing.averageSalePrice || listing.estimatedResalePrice || 0);
  const risk = String(listing.sourcingAnalytics?.riskLevel?.label || "");
  const price = average > 0 ? Number((average * (risk === "High Risk" ? 0.94 : 1)).toFixed(2)) : null;
  return {
    suggestedPrice: price,
    pricingWarnings: price == null ? ["No sold-price anchor available for pricing optimization."] : []
  };
}
