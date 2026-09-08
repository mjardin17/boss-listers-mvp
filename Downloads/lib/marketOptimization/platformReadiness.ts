import { optimizeListingForPlatform } from "./listingOptimizer";

export function buildPlatformReadiness({ listing = {} }: any = {}) {
  const drafts = listing.listingOrchestration?.adaptedListings || listing.crossListDrafts || [];
  return drafts.map((draft: any) => optimizeListingForPlatform({ draft, listing }));
}
