import type { CrossListPlatform } from "../crossListEngine/types";
import { buildInventoryOSEvents } from "./inventoryEvents";
import { scoreInventoryHealth } from "./inventoryHealth";
import { buildLifecycleTimeline } from "./lifecycleTracker";
import { buildProfitLedger } from "./profitLedger";
import { evaluateReorder } from "./reorderEngine";
import { allocateStockAcrossPlatforms } from "./stockAllocator";
import { evaluateStaleInventory } from "./staleInventoryEngine";
import type { InventoryLifecycleState, InventoryOSItem, LinkedInventoryListing } from "./inventoryTypes";

export function buildInventoryOSSnapshot({
  inventorySyncSnapshot,
  marketSimulation
}: {
  inventorySyncSnapshot: any;
  marketSimulation?: any;
}) {
  const universal = inventorySyncSnapshot?.universalListing || {};
  const linkedListings: LinkedInventoryListing[] = (universal.platformListingStates || []).map((state: any) => ({
    platform: state.platform as CrossListPlatform,
    platformListingId: state.platformListingId || null,
    quantityMapped: Number(state.quantityMapped) || 0,
    publishStatus: String(state.publishStatus || "DRAFT"),
    syncState: String(state.syncState || "NEEDS_REVIEW")
  }));
  const estimatedVelocity = marketSimulation?.estimatedSellThrough ?? null;
  const estimatedProfit =
    universal.pricing?.estimatedResalePrice != null && universal.pricing?.costBasis != null
      ? Number((universal.pricing.estimatedResalePrice - universal.pricing.costBasis).toFixed(2))
      : null;
  const baseItem: InventoryOSItem = {
    internalSku: universal.internalSku || "",
    upc: universal.upc || "",
    title: universal.title || "Inventory item",
    category: universal.category || "Uncategorized",
    acquisitionCost: universal.pricing?.costBasis ?? null,
    estimatedMarketValue: universal.pricing?.estimatedResalePrice ?? null,
    currentStock: Number(universal.quantity) || 0,
    reservedStock: universal.syncMetadata?.stockLocked ? Number(universal.quantity) || 0 : 0,
    soldStock: inventorySyncSnapshot?.syncPreview?.startingQuantity && inventorySyncSnapshot?.syncPreview?.remainingQuantity === 0 ? 1 : 0,
    deadStockRisk: 0,
    inventoryHealthScore: 0,
    estimatedVelocity,
    estimatedProfit,
    linkedListings,
    lifecycleState: (linkedListings.length ? "LISTED" : "ANALYZED") as InventoryLifecycleState,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  };
  const stale = evaluateStaleInventory(baseItem, marketSimulation?.saturationSeverity || 0);
  const health = scoreInventoryHealth({
    item: baseItem,
    saturationSeverity: marketSimulation?.saturationSeverity || 0,
    staleRisk: stale.deadStockRisk
  });
  const item: InventoryOSItem = {
    ...baseItem,
    deadStockRisk: stale.deadStockRisk,
    inventoryHealthScore: health.healthScore,
    lifecycleState: stale.deadStockRisk >= 75 ? "STALE" : baseItem.lifecycleState
  };
  const stockAllocation = allocateStockAcrossPlatforms({
    currentStock: item.currentStock,
    reservedStock: item.reservedStock,
    linkedListings
  });
  const profitLedger = buildProfitLedger(
    (inventorySyncSnapshot?.platformProfitEstimates || []).map((entry: any) => ({
      platform: entry.platform,
      estimatedProfit: entry.estimatedNetProfit,
      realizedProfit: null,
      fees: entry.estimatedFees,
      shippingCosts: null,
      roi: entry.estimatedRoi
    }))
  );

  return {
    item,
    health,
    stale,
    stockAllocation,
    profitLedger,
    reorder: evaluateReorder(item),
    lifecycleTimeline: buildLifecycleTimeline(item),
    events: buildInventoryOSEvents(item)
  };
}
