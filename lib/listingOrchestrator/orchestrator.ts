import { buildCrossListDrafts } from "../crossListEngine/adaptListing";
import type { CrossListInput } from "../crossListEngine/types";
import { createEvent } from "../eventEngine/eventTypes";
import { buildPublishQueue } from "../publishQueue/publishQueue";
import { adaptListingDrafts } from "./adaptationPipeline";
import { buildInventoryLinkMap } from "./inventoryLinker";
import { optimizeAdaptedListing } from "./optimizationPipeline";
import { validateAdaptedListing } from "./validationPipeline";

export function orchestrateListings(input: CrossListInput) {
  const baseDrafts = buildCrossListDrafts(input);
  const adaptedDrafts = adaptListingDrafts(baseDrafts);
  const inventoryLink = buildInventoryLinkMap({
    title: input.title,
    brand: input.brand,
    upc: input.upc,
    drafts: adaptedDrafts
  });
  const listings = adaptedDrafts.map((draft) => {
    const validation = validateAdaptedListing(draft);
    const optimized = optimizeAdaptedListing({
      ...draft,
      metadata: {
        ...draft.metadata,
        publishReady: validation.valid && draft.metadata.publishReady,
        warnings: Array.from(new Set([...draft.metadata.warnings, ...validation.warnings, ...validation.errors]))
      }
    });
    return {
      ...optimized,
      validation,
      inventoryLink: inventoryLink.stockRelationshipTree.find((item) => item.platform === draft.platform)
    };
  });
  const queue = buildPublishQueue({
    internalSku: inventoryLink.internalSku,
    drafts: listings
  });
  const events = listings.map((listing) =>
    createEvent({
      type: "LISTING_GENERATED",
      sku: inventoryLink.internalSku,
      platform: listing.platform,
      payload: {
        platform: listing.platform,
        valid: listing.validation.valid,
        score: listing.optimization.listingQualityScore
      }
    })
  );

  return {
    internalSku: inventoryLink.internalSku,
    adaptedListings: listings,
    inventoryLink,
    publishQueue: queue,
    events,
    summary: {
      totalPlatforms: listings.length,
      queueReady: listings.filter((listing) => listing.metadata.publishReady).length,
      needsReview: listings.filter((listing) => !listing.metadata.publishReady).length,
      averageQualityScore:
        listings.length === 0
          ? 0
          : Math.round(
              listings.reduce((sum, listing) => sum + listing.optimization.listingQualityScore, 0) /
                listings.length
            )
    }
  };
}
