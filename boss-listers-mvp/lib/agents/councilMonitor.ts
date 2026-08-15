import { runExecutionAgents } from "./executionAgent";
import { getCachedValue, setCachedValue } from "../storage/cacheEngine";
import { appendRecord } from "../storage/localDatabase";
import { loadPersistentScanHistory, type PersistentScanRecord } from "../storage/scanHistoryStore";

type MonitorMode = "observe" | "refresh-pricing";
type PricingSource =
  | "verified_sold_comps"
  | "USER_VERIFIED_SALE"
  | "USER_VERIFIED"
  | "manual_sold_comp"
  | "cached_verified_result"
  | "cached_monitor_memory"
  | "estimated"
  | "unknown";

export type CouncilMonitorCandidate = {
  id?: string;
  upc?: string;
  title?: string;
  brand?: string;
  category?: string;
  costBasis?: number | null;
  resalePrice?: number | null;
  soldCount?: number;
  confidenceScore?: number;
  pricingSource?: PricingSource | string;
  pricingStatus?: string;
  scannedAt?: string;
  analysis?: Record<string, any>;
  pricing?: Record<string, any>;
  trustedCompSummary?: Record<string, any>;
};

export type CouncilMonitorOptions = {
  mode?: MonitorMode;
  maxItems?: number;
  maxPricingRefreshesPerRun?: number;
  maxPaidLookupsPerRun?: number;
  pricingMemoryTtlMs?: number;
  stalePricingAfterMs?: number;
  candidates?: CouncilMonitorCandidate[];
};

