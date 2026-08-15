export function runOptimizationAgent({ analysis = {} }: any = {}) {
  const drafts = (analysis.listingOrchestration as any)?.adaptedListings || analysis.crossListDrafts || [];
  const scores = drafts.map((draft: any) => Number(draft.optimization?.listingQualityScore || 0)).filter(Boolean);
  const averageScore = scores.length ? Math.round(scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length) : 0;
  const warnings = drafts.flatMap((draft: any) => draft.metadata?.warnings || draft.validation?.warnings || []).slice(0, 6);
  return {
    agent: "optimization",
    score: averageScore,
    titleStrength: averageScore,
    imageCompleteness: Number(analysis.imageRoleTelemetry?.roles?.length || 0) >= 2 ? 80 : 35,
    seoQuality: averageScore,
    warnings,
    reasons: [scores.length ? `${scores.length} platform drafts scored` : "No platform drafts scored", warnings.length ? "Listing warnings require review" : "No major draft warnings"],
    events: averageScore >= 75 ? [{ type: "listing_optimized", severity: "info", message: "Listing drafts are broadly optimized." }] : []
  };
}
