import type { NormalizedListing } from "../../app/types";
import type { InventoryRecord, ScanRecord } from "../../app/saas/schemas";

export type ExecutionStatus =
  | "PENDING"
  | "APPROVED"
  | "PROCESSING"
  | "PUBLISHED"
  | "SYNCED"
  | "FAILED"
  | "RETRYING";

export type ExecutionQueueItem = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: ExecutionStatus;
  action: "CREATE_LISTING" | "RELIST" | "MARKDOWN" | "SYNC_INVENTORY" | "REVIEW_RISK" | "DELIST";
  title: string;
  listing: NormalizedListing;
  riskLevel: string;
  estimatedProfit: number | null;
  confidenceScore: number;
  platform: string;
  warnings: string[];
};

export function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function money(value: unknown) {
  const parsed = numberOrNull(value);
  return parsed == null ? "N/A" : `$${parsed.toFixed(2)}`;
}

export function listingTitle(listing: NormalizedListing) {
  return listing.confirmedProductIdentity?.title || listing.itemTitle || listing.upc || "Unidentified item";
}

export function recommendationOf(listing: NormalizedListing) {
  return String(listing.recommendation || listing.decisionCard?.action || "MANUAL_REVIEW").toUpperCase();
}

export function riskLevelOf(listing: NormalizedListing) {
  return (
    listing.sourcingAnalytics?.riskLevel?.label ||
    ((listing.resellerEngineTelemetry as any)?.returnRisk ? "High Risk" : "") ||
    (Number(listing.confidenceScore || 0) < 40 ? "High Risk" : "Medium Risk")
  );
}

export function velocityOf(listing: NormalizedListing) {
  return (
    listing.engineTelemetry?.velocityScore ||
    listing.trustedCompSummary?.velocityTier ||
    (listing.resellerEngineTelemetry as any)?.liquidityTier ||
    "DEAD"
  );
}

export function profitOf(listing: NormalizedListing) {
  return numberOrNull(listing.estimatedProfit ?? listing.profitPotential);
}

export function queueFromScan(scan: ScanRecord, action: ExecutionQueueItem["action"] = "CREATE_LISTING"): ExecutionQueueItem {
  const listing = scan.listing;
  const warnings = [
    ...(listing.resellerWarnings || []),
    ...((listing.aiAgentEvents as any[]) || []).filter((event) => event.severity === "high").map((event) => event.message)
  ].filter(Boolean).slice(0, 5);
  return {
    id: `exec-${scan.id}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "PENDING",
    action,
    title: listingTitle(listing),
    listing,
    riskLevel: riskLevelOf(listing),
    estimatedProfit: profitOf(listing),
    confidenceScore: Math.round(Number(listing.confidenceScore) || 0),
    platform: listing.recommendedMarketplace?.platform || listing.lookupSource || "Review",
    warnings
  };
}

export function queueFromInventory(item: InventoryRecord, action: ExecutionQueueItem["action"] = "RELIST"): ExecutionQueueItem {
  return {
    ...queueFromScan(
      {
        id: item.id,
        timestamp: item.updatedAt,
        listing: item.listing,
        source: "history",
        schemaVersion: item.schemaVersion,
        syncStatus: item.syncStatus
      },
      action
    ),
    id: `exec-inventory-${item.id}`
  };
}

export function staleInventory(items: InventoryRecord[]) {
  return items.filter((item) => {
    const ageDays = (Date.now() - new Date(item.updatedAt).getTime()) / 86400000;
    const velocity = velocityOf(item.listing);
    return item.status !== "Sold" && (ageDays >= 14 || velocity === "DEAD" || Number(item.listing.confidenceScore || 0) < 35);
  });
}
