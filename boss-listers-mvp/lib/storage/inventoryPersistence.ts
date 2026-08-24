import { appendRecord, listRecords } from "./localDatabase";

export type InventoryPersistenceRecord = {
  id?: string;
  internalSku: string;
  sessionId: string;
  inventoryState: unknown;
  inventoryOS: unknown;
  syncSnapshot: unknown;
  eventHistory: unknown[];
};

export async function persistInventoryState(record: InventoryPersistenceRecord) {
  return appendRecord("inventory-state", record, { maxRecords: 1000 });
}

export async function loadInventoryState() {
  return listRecords<InventoryPersistenceRecord>("inventory-state");
}
