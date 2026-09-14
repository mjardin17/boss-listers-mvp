import type { InventoryLifecycleState, InventoryOSItem } from "./inventoryTypes";

const transitions: Record<InventoryLifecycleState, InventoryLifecycleState[]> = {
  SCANNED: ["ANALYZED", "ARCHIVED"],
  ANALYZED: ["LISTED", "STALE", "ARCHIVED"],
  LISTED: ["SYNCED", "PUBLISHED", "RELIST_REQUIRED", "STALE"],
  SYNCED: ["PUBLISHED", "RESERVED", "STALE"],
  PUBLISHED: ["RESERVED", "SOLD", "STALE", "RELIST_REQUIRED"],
  RESERVED: ["SOLD", "PUBLISHED"],
  SOLD: ["ARCHIVED"],
  RELIST_REQUIRED: ["LISTED", "ARCHIVED"],
  STALE: ["RELIST_REQUIRED", "ARCHIVED"],
  ARCHIVED: []
};

export function canTransitionInventory(from: InventoryLifecycleState, to: InventoryLifecycleState) {
  return transitions[from].includes(to);
}

export function transitionInventory(item: InventoryOSItem, to: InventoryLifecycleState): InventoryOSItem {
  if (!canTransitionInventory(item.lifecycleState, to)) return item;
  return { ...item, lifecycleState: to, updatedAt: new Date(0).toISOString() };
}
