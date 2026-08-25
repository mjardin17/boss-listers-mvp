import type { CrossListPlatform } from "../crossListEngine/types";
import type { UniversalListing } from "./inventoryStore";

export function reconcileSale({
  listing,
  soldPlatform,
  soldQuantity
}: {
  listing: UniversalListing;
  soldPlatform: CrossListPlatform;
  soldQuantity: number;
}): UniversalListing {
  const quantitySold = Math.max(0, Math.floor(Number(soldQuantity) || 0));
  const remaining = Math.max(0, listing.quantity - quantitySold);
  return {
    ...listing,
    quantity: remaining,
    platformListingStates: listing.platformListingStates.map((state) => ({
      ...state,
      quantityMapped: remaining,
      publishStatus:
        state.platform === soldPlatform
          ? "SOLD"
          : remaining === 0
            ? "DELISTED"
            : state.publishStatus,
      syncState: remaining === 0 ? "LOCKED" : "PENDING",
      stale: remaining === 0 ? false : state.stale
    })),
    syncMetadata: {
      ...listing.syncMetadata,
      stockLocked: remaining === 0,
      lastSyncAt: new Date(0).toISOString()
    }
  };
}
