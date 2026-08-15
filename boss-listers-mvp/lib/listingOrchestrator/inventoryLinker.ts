import type { CrossListDraft } from "../crossListEngine/types";
import { generateInternalSku } from "../inventoryEngine/skuGenerator";

export function buildInventoryLinkMap({
  title,
  brand,
  upc,
  drafts
}: {
  title: string;
  brand?: string;
  upc?: string;
  drafts: CrossListDraft[];
}) {
  const internalSku = generateInternalSku({ title, brand, upc });
  return {
    internalSku,
    stockRelationshipTree: drafts.map((draft) => ({
      platform: draft.platform,
      internalSku,
      platformListingId: null,
      quantitySource: "central_inventory",
      syncState: draft.metadata.publishReady ? "PENDING" : "NEEDS_REVIEW"
    }))
  };
}
