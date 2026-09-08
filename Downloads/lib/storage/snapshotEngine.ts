import { persistInventoryState } from "./inventoryPersistence";
import { persistListingHistory } from "./listingHistoryStore";
import { persistScanHistory } from "./scanHistoryStore";
import { persistTelemetry } from "./telemetryStore";

export async function persistExecutionSnapshot({
  requestId,
  sessionId,
  payload,
  analysis,
  pricing,
  trustedCompSummary
}: {
  requestId: string;
  sessionId: string;
  payload: any;
  analysis: any;
  pricing: any;
  trustedCompSummary: any;
}) {
  const listing = payload?.listing || null;
  const orchestration = analysis?.listingOrchestration || null;
  const inventoryOS = analysis?.inventoryOS || null;
  const inventorySyncSnapshot = analysis?.inventorySyncSnapshot || null;
  const internalSku =
    orchestration?.internalSku || inventorySyncSnapshot?.universalListing?.internalSku || inventoryOS?.item?.internalSku || "";

  const tasks: Promise<unknown>[] = [
    persistScanHistory({
      requestId,
      sessionId,
      scannedAt: new Date().toISOString(),
      listing,
      analysis,
      decision: payload?.decision || null,
      trustedCompSummary,
      recommendationOutcome: listing?.recommendation || analysis?.recommendation || "MANUAL_REVIEW"
    }),
    persistTelemetry({
      requestId,
      sessionId,
      eventType: "ANALYSIS_COMPLETED",
      telemetry: {
        instrumentation: payload?.instrumentation,
        engineTelemetry: listing?.engineTelemetry || analysis?.engineTelemetry || null,
        resellerEngineTelemetry: analysis?.resellerEngineTelemetry || null,
        pricingStatus: pricing?.pricingStatus || listing?.pricingStatus || ""
      },
      dataSafetyTelemetry: analysis?.dataSafetyTelemetry || listing?.dataSafetyTelemetry || null
    })
  ];

  if (orchestration) {
    tasks.push(
      persistListingHistory({
        internalSku,
        sessionId,
        status: orchestration?.publishQueue?.summary?.failedJobs ? "failed_sync" : "draft",
        drafts: orchestration?.adaptedListings || [],
        orchestration,
        optimizationMetrics: orchestration?.summary || null,
        crossListStatus: orchestration?.publishQueue || null
      })
    );
  }

  if (inventoryOS || inventorySyncSnapshot) {
    tasks.push(
      persistInventoryState({
        internalSku,
        sessionId,
        inventoryState: inventoryOS?.item || inventorySyncSnapshot?.universalListing || null,
        inventoryOS,
        syncSnapshot: inventorySyncSnapshot,
        eventHistory: [
          ...(inventoryOS?.events || []),
          ...(inventorySyncSnapshot?.syncPreview?.eventFlow || [])
        ]
      })
    );
  }

  await Promise.all(tasks);
}
