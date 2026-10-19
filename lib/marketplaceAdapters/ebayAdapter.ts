import type { InventoryRecord } from "../../app/saas/schemas";
import type { MarketplaceAdapter, MarketplaceAdapterResult } from "./types";
import { notImplementedResult } from "./types";

export class EbayMarketplaceAdapter implements MarketplaceAdapter {
  async createDraft(_item: InventoryRecord): Promise<MarketplaceAdapterResult> {
    return notImplementedResult("eBay createDraft");
  }

  async publishListing(_item: InventoryRecord): Promise<MarketplaceAdapterResult> {
    return notImplementedResult("eBay publishListing");
  }

  async endListing(_item: InventoryRecord): Promise<MarketplaceAdapterResult> {
    return notImplementedResult("eBay endListing");
  }

  async updateQuantity(
    _item: InventoryRecord,
    _quantity: number
  ): Promise<MarketplaceAdapterResult> {
    return notImplementedResult("eBay updateQuantity");
  }
}

export const ebayMarketplaceAdapter = new EbayMarketplaceAdapter();
