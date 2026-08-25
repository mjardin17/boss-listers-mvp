import type { InventoryLifecycleState, InventoryOSItem } from "./inventoryTypes";

export function buildLifecycleTimeline(item: InventoryOSItem) {
  const states: InventoryLifecycleState[] = [
    "SCANNED",
    "ANALYZED",
    "LISTED",
    "SYNCED",
    "PUBLISHED",
    "RESERVED",
    "SOLD",
    "RELIST_REQUIRED",
    "STALE",
    "ARCHIVED"
  ];
  const activeIndex = states.indexOf(item.lifecycleState);
  return states.map((state, index) => ({
    state,
    status: index < activeIndex ? "complete" : index === activeIndex ? "active" : "pending"
  }));
}
