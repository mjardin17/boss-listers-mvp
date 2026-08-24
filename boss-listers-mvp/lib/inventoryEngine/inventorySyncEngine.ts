import type { CrossListDraft } from "../crossListEngine/types";
import { buildInventoryEventFlow } from "../eventEngine/eventDispatcher";
import { estimatePlatformNetProfit } from "../platformIntelligence/feeProfiles";
import { scoreListingHealth } from "../platformIntelligence/listingHealth";
import { PLATFORM_SHIPPING_PROFILES } from "../platformIntelligence/shippingProfiles";
import { buildPublishQueue } from "../publishQueue/publishQueue";
import { createUniversalListing } from "./inventoryStore";
import { buildListingRegistry } from "./listingRegistry";
import { reconcileSale } from "./stockReconciliation";

export function buildInventorySyncSnapshot({
  title,
  brand,
  upc,
  condition,
  category,
  quantity = 1,
  images = [],
  estimatedResalePrice = null,
  costBasis = null,
  drafts = []
}: {
  title: string;
  brand?: string;
  upc?: string;
  condition?: string;
  category?: string;
  quantity?: number;
  images?: string[];
  estimatedResalePrice?: number | null;
  costBasis?: number | null;
  drafts?: CrossListDraft[];
}) {
  const universalListing = createUniversalListing({
    title,
    brand,
    upc,
    condition,
    quantity,
    category,
    images,
    estimatedResalePrice,
    costBasis,
    drafts
  });
  const listingRegistry = buildListingRegistry(universalListing);
  const platformProfitEstimates = drafts.map((draft) =>
    estimatePlatformNetProfit({
      platform: draft.platform,
      salePrice: estimatedResalePrice,
      costBasis,
      shippingCost: PLATFORM_SHIPPING_PROFILES[draft.platform].defaultShippingCost
    })
  );
  const listingHealth = drafts.map(scoreListingHealth);
  const publishQueue = buildPublishQueue({ internalSku: universalListing.internalSku, drafts });
  const simulatedSoldOutState =
    universalListing.quantity === 1 && drafts.length
      ? reconcileSale({ listing: universalListing, soldPlatform: drafts[0].platform, soldQuantity: 1 })
      : null;

  return {
    universalListing,
    listingRegistry,
    platformProfitEstimates,
    listingHealth,
    publishQueue,
    simulatedPublishQueue: listingRegistry.map((entry) => ({
      platform: entry.platform,
      status: entry.publishStatus === "QUEUED" ? "QUEUED_FOR_ADAPTER" : "VALIDATION_REQUIRED",
      retryCount: 0,
      nextAction: entry.publishStatus === "QUEUED" ? "Attach real marketplace adapter." : "Fix draft validation warnings."
    })),
    syncPreview:
      simulatedSoldOutState == null
        ? null
        : {
            salePlatform: drafts[0].platform,
            startingQuantity: universalListing.quantity,
            remainingQuantity: simulatedSoldOutState.quantity,
            affectedPlatforms: simulatedSoldOutState.platformListingStates.map((state) => ({
              platform: state.platform,
              quantityMapped: state.quantityMapped,
              publishStatus: state.publishStatus,
              syncState: state.syncState
            })),
            eventFlow: buildInventoryEventFlow({
              sku: universalListing.internalSku,
              salePlatform: drafts[0].platform,
              remainingQuantity: simulatedSoldOutState.quantity,
              affectedPlatforms: simulatedSoldOutState.platformListingStates.map((state) => ({
                platform: state.platform,
                publishStatus: state.publishStatus
              }))
            }).events
          }
  };
}
