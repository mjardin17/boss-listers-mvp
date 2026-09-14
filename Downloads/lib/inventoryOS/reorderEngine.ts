import type { InventoryOSItem } from "./inventoryTypes";

export function evaluateReorder(item: InventoryOSItem) {
  const profitable = item.estimatedProfit != null && item.estimatedProfit > 8;
  const fastEnough = item.estimatedVelocity != null && item.estimatedVelocity >= 0.3;
  const healthy = item.inventoryHealthScore >= 70;
  return {
    shouldReorder: item.currentStock === 0 && profitable && fastEnough && healthy,
    reason:
      item.currentStock > 0
        ? "Stock remains available."
        : profitable && fastEnough && healthy
          ? "Sold-through item has enough profit and velocity to consider replenishment."
          : "Do not reorder until profit, velocity, and health improve."
  };
}
