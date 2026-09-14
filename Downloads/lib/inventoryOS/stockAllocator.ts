import type { LinkedInventoryListing } from "./inventoryTypes";

export function allocateStockAcrossPlatforms({
  currentStock,
  reservedStock,
  linkedListings
}: {
  currentStock: number;
  reservedStock: number;
  linkedListings: LinkedInventoryListing[];
}) {
  const available = Math.max(0, currentStock - reservedStock);
  return linkedListings.map((listing) => ({
    platform: listing.platform,
    allocatedQuantity: Math.min(available, listing.quantityMapped),
    reservedQuantity: reservedStock > 0 ? Math.min(reservedStock, listing.quantityMapped) : 0,
    syncState: available === 0 ? "LOCKED" : listing.syncState
  }));
}
