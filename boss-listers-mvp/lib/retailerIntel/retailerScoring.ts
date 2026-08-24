import { detectRetailer } from "./retailerDetection";
import { detectClearancePattern } from "./clearancePatterns";
import { estimateRegionalPricingRisk } from "./regionalPricing";

export function scoreRetailerOpportunity(input: any = {}) {
  const profile = detectRetailer(input);
  const clearance = detectClearancePattern(input);
  if (!profile) {
    return {
      retailer: null,
      sourcingScore: 40,
      warnings: ["Retailer source unavailable."],
      clearance,
      regional: estimateRegionalPricingRisk(null)
    };
  }
  const score =
    45 +
    (profile.clearanceVolatility === "HIGH" ? 12 : profile.clearanceVolatility === "MEDIUM" ? 6 : 0) +
    (profile.collectibleFrequency === "HIGH" ? 10 : profile.collectibleFrequency === "MEDIUM" ? 5 : 0) +
    (profile.averageRoiProfile === "SPIKY" ? 8 : profile.averageRoiProfile === "MODERATE" ? 4 : -8) -
    (profile.bundleLikelihood === "HIGH" ? 10 : 0);
  return {
    retailer: profile,
    sourcingScore: Math.max(0, Math.min(100, score + (clearance.clearanceDetected ? 8 : 0))),
    warnings: [
      profile.bundleLikelihood === "HIGH" ? "Bundle pricing risk is elevated." : "",
      profile.regionalInconsistency === "HIGH" ? "Regional price inconsistency is high." : "",
      clearance.damagedPackageRisk ? "Package condition may reduce resale value." : ""
    ].filter(Boolean),
    clearance,
    regional: estimateRegionalPricingRisk(profile, input.location)
  };
}
