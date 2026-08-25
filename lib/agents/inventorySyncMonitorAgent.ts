import { loadInventoryState, type InventoryPersistenceRecord } from "../storage/inventoryPersistence";
import { appendRecord } from "../storage/localDatabase";

export type InventorySyncMonitorOptions = {
  maxItems?: number;
  staleAfterMs?: number;
};

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? (value as Record<string, any>) : {};
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function newestFirst(records: InventoryPersistenceRecord[]) {
  return [...records].sort((a: any, b: any) => {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function inspectInventoryRecord(record: InventoryPersistenceRecord, staleAfterMs: number) {
  const syncSnapshot = asRecord(record.syncSnapshot);
  const inventoryState = asRecord(record.inventoryState);
  const inventoryOS = asRecord(record.inventoryOS);
  const universalListing = asRecord(syncSnapshot.universalListing || inventoryState);
  const publishQueue = asRecord(syncSnapshot.publishQueue);
  const queueSummary = asRecord(publishQueue.summary);
  const registry = asArray(syncSnapshot.listingRegistry);
  const eventHistory = asArray(record.eventHistory);
  const updatedAt = String((record as any).updatedAt || (record as any).createdAt || "");
  const ageMs = updatedAt ? Date.now() - new Date(updatedAt).getTime() : Number.POSITIVE_INFINITY;
  const quantity = numberValue(universalListing.quantity, 0);
  const platformStates = asArray(universalListing.platformListingStates);
  const unsyncedPlatforms = platformStates.filter((state) => state.syncState && state.syncState !== "synced");
  const failedQueueCount = numberValue(queueSummary.failed) + numberValue(queueSummary.deadLettered);
  const blockedReasons = [
    quantity <= 0 && registry.length ? "Inventory shows zero quantity while platform listings still exist." : "",
    unsyncedPlatforms.length ? `${unsyncedPlatforms.length} platform inventory states are not synced.` : "",
    failedQueueCount ? `${failedQueueCount} publish/sync jobs are failed or dead-lettered.` : "",
    ageMs > staleAfterMs ? "Inventory sync snapshot is stale." : "",
    !record.internalSku ? "Missing internal SKU link." : ""
  ].filter(Boolean);
  const status = blockedReasons.length
    ? failedQueueCount || quantity <= 0
      ? "ACTION_REQUIRED"
      : "WATCH"
    : "HEALTHY";
  const score = Math.max(
    0,
    Math.min(
      100,
      100 -
        blockedReasons.length * 18 -
        failedQueueCount * 10 -
        unsyncedPlatforms.length * 8 -
        (ageMs > staleAfterMs ? 12 : 0)
    )
  );

  return {
    internalSku: record.internalSku || universalListing.internalSku || "",
    sessionId: record.sessionId || "",
    title: universalListing.title || inventoryOS.item?.title || "Inventory item",
    quantity,
    platformCount: registry.length || platformStates.length,
    unsyncedPlatformCount: unsyncedPlatforms.length,
    queueSummary,
    latestEventCount: eventHistory.length,
    updatedAt,
    ageMinutes: Number.isFinite(ageMs) ? Math.round(ageMs / 60000) : null,
    status,
    score,
    blockedReasons,
    nextActions:
      status === "HEALTHY"
        ? ["Keep watching inventory sync state."]
        : [
            failedQueueCount ? "Review dead-lettered or failed sync jobs first." : "",
            quantity <= 0 ? "Confirm sold-out status and delist or zero out other platforms." : "",
            unsyncedPlatforms.length ? "Reconcile unsynced platform states against universal inventory." : "",
            ageMs > staleAfterMs ? "Refresh inventory snapshot from the latest listing history." : ""
          ].filter(Boolean)
  };
}

export async function runInventorySyncMonitorAgent(options: InventorySyncMonitorOptions = {}) {
  const maxItems = options.maxItems || 50;
  const staleAfterMs = options.staleAfterMs || 1000 * 60 * 60 * 6;
  const records = newestFirst(await loadInventoryState()).slice(0, maxItems);
  const items = records.map((record) => inspectInventoryRecord(record, staleAfterMs));
  const actionRequired = items.filter((item) => item.status === "ACTION_REQUIRED");
  const watch = items.filter((item) => item.status === "WATCH");
  const snapshot = {
    ok: true,
    bot: "inventory-sync-monitor",
    generatedAt: new Date().toISOString(),
    summary: {
      itemsReviewed: items.length,
      actionRequiredCount: actionRequired.length,
      watchCount: watch.length,
      healthyCount: items.filter((item) => item.status === "HEALTHY").length,
      averageHealthScore: items.length
        ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length)
        : 100
    },
    actionRequired,
    watch,
    items
  };

  await appendRecord(
    "inventory-sync-monitor",
    {
      id: `inventory-sync-monitor-${Date.now()}`,
      generatedAt: snapshot.generatedAt,
      summary: snapshot.summary
    },
    { maxRecords: 250 }
  );

  return snapshot;
}
