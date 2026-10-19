import {
  validateOrRepairNormalizedListing,
  type NormalizedListing
} from "../../lib/normalizedListingSchema";

export const SCHEMA_VERSION = 1;
export const SCAN_HISTORY_COLLECTION = "boss-listers.scanHistory.v1";
export const INVENTORY_COLLECTION = "boss-listers.inventory.v1";
export const USER_SESSION_COLLECTION = "boss-listers.userSession.v1";

export type SyncStatus = "local" | "pending" | "synced" | "error";
export type InventoryStatus = "Draft" | "Active" | "Sold" | "Delisted" | "Archived";
export type PlatformListingStatus =
  | "Draft"
  | "Pending"
  | "Failed"
  | "Not Created"
  | "Draft Ready"
  | "Active"
  | "Sold"
  | "Delist Required"
  | "Delisted"
  | "Error";
export type SoldStatus = "Available" | "Sold" | "Archived";

export type BossListersUserSession = {
  id: string;
  anonymousId: string;
  authProvider: "anonymous" | "future-auth";
  createdAt: string;
  lastSeenAt: string;
  syncStatus: SyncStatus;
};

export type ScanRecord = {
  id: string;
  timestamp: string;
  listing: NormalizedListing;
  userId?: string;
  deviceSessionId?: string;
  source: "camera" | "upload" | "history";
  schemaVersion: number;
  syncStatus: SyncStatus;
};

export type InventoryRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: InventoryStatus;
  sku: string;
  upc: string;
  title: string;
  quantity: number;
  condition: string;
  cost: number;
  photos: string[];
  listing: NormalizedListing;
  purchasePrice: number;
  soldPrice: number;
  ebayStatus: PlatformListingStatus;
  mercariStatus: PlatformListingStatus;
  poshmarkStatus: PlatformListingStatus;
  facebookStatus: PlatformListingStatus;
  soldStatus: SoldStatus;
  lastSyncTime: string | null;
  errors: string[];
  eventLogs: string[];
  userId?: string;
  deviceSessionId?: string;
  schemaVersion: number;
  syncStatus: SyncStatus;
};

export type AnalyticsSnapshot = {
  generatedAt: string;
  totalScans: number;
  totalEstimatedProfit: number;
  averageRoi: number;
  estimatedInventoryValue: number;
  runningInventoryProfit: number;
  soldProfit: number;
  soldRoi: number;
  highestProfitTitle: string;
  lowestConfidenceTitle: string;
};

export function sanitizeSyncStatus(value: unknown): SyncStatus {
  return value === "pending" || value === "synced" || value === "error" ? value : "local";
}

export function sanitizeScanSource(value: unknown): ScanRecord["source"] {
  return value === "camera" || value === "upload" || value === "history" ? value : "history";
}

export function sanitizeInventoryStatus(value: unknown): InventoryStatus {
  if (value === "Sold" || value === "Delisted" || value === "Archived") return value;
  if (value === "Active" || value === "Listed" || value === "Purchased") return "Active";
  if (value === "sold_out") return "Sold";
  if (value === "delisted") return "Delisted";
  if (value === "archived") return "Archived";
  if (value === "active") return "Active";
  return "Draft";
}

export function sanitizePlatformListingStatus(value: unknown): PlatformListingStatus {
  if (
    value === "Draft" ||
    value === "Pending" ||
    value === "Failed" ||
    value === "Not Created" ||
    value === "Draft Ready" ||
    value === "Active" ||
    value === "Sold" ||
    value === "Delist Required" ||
    value === "Delisted" ||
    value === "Error"
  ) {
    return value;
  }
  if (value === "Draft Created") return "Draft Ready";
  if (value === "draft") return "Draft";
  if (value === "pending") return "Pending";
  if (value === "failed") return "Failed";
  if (value === "Listed") return "Active";
  if (value === "not_created") return "Not Created";
  if (value === "draft_ready") return "Draft Ready";
  if (value === "active") return "Active";
  if (value === "sold") return "Sold";
  if (value === "delist_required") return "Delist Required";
  if (value === "delisted") return "Delisted";
  if (value === "error") return "Error";
  return "Draft";
}

export function sanitizeSoldStatus(value: unknown): SoldStatus {
  return value === "Sold" || value === "Archived" ? value : "Available";
}

export function sanitizeNormalizedListing(
  listing: Partial<NormalizedListing> | null | undefined
): NormalizedListing {
  return validateOrRepairNormalizedListing(listing || {}, "localStorage.listing");
}
