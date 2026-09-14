import { loadListingHistory, type ListingHistoryRecord } from "../storage/listingHistoryStore";
import { appendRecord } from "../storage/localDatabase";

export type MultiPlatformPostingOptions = {
  maxItems?: number;
  targetPlatforms?: string[];
};

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? (value as Record<string, any>) : {};
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function newestFirst(records: ListingHistoryRecord[]) {
  return [...records].sort((a: any, b: any) => {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function platformName(draft: any) {
  if (!draft || typeof draft !== "object") return "unknown";
  return String(draft.platform || draft.marketplace || "unknown").toLowerCase();
}

function inspectListingRecord(record: ListingHistoryRecord, targetPlatforms: string[]) {
  const orchestration = asRecord(record.orchestration);
  const crossListStatus = asRecord(record.crossListStatus);
  const drafts = asArray(record.drafts.length ? record.drafts : orchestration.adaptedListings);
  const processedJobs = asArray(crossListStatus.processedJobs);
  const deadLetters = asArray(crossListStatus.deadLetters);
  const queueSummary = asRecord(crossListStatus.summary || orchestration.publishQueue?.summary);
  const platformDrafts = drafts.map((draft) => {
    const validation = asRecord(draft.validation);
    const metadata = asRecord(draft.metadata);
    const platform = platformName(draft);
    const job = processedJobs.find((item) => platformName(item) === platform || platformName(item.draft) === platform);
    const errors = asArray(validation.errors).map(String);
    const warnings = [...asArray(validation.warnings), ...asArray(metadata.warnings)].map(String);
    const publishState = String(job?.publishState || (metadata.publishReady ? "draft_ready" : "needs_review"));
    return {
      platform,
      title: draft.title || "",
      publishReady: Boolean(metadata.publishReady),
      validationValid: Boolean(validation.valid),
      publishState,
      adapterReady: publishState !== "not_implemented",
      errors,
      warnings: Array.from(new Set(warnings)).slice(0, 8)
    };
  });
  const missingTargets = targetPlatforms.filter(
    (platform) => !platformDrafts.some((draft) => draft.platform === platform.toLowerCase())
  );
  const readyDrafts = platformDrafts.filter((draft) => draft.publishReady && draft.validationValid);
  const blockedDrafts = platformDrafts.filter((draft) => !draft.publishReady || !draft.validationValid);
  const adapterBlocked = platformDrafts.filter((draft) => draft.publishState === "not_implemented");
  const failedJobs = processedJobs.filter((job) => ["failed", "not_implemented"].includes(String(job.publishState)));
  const blockers = [
    blockedDrafts.length ? `${blockedDrafts.length} platform drafts need validation fixes.` : "",
    adapterBlocked.length ? `${adapterBlocked.length} platform adapters are not connected yet.` : "",
    deadLetters.length ? `${deadLetters.length} publish jobs are in dead-letter review.` : "",
    missingTargets.length ? `Missing target drafts: ${missingTargets.join(", ")}.` : ""
  ].filter(Boolean);
  const score = platformDrafts.length
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round((readyDrafts.length / platformDrafts.length) * 100) -
            adapterBlocked.length * 8 -
            deadLetters.length * 10 -
            missingTargets.length * 6
        )
      )
    : 0;
  const status = blockers.length
    ? readyDrafts.length
      ? "PARTIAL_READY"
      : "BLOCKED"
    : "READY";

  return {
    internalSku: record.internalSku || orchestration.internalSku || "",
    sessionId: record.sessionId || "",
    status,
    listingStatus: record.status,
    score,
    totalDrafts: platformDrafts.length,
    readyDraftCount: readyDrafts.length,
    blockedDraftCount: blockedDrafts.length,
    adapterBlockedCount: adapterBlocked.length,
    failedJobCount: failedJobs.length,
    deadLetterCount: deadLetters.length,
    missingTargets,
    queueSummary,
    blockers,
    nextActions:
      status === "READY"
        ? ["Queue posting when marketplace adapters are authorized."]
        : [
            blockedDrafts.length ? "Fix validation errors before posting." : "",
            adapterBlocked.length ? "Connect live marketplace adapters before marking posts as published." : "",
            deadLetters.length ? "Review dead-lettered publish jobs." : "",
            missingTargets.length ? "Generate missing platform drafts." : ""
          ].filter(Boolean),
    platforms: platformDrafts
  };
}

export async function runMultiPlatformPostingAgent(options: MultiPlatformPostingOptions = {}) {
  const maxItems = options.maxItems || 50;
  const targetPlatforms = (options.targetPlatforms?.length
    ? options.targetPlatforms
    : ["ebay", "amazon", "walmart", "facebook", "mercari", "poshmark"]
  ).map((platform) => platform.toLowerCase());
  const records = newestFirst(await loadListingHistory()).slice(0, maxItems);
  const items = records.map((record) => inspectListingRecord(record, targetPlatforms));
  const blocked = items.filter((item) => item.status === "BLOCKED");
  const partialReady = items.filter((item) => item.status === "PARTIAL_READY");
  const ready = items.filter((item) => item.status === "READY");
  const snapshot = {
    ok: true,
    bot: "multi-platform-posting",
    generatedAt: new Date().toISOString(),
    targetPlatforms,
    summary: {
      listingsReviewed: items.length,
      readyCount: ready.length,
      partialReadyCount: partialReady.length,
      blockedCount: blocked.length,
      averagePostingScore: items.length
        ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length)
        : 0
    },
    blocked,
    partialReady,
    ready,
    items
  };

  await appendRecord(
    "multi-platform-posting-monitor",
    {
      id: `multi-platform-posting-monitor-${Date.now()}`,
      generatedAt: snapshot.generatedAt,
      targetPlatforms,
      summary: snapshot.summary
    },
    { maxRecords: 250 }
  );

  return snapshot;
}
