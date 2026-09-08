import { runComplianceChecks } from "./complianceChecks";
import { scoreTitleQuality } from "./titleOptimizer";
import { optimizePlatformPricing } from "./pricingOptimizer";
import { scoreImageCompliance } from "./imageCompliance";

export function optimizeListingForPlatform({ draft, listing }: any = {}) {
  const compliance = runComplianceChecks(draft);
  const title = scoreTitleQuality(draft);
  const pricing = optimizePlatformPricing({ draft, listing });
  const image = scoreImageCompliance({ imageCount: listing?.thumbnailUrl ? 1 : 0, platform: draft?.platform });
  const listingQualityScore = Math.round(title.titleScore * 0.35 + image.imageScore * 0.25 + (compliance.valid ? 30 : 10) + (pricing.suggestedPrice ? 10 : 0));
  return {
    platform: draft?.platform || "unknown",
    readinessScore: Math.max(0, Math.min(100, listingQualityScore)),
    listingQualityScore,
    optimizationSuggestions: [...title.suggestions, ...pricing.pricingWarnings, ...image.warnings],
    complianceWarnings: compliance.warnings,
    suggestedPrice: pricing.suggestedPrice
  };
}
