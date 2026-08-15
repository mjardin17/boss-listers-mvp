import type { CrossListDraft, CrossListPlatform } from "../crossListEngine/types";
import { generateInternalSku } from "./skuGenerator";

export type PlatformPublishStatus = "DRAFT" | "QUEUED" | "PUBLISHED" | "PAUSED" | "SOLD" | "DELISTED" | "ERROR";
export type PlatformSyncState = "IN_SYNC" | "PENDING" | "LOCKED" | "NEEDS_REVIEW" | "STALE";

export interface UniversalListing {
  internalSku: string;
  upc: string;
  title: string;
  brand: string;
  condition: string;
  quantity: number;
  category: string;
  dimensions: {
    length: number | null;
    width: number | null;
    height: number | null;
    unit: "in";
  };
  weight: {
    value: number | null;
    unit: "lb";
  };
  images: string[];
  pricing: {
    estimatedResalePrice: number | null;
    costBasis: number | null;
    floorPrice: number | null;
  };
  platformListingStates: PlatformListingState[];
  syncMetadata: {
    stockLocked: boolean;
    lastSyncAt: string | null;
    duplicateSaleProtection: boolean;
    relistProtection: boolean;
  };
}

export interface PlatformListingState {
  platform: CrossListPlatform;
  platformListingId: string | null;
  publishStatus: PlatformPublishStatus;
  syncState: PlatformSyncState;
  quantityMapped: number;
  queuedAt: string | null;
  publishedAt: string | null;
  stale: boolean;
}

export function createUniversalListing({
  title,
  brand,
  upc,
  condition,
  quantity = 1,
  category,
  images = [],
  estimatedResalePrice = null,
  costBasis = null,
  drafts = []
}: {
  title: string;
  brand?: string;
  upc?: string;
  condition?: string;
  quantity?: number;
  category?: string;
  images?: string[];
  estimatedResalePrice?: number | null;
  costBasis?: number | null;
  drafts?: CrossListDraft[];
}): UniversalListing {
  const normalizedQuantity = Math.max(0, Math.floor(Number(quantity) || 0));
  return {
    internalSku: generateInternalSku({ brand, title, upc }),
    upc: upc || "",
    title: title || "Resale item",
    brand: brand || "",
    condition: condition || "Unknown",
    quantity: normalizedQuantity,
    category: category || "Uncategorized",
    dimensions: { length: null, width: null, height: null, unit: "in" },
    weight: { value: null, unit: "lb" },
    images,
    pricing: {
      estimatedResalePrice,
      costBasis,
      floorPrice: costBasis == null ? null : Number((costBasis * 1.35).toFixed(2))
    },
    platformListingStates: drafts.map((draft) => ({
      platform: draft.platform,
      platformListingId: null,
      publishStatus: draft.metadata.publishReady ? "QUEUED" : "DRAFT",
      syncState: draft.metadata.publishReady ? "PENDING" : "NEEDS_REVIEW",
      quantityMapped: normalizedQuantity,
      queuedAt: draft.metadata.publishReady ? new Date(0).toISOString() : null,
      publishedAt: null,
      stale: false
    })),
    syncMetadata: {
      stockLocked: false,
      lastSyncAt: null,
      duplicateSaleProtection: true,
      relistProtection: true
    }
  };
}
