import { createEvent } from "../eventEngine/eventTypes";
import type { InventoryOSItem } from "./inventoryTypes";

export function buildInventoryOSEvents(item: InventoryOSItem) {
  return [
    createEvent({ type: "INVENTORY_UPDATED", sku: item.internalSku, payload: { stock: item.currentStock } }),
    item.currentStock === 0
      ? createEvent({ type: "STOCK_DEPLETED", sku: item.internalSku, payload: { soldStock: item.soldStock } })
      : null,
    item.lifecycleState === "STALE"
      ? createEvent({ type: "RELIST_BLOCKED", sku: item.internalSku, payload: { reason: "Inventory is stale." } })
      : null
  ].filter((event): event is NonNullable<typeof event> => Boolean(event));
}
