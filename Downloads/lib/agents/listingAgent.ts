export function runListingAgent({ analysis = {} }: any = {}) {
  const orchestration = (analysis.listingOrchestration as any) || {};
  const drafts = orchestration.adaptedListings || analysis.crossListDrafts || [];
  const publishReady = drafts.filter((draft: any) => draft.metadata?.publishReady).length;
  const missingRequired = drafts.flatMap((draft: any) => draft.validation?.errors || []).slice(0, 8);
  return {
    agent: "listing",
    score: drafts.length ? Math.round((publishReady / drafts.length) * 100) : 0,
    publishReady,
    totalDrafts: drafts.length,
    missingRequired,
    reasons: [`${publishReady}/${drafts.length} platform drafts queue-ready`, missingRequired.length ? "Required listing fields are missing" : "No blocking validation errors"],
    events: publishReady > 0 ? [{ type: "listing_optimized", severity: "info", message: `${publishReady} platform drafts are queue-ready.` }] : []
  };
}
