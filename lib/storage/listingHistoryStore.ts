import { appendRecord, listRecords } from "./localDatabase";

export type ListingHistoryStatus = "draft" | "queued" | "published" | "sold" | "delisted" | "synced" | "failed_sync";

export type ListingHistoryRecord = {
  id?: string;
  internalSku: string;
  sessionId: string;
  status: ListingHistoryStatus;
  drafts: unknown[];
  orchestration: unknown;
  optimizationMetrics: unknown;
  crossListStatus: unknown;
};

export async function persistListingHistory(record: ListingHistoryRecord) {
  return appendRecord("listing-history", record, { maxRecords: 1000 });
}

export async function loadListingHistory() {
  return listRecords<ListingHistoryRecord>("listing-history");
}
