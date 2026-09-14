import type { PlatformListingState, UniversalListing } from "./inventoryStore";

export interface ListingRegistryEntry extends PlatformListingState {
  internalSku: string;
  createdAt: string;
  updatedAt: string;
}

export function buildListingRegistry(listing: UniversalListing): ListingRegistryEntry[] {
  const createdAt = new Date(0).toISOString();
  return listing.platformListingStates.map((state) => ({
    ...state,
    internalSku: listing.internalSku,
    createdAt,
    updatedAt: listing.syncMetadata.lastSyncAt || createdAt
  }));
}
