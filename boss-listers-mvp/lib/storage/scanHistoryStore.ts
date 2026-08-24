import { appendRecord, listRecords } from "./localDatabase";

export type PersistentScanRecord = {
  id?: string;
  requestId: string;
  sessionId: string;
  scannedAt: string;
  listing: unknown;
  analysis: unknown;
  decision: unknown;
  trustedCompSummary: unknown;
  recommendationOutcome: string;
};

export async function persistScanHistory(record: PersistentScanRecord) {
  return appendRecord("scan-history", record, { maxRecords: 1000 });
}

export async function loadPersistentScanHistory() {
  return listRecords<PersistentScanRecord>("scan-history");
}
