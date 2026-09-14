import { appendRecord, listRecords } from "./localDatabase";

export type TelemetryRecord = {
  id?: string;
  requestId: string;
  sessionId: string;
  eventType: string;
  telemetry: unknown;
  dataSafetyTelemetry?: unknown;
};

export async function persistTelemetry(record: TelemetryRecord) {
  return appendRecord("telemetry-history", record, { maxRecords: 2000 });
}

export async function loadTelemetryHistory() {
  return listRecords<TelemetryRecord>("telemetry-history");
}
