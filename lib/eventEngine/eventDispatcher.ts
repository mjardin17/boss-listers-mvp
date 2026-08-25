import { dispatchEvents } from "./eventBus";
import { createEventStore } from "./eventStore";
import { createEvent, type BossEvent } from "./eventTypes";

export function buildInventoryEventFlow({
  sku,
  salePlatform,
  remainingQuantity,
  affectedPlatforms
}: {
  sku: string;
  salePlatform: string;
  remainingQuantity: number;
  affectedPlatforms: Array<{ platform: string; publishStatus: string }>;
}) {
  const start = createEvent({
    type: "SALE_DETECTED",
    sku,
    platform: salePlatform as any,
    payload: { salePlatform, remainingQuantity }
  });
  const events = dispatchEvents([start], {
    SALE_DETECTED: (event: BossEvent) => [
      createEvent({
        type: "INVENTORY_UPDATED",
        sku,
        payload: { sourceEventId: event.id, remainingQuantity }
      })
    ],
    INVENTORY_UPDATED: () =>
      remainingQuantity === 0
        ? [
            createEvent({
              type: "STOCK_DEPLETED",
              sku,
              payload: { remainingQuantity }
            }),
            ...affectedPlatforms
              .filter((item) => item.platform !== salePlatform)
              .map((item) =>
                createEvent({
                  type: item.publishStatus === "DELISTED" ? "LISTING_DELISTED" : "RELIST_BLOCKED",
                  sku,
                  platform: item.platform as any,
                  payload: { reason: "Central stock depleted after sale." }
                })
              )
          ]
        : []
  });
  return createEventStore(events);
}
