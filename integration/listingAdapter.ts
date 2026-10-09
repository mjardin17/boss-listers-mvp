import type {
  InventoryItem
} from "../app/InventoryWorkflow";

import type {
  ListingVideoSource
} from "../lib/video-studio/types";

export function inventoryItemToVideoSource(
  item: InventoryItem
): ListingVideoSource {
  const listing: any =
    item.listing;

  const price =
    Number(
      item.soldPrice ??
        listing.averageSalePrice ??
        listing.estimatedResalePrice
    );

  return {
    id:
      String(
        listing.id ||
          item.id
      ),

    inventoryId:
      item.id,

    title:
      item.title ||
      listing
        .confirmedProductIdentity
        ?.title ||
      listing.itemTitle ||
      "Untitled item",

    description:
      listing
        .recommendationExplanation ||
      listing.description ||
      "",

    price:
      Number.isFinite(
        price
      ) &&
      price > 0
        ? price
        : null,

    photos:
      (
        item.photos ||
        listing.photos ||
        listing.images ||
        []
      ).filter(Boolean),

    marketplace:
      listing.marketplace ||
      "ebay",

    listingUrl:
      listing.listingUrl ||
      listing.ebayUrl ||
      listing.url ||
      "",

    brand:
      listing.brand ||
      "",

    category:
      listing
        .confirmedProductIdentity
        ?.category ||
      listing.category ||
      ""
  };
}
