import { loadInventoryState } from "./inventoryPersistence";
import { loadListingHistory } from "./listingHistoryStore";
import { loadPersistentScanHistory } from "./scanHistoryStore";
import { loadTelemetryHistory } from "./telemetryStore";

export async function buildRecoverySnapshot() {
  const [scanHistory, listingHistory, inventoryState, telemetryHistory] = await Promise.all([
    loadPersistentScanHistory(),
    loadListingHistory(),
    loadInventoryState(),
    loadTelemetryHistory()
  ]);

  return {
    recoveredAt: new Date().toISOString(),
    scanHistory,
    listingHistory,
    inventoryState,
    telemetryHistory,
    counts: {
      scans: scanHistory.length,
      listings: listingHistory.length,
      inventory: inventoryState.length,
      telemetry: telemetryHistory.length
    }
  };
}
