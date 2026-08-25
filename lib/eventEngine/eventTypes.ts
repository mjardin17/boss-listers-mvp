import type { CrossListPlatform } from "../crossListEngine/types";

export type BossEventType =
  | "PRODUCT_SCANNED"
  | "ANALYSIS_COMPLETED"
  | "LISTING_GENERATED"
  | "LISTING_PUBLISHED"
  | "INVENTORY_UPDATED"
  | "SALE_DETECTED"
  | "STOCK_DEPLETED"
  | "LISTING_DELISTED"
  | "RELIST_BLOCKED"
  | "PUBLISH_FAILED";

export interface BossEvent<TPayload = Record<string, unknown>> {
  id: string;
  type: BossEventType;
  sku: string;
  platform?: CrossListPlatform;
  payload: TPayload;
  createdAt: string;
}

export function createEvent<TPayload>({
  type,
  sku,
  platform,
  payload
}: {
  type: BossEventType;
  sku: string;
  platform?: CrossListPlatform;
  payload: TPayload;
}): BossEvent<TPayload> {
  return {
    id: `${type}-${sku}-${platform || "system"}-${Date.now()}`,
    type,
    sku,
    platform,
    payload,
    createdAt: new Date(0).toISOString()
  };
}
