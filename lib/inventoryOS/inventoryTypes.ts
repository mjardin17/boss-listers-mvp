import type { CrossListPlatform } from "../crossListEngine/types";

export type InventoryLifecycleState =
  | "SCANNED"
  | "ANALYZED"
  | "LISTED"
  | "SYNCED"
  | "PUBLISHED"
  | "RESERVED"
  | "SOLD"
  | "RELIST_REQUIRED"
  | "STALE"
  | "ARCHIVED";

export interface LinkedInventoryListing {
  platform: CrossListPlatform;
  platformListingId: string | null;
  quantityMapped: number;
  publishStatus: string;
  syncState: string;
}

export interface InventoryOSItem {
  internalSku: string;
  upc: string;
  title: string;
  category: string;
  acquisitionCost: number | null;
  estimatedMarketValue: number | null;
  currentStock: number;
  reservedStock: number;
  soldStock: number;
  deadStockRisk: number;
  inventoryHealthScore: number;
  estimatedVelocity: number | null;
  estimatedProfit: number | null;
  linkedListings: LinkedInventoryListing[];
  lifecycleState: InventoryLifecycleState;
  createdAt: string;
  updatedAt: string;
}
