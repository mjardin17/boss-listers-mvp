import { clampConfidence } from "./validationGuards";

export function repairConfidenceScore(
  confidenceScore: unknown,
  {
    payloadQualityScore = 100,
    fallback = 0
  }: {
    payloadQualityScore?: number;
    fallback?: number;
  } = {}
) {
  const base = clampConfidence(confidenceScore, fallback);
  const quality = clampConfidence(payloadQualityScore, 100);
  const penalty = quality < 100 ? Math.ceil((100 - quality) * 0.35) : 0;
  return Math.max(0, Math.min(100, base - penalty));
}
