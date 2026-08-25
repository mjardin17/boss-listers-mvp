import { runResellerEngine } from "../runResellerEngine";
import { resellerFieldFixtures } from "./cases";

export function validateResellerFieldFixtures() {
  return resellerFieldFixtures.map((fixture) => {
    const result = runResellerEngine(fixture.facts);
    const warningText = result.resellerWarnings.join(" ");
    const passed =
      result.adjustedRecommendation === fixture.expected.recommendation &&
      result.adjustedConfidenceScore >= fixture.expected.confidenceMin &&
      result.adjustedConfidenceScore <= fixture.expected.confidenceMax &&
      result.liquidityTier === fixture.expected.liquidityTier &&
      result.marketSaturation === fixture.expected.marketSaturation &&
      (fixture.expected.painMin == null || result.resellerPainScore >= fixture.expected.painMin) &&
      (!fixture.expected.warningIncludes || warningText.includes(fixture.expected.warningIncludes));

    return {
      id: fixture.id,
      label: fixture.label,
      passed,
      expected: fixture.expected,
      actual: {
        recommendation: result.adjustedRecommendation,
        confidenceScore: result.adjustedConfidenceScore,
        liquidityTier: result.liquidityTier,
        marketSaturation: result.marketSaturation,
        warnings: result.resellerWarnings,
        resellerPainScore: result.resellerPainScore,
        storagePenalty: result.storagePenalty,
        staleInventoryRisk: result.staleInventoryRisk,
        marketBehaviorSimulation: result.marketBehaviorSimulation,
        collapseReasons: result.confidenceCollapseReason,
        marketBehaviorSummary: result.marketBehaviorSummary
      }
    };
  });
}