const DEFAULT_MAX_ITEMS = 50;
const DEFAULT_MAX_REFRESHES = 5;
const DEFAULT_MAX_PAID_LOOKUPS = 0;
const DEFAULT_MEMORY_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const DEFAULT_STALE_AFTER_MS = 1000 * 60 * 60 * 24;
const PRICING_MEMORY_NAMESPACE = "council_pricing_memory";

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function money(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeUpc(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 14 ? digits : "";
}

function candidateKey(candidate: CouncilMonitorCandidate) {
  const upc = normalizeUpc(candidate.upc);
  if (upc) return `upc:${upc}`;
  const title = clean(candidate.title || candidate.analysis?.itemTitle || candidate.analysis?.productName).toLowerCase();
  const brand = clean(candidate.brand || candidate.analysis?.brand).toLowerCase();
  return [brand, title].filter(Boolean).join("|") || clean(candidate.id).toLowerCase();
}

function firstMoney(...values: unknown[]) {
  for (const value of values) {
    const parsed = money(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function trustedPricingSource(source: unknown) {
  return [
    "verified_sold_comps",
    "USER_VERIFIED_SALE",
    "USER_VERIFIED",
    "manual_sold_comp",
    "cached_verified_result",
    "cached_monitor_memory"
  ].includes(String(source));
}

function candidateFromScan(record: PersistentScanRecord): CouncilMonitorCandidate {
  const listing = (record.listing || {}) as Record<string, any>;
  const analysis = (record.analysis || {}) as Record<string, any>;
  const pricing = (analysis.pricing || listing.pricing || {}) as Record<string, any>;
  const trustedCompSummary = (record.trustedCompSummary || analysis.trustedCompSummary || listing.trustedCompSummary || {}) as Record<string, any>;

  return {
    id: record.id || record.requestId,
    upc: listing.upc || analysis.upc,
    title: listing.itemTitle || listing.title || analysis.itemTitle || analysis.productName,
    brand: listing.brand || analysis.brand,
    category: listing.category || analysis.category,
    costBasis: firstMoney(
      listing.resolvedCostBasis,
      pricing.expectedProfit?.costOfGoods,
      pricing.profitSummary?.costOfGoods,
      analysis.costOfGoods
    ),
    resalePrice: firstMoney(
      listing.averageSoldPrice,
      listing.estimatedResalePrice,
      pricing.selectedPrice,
      pricing.averagePrice,
      pricing.marketSignals?.soldPriceRange?.midpoint,
      trustedCompSummary.averageSoldPrice
    ),
    soldCount: Math.max(
      0,
      Math.round(firstNumber(trustedCompSummary.soldCount, pricing.validSoldCount, pricing.marketSignals?.validSoldCount, listing.soldCount))
    ),
    confidenceScore: clamp(
      Math.round(firstNumber(listing.confidenceScore, analysis.confidenceScore, pricing.marketSignals?.profitConfidenceScore)),
      0,
      100
    ),
    pricingSource: listing.pricingSource || analysis.pricingSource || pricing.pricingSource || "unknown",
    pricingStatus: listing.pricingStatus || analysis.pricingStatus || pricing.pricingStatus || "",
    scannedAt: record.scannedAt,
    analysis,
    pricing,
    trustedCompSummary
  };
}

function mergeCandidates(candidates: CouncilMonitorCandidate[]) {
  const byKey = new Map<string, CouncilMonitorCandidate>();
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing || new Date(candidate.scannedAt || 0).getTime() > new Date(existing.scannedAt || 0).getTime()) {
      byKey.set(key, candidate);
    }
  }
  return [...byKey.values()];
}

function pricingHealth(candidate: CouncilMonitorCandidate, cached: any, stalePricingAfterMs: number) {
  const cachedPrice = firstMoney(cached?.resalePrice, cached?.pricing?.resalePrice);
  const directPrice = firstMoney(candidate.resalePrice);
  const resalePrice = directPrice ?? cachedPrice;
  const pricingSource = directPrice
    ? candidate.pricingSource || "unknown"
    : cachedPrice
      ? "cached_monitor_memory"
      : candidate.pricingSource || "unknown";
  const lastPricedAt = cached?.pricedAt || candidate.scannedAt || "";
  const ageMs = lastPricedAt ? Date.now() - new Date(lastPricedAt).getTime() : Number.POSITIVE_INFINITY;
  const hasTrustedSource = trustedPricingSource(pricingSource);
  const hasSoldEvidence = Number(candidate.soldCount || cached?.soldCount || 0) > 0;
  const confidenceScore = clamp(
    Math.round(firstNumber(candidate.confidenceScore, cached?.confidenceScore) + (hasTrustedSource ? 10 : 0) + (hasSoldEvidence ? 8 : 0)),
    0,
    100
  );

  return {
    resalePrice,
    pricingSource,
    pricingStatus: resalePrice ? (hasTrustedSource ? "trusted" : "usable") : "missing",
    confidenceScore,
    stale: ageMs > stalePricingAfterMs,
    lastPricedAt,
    hasSoldEvidence,
    needsRefresh: !resalePrice || (!hasTrustedSource && confidenceScore < 65) || ageMs > stalePricingAfterMs
  };
}

function priorityFor(candidate: CouncilMonitorCandidate, health: ReturnType<typeof pricingHealth>) {
  let priority = 0;
  if (!health.resalePrice) priority += 50;
  if (health.stale) priority += 20;
  if (!health.hasSoldEvidence) priority += 15;
  if (candidate.costBasis != null && health.resalePrice != null) priority += 8;
  priority += Math.max(0, 70 - health.confidenceScore) * 0.4;
  return Math.round(priority);
}

async function rememberPricing(candidate: CouncilMonitorCandidate, health: ReturnType<typeof pricingHealth>, ttlMs: number) {
  const key = candidateKey(candidate);
  if (!key || !health.resalePrice) return null;

  return setCachedValue(
    PRICING_MEMORY_NAMESPACE,
    key,
    {
      resalePrice: health.resalePrice,
      pricingSource: health.pricingSource,
      soldCount: candidate.soldCount || 0,
      confidenceScore: health.confidenceScore,
      title: candidate.title || candidate.analysis?.itemTitle || "",
      brand: candidate.brand || candidate.analysis?.brand || "",
      category: candidate.category || candidate.analysis?.category || "",
      pricedAt: new Date().toISOString()
    },
    ttlMs
  );
}

export async function runBossCouncilMonitor(options: CouncilMonitorOptions = {}) {
  const mode = options.mode || "observe";
  const maxItems = options.maxItems || DEFAULT_MAX_ITEMS;
  const maxPricingRefreshesPerRun = options.maxPricingRefreshesPerRun ?? DEFAULT_MAX_REFRESHES;
  const maxPaidLookupsPerRun = options.maxPaidLookupsPerRun ?? DEFAULT_MAX_PAID_LOOKUPS;
  const pricingMemoryTtlMs = options.pricingMemoryTtlMs || DEFAULT_MEMORY_TTL_MS;
  const stalePricingAfterMs = options.stalePricingAfterMs || DEFAULT_STALE_AFTER_MS;

  const scanHistory = await loadPersistentScanHistory();
  const candidates = mergeCandidates([
    ...(options.candidates || []),
    ...scanHistory.map(candidateFromScan)
  ]).slice(0, maxItems);

  const assessed = [];
  let paidLookupsReserved = 0;
  let localRefreshes = 0;

  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    const cached = key ? await getCachedValue<any>(PRICING_MEMORY_NAMESPACE, key) : null;
    const health = pricingHealth(candidate, cached, stalePricingAfterMs);
    const priority = priorityFor(candidate, health);
    const council = runExecutionAgents({
      analysis: {
        ...candidate.analysis,
        itemTitle: candidate.title || candidate.analysis?.itemTitle,
        category: candidate.category || candidate.analysis?.category,
        confidenceScore: health.confidenceScore,
        averageSoldPrice: health.resalePrice
      },
      pricing: {
        ...candidate.pricing,
        averageSoldPrice: health.resalePrice,
        pricingSource: health.pricingSource,
        pricingStatus: health.pricingStatus
      },
      trustedCompSummary: candidate.trustedCompSummary || {}
    });

    let action = "WATCH";
    const reasons = [];
    if (health.needsRefresh) reasons.push("Pricing is missing, stale, or low-confidence.");
    if (!key) reasons.push("Identity key is weak; full scan identity should be improved.");
    if (!health.hasSoldEvidence) reasons.push("No sold-comp evidence is attached yet.");
    if (health.resalePrice) reasons.push(`Current pricing memory is $${health.resalePrice}.`);

    if (mode === "refresh-pricing" && health.needsRefresh && localRefreshes < maxPricingRefreshesPerRun) {
      if (health.resalePrice) {
        await rememberPricing(candidate, health, pricingMemoryTtlMs);
        localRefreshes += 1;
        action = "CACHE_PRICE_MEMORY";
      } else if (paidLookupsReserved < maxPaidLookupsPerRun) {
        paidLookupsReserved += 1;
        action = "RESERVE_PAID_LOOKUP";
      } else {
        action = "NEEDS_MANUAL_OR_DEFERRED_PRICE";
      }
    } else if (health.needsRefresh) {
      action = "QUEUE_REFRESH";
    }

    assessed.push({
      key,
      title: candidate.title || candidate.analysis?.itemTitle || "Unknown item",
      upc: normalizeUpc(candidate.upc),
      brand: candidate.brand || candidate.analysis?.brand || "",
      category: candidate.category || candidate.analysis?.category || "",
      priority,
      action,
      reasons,
      pricing: health,
      councilSummary: council.summary,
      councilAgents: council.agents,
      councilTelemetry: council.telemetry
    });
  }

  const sorted = assessed.sort((a, b) => b.priority - a.priority);
  const refreshQueue = sorted.filter((item) => item.action === "QUEUE_REFRESH" || item.action === "NEEDS_MANUAL_OR_DEFERRED_PRICE" || item.action === "RESERVE_PAID_LOOKUP");
  const snapshot = {
    ok: true,
    monitor: "boss-council-monitor",
    mode,
    generatedAt: new Date().toISOString(),
    budget: {
      maxPricingRefreshesPerRun,
      localRefreshesUsed: localRefreshes,
      maxPaidLookupsPerRun,
      paidLookupsReserved,
      paidLookupsRemaining: Math.max(0, maxPaidLookupsPerRun - paidLookupsReserved)
    },
    summary: {
      candidatesReviewed: sorted.length,
      refreshQueueCount: refreshQueue.length,
      trustedPriceCount: sorted.filter((item) => item.pricing.pricingStatus === "trusted").length,
      missingPriceCount: sorted.filter((item) => !item.pricing.resalePrice).length,
      averageCouncilScore: sorted.length
        ? Math.round(sorted.reduce((sum, item) => sum + Number(item.councilTelemetry.averageAgentScore || 0), 0) / sorted.length)
        : 0
    },
    refreshQueue,
    watchedItems: sorted
  };

  await appendRecord(
    "council-monitor",
    {
      id: `council-monitor-${Date.now()}`,
      generatedAt: snapshot.generatedAt,
      mode,
      budget: snapshot.budget,
      summary: snapshot.summary
    },
    { maxRecords: 250 }
  );

  return snapshot;
}
