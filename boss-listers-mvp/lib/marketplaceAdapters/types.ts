import type { InventoryRecord } from "../../app/saas/schemas";

export type MarketplaceAdapterCode = "NOT_IMPLEMENTED" | "API_UNAVAILABLE" | "VALIDATION_FAILED";

export type MarketplaceAdapterResult =
  | {
      ok: true;
      marketplaceListingId: string;
    }
  | {
      ok: false;
      code: MarketplaceAdapterCode;
      message: string;
    };

export interface MarketplaceAdapter {
  createDraft(item: InventoryRecord): Promise<MarketplaceAdapterResult>;
  publishListing(item: InventoryRecord): Promise<MarketplaceAdapterResult>;
  endListing(item: InventoryRecord): Promise<MarketplaceAdapterResult>;
  updateQuantity(item: InventoryRecord, quantity: number): Promise<MarketplaceAdapterResult>;
}

export function notImplementedResult(operation: string): MarketplaceAdapterResult {
  return {
    ok: false,
    code: "NOT_IMPLEMENTED",
    message: `${operation} requires live marketplace API credentials and request mapping.`
  };
}
