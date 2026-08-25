import type { NormalizedListing } from "./normalizedListingSchema";

export type BossBrainRecommendation = "BUY" | "MARGINAL" | "SKIP";

export type BossBrainScanHistoryRecord = {
  id: string;
  createdAt: string;
  upc: string;
  brand: string;
  productName: string;
  category: string;
  store: string;
  costPaid: number;
  marketplace: string;
  lowestSold: number | null;
  averageSold: number | null;
  highestSold: number | null;
  soldCount: number;
  profit: number;
  roi: number;
  recommendation: BossBrainRecommendation;
  confidence: number;
};

export type BossKnowledgeRecord = {
  upc: string;
  productName: string;
  avgProfit: number;
  avgROI: number;
  avgCostPaid: number;
  avgSalePrice: number;
  timesSeen: number;
  timesPurchased: number;
  lastSeen: string;
  brand: string;
  category: string;
  store: string;
};

export type BossAnalystResult = {
  recommendation: BossBrainRecommendation;
  reasoning: string;
  previousWinner: boolean;
  averageROI: number;
  averageProfit: number;
};

export type BossBrainInsights = {
  todaysProfitPotential: number;
  averageROI: number;
  bestCategory: string;
  bestBrand: string;
  bestStoreAisle: string;
  mostProfitableUPCs: BossKnowledgeRecord[];
};

export type BossBrainSnapshot = {
  scanHistory: BossBrainScanHistoryRecord[];
  knowledge: BossKnowledgeRecord[];
  previousWinner: BossKnowledgeRecord | null;
  analyst: BossAnalystResult | null;
  hotBuys: BossKnowledgeRecord[];
  topRoiItems: BossKnowledgeRecord[];
  topProfitItems: BossKnowledgeRecord[];
  mostFrequentlyScannedItems: BossKnowledgeRecord[];
  mostFrequentlyPurchasedItems: BossKnowledgeRecord[];
  insights: BossBrainInsights;
};

export type FutureMarketDataProvider = {
  id: "ebay" | "amazon" | "walmart" | "keepa" | "camelcamelcamel" | string;
  lookupByUpc(upc: string): Promise<unknown>;
  lookupByTitle(input: { brand: string; productName: string }): Promise<unknown>;
};

const SCAN_HISTORY_TABLE = "boss-brain.ScanHistory.v1";
const BOSS_KNOWLEDGE_TABLE = "boss-brain.BossKnowledge.v1";
const MAX_SCAN_HISTORY = 500;

function canUseLocalStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `boss-brain-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readTable<T>(key: string): T[] {
  if (!canUseLocalStorage()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function writeTable<T>(key: string, rows: T[]) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(rows));
}

function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function numeric(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value: number): number {
  return Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));
}

function roundRoi(value: number): number {
  return Number((Math.round((value + Number.EPSILON) * 10) / 10).toFixed(1));
}

function normalizeRecommendation(value: unknown, profit: number, roi: number): BossBrainRecommendation {
  const direct = clean(value).toUpperCase();
  if (direct === "BUY" || direct === "MARGINAL" || direct === "SKIP") return direct;
  if (roi >= 30 && profit >= 10) return "BUY";
  if (roi >= 10) return "MARGINAL";
  return "SKIP";
}

function listingKey(listing: NormalizedListing) {
  return clean(listing.upc) || clean(`${listing.brand || ""}|${listing.itemTitle}`).toLowerCase();
}

function marketplaceOf(listing: NormalizedListing) {
  return clean(listing.recommendedMarketplace?.platform || "eBay");
}

function averageSoldOf(listing: NormalizedListing) {
  return numeric(listing.marketData?.averageSold ?? listing.averageSoldPrice ?? listing.estimatedResalePrice ?? listing.averageSalePrice, 0) || null;
}

export function bossBrainScanFromListing(listing: NormalizedListing): BossBrainScanHistoryRecord {
  const profit = numeric(listing.estimatedProfit ?? listing.profitPotential, 0);
  const roi = numeric(listing.roiPercentage, 0);
  const recommendation = normalizeRecommendation(listing.recommendation || listing.decisionCard?.action, profit, roi);

  return {
    id: makeId(),
    createdAt: new Date().toISOString(),
    upc: clean(listing.upc),
    brand: clean(listing.brand),
    productName: clean(listing.confirmedProductIdentity?.title || listing.itemTitle),
    category: clean(listing.category || listing.confirmedProductIdentity?.category),
    store: clean(listing.sourceStoreType || listing.lookupSource || "Walmart"),
    costPaid: numeric(listing.resolvedCostBasis, 0),
    marketplace: marketplaceOf(listing),
    lowestSold: listing.marketData?.lowestSold ?? listing.lowestSold ?? null,
    averageSold: averageSoldOf(listing),
    highestSold: listing.marketData?.highestSold ?? listing.highestSold ?? null,
    soldCount: Math.max(0, Math.round(numeric(listing.marketData?.soldCount ?? listing.soldCount ?? listing.trustedCompSummary?.soldCount, 0))),
    profit: roundMoney(profit),
    roi: roundRoi(roi),
    recommendation,
    confidence: Math.max(0, Math.min(100, Math.round(numeric(listing.confidenceScore, 0))))
  };
}

function rollingAverage(previousAverage: number, previousCount: number, nextValue: number) {
  if (previousCount <= 0) return nextValue;
  return (previousAverage * previousCount + nextValue) / (previousCount + 1);
}

function isPurchasedSignal(scan: BossBrainScanHistoryRecord) {
  return scan.recommendation === "BUY";
}

function updateKnowledgeWithScan(
  knowledge: BossKnowledgeRecord[],
  scan: BossBrainScanHistoryRecord
): BossKnowledgeRecord[] {
  const key = scan.upc || scan.productName.toLowerCase();
  if (!key) return knowledge;
  const existing = knowledge.find((item) => (item.upc || item.productName.toLowerCase()) === key);
  if (!existing) {
    return [
      {
        upc: scan.upc,
        productName: scan.productName,
        avgProfit: scan.profit,
        avgROI: scan.roi,
        avgCostPaid: scan.costPaid,
        avgSalePrice: numeric(scan.averageSold, 0),
        timesSeen: 1,
        timesPurchased: isPurchasedSignal(scan) ? 1 : 0,
        lastSeen: scan.createdAt,
        brand: scan.brand,
        category: scan.category,
        store: scan.store
      },
      ...knowledge
    ];
  }

  const timesSeen = existing.timesSeen + 1;
  const updated: BossKnowledgeRecord = {
    ...existing,
    productName: scan.productName || existing.productName,
    brand: scan.brand || existing.brand,
    category: scan.category || existing.category,
    store: scan.store || existing.store,
    avgProfit: roundMoney(rollingAverage(existing.avgProfit, existing.timesSeen, scan.profit)),
    avgROI: roundRoi(rollingAverage(existing.avgROI, existing.timesSeen, scan.roi)),
    avgCostPaid: roundMoney(rollingAverage(existing.avgCostPaid, existing.timesSeen, scan.costPaid)),
    avgSalePrice: roundMoney(rollingAverage(existing.avgSalePrice, existing.timesSeen, numeric(scan.averageSold, 0))),
    timesSeen,
    timesPurchased: existing.timesPurchased + (isPurchasedSignal(scan) ? 1 : 0),
    lastSeen: scan.createdAt
  };

  return [updated, ...knowledge.filter((item) => item !== existing)];
}

export function recordBossBrainScan(listing: NormalizedListing): BossBrainSnapshot {
  const scan = bossBrainScanFromListing(listing);
  const history = [scan, ...loadBossBrainScanHistory()].slice(0, MAX_SCAN_HISTORY);
  const knowledge = updateKnowledgeWithScan(loadBossKnowledge(), scan);
  writeTable(SCAN_HISTORY_TABLE, history);
  writeTable(BOSS_KNOWLEDGE_TABLE, knowledge);
  return loadBossBrainSnapshot(listing);
}

export function loadBossBrainScanHistory() {
  return readTable<BossBrainScanHistoryRecord>(SCAN_HISTORY_TABLE)
    .filter((row) => row && row.id && row.createdAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function loadBossKnowledge() {
  return readTable<BossKnowledgeRecord>(BOSS_KNOWLEDGE_TABLE)
    .filter((row) => row && (row.upc || row.productName))
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
}

function knowledgeForListing(listing?: NormalizedListing | null) {
  if (!listing) return null;
  const key = listingKey(listing);
  if (!key) return null;
  return loadBossKnowledge().find((item) => item.upc === key || item.productName.toLowerCase() === key) || null;
}

function isPreviousWinner(record: BossKnowledgeRecord | null) {
  return Boolean(record && record.avgProfit >= 10 && record.avgROI >= 30);
}

export function runBossAnalyst(
  currentScan: NormalizedListing,
  historicalData = loadBossBrainScanHistory(),
  bossKnowledge = loadBossKnowledge()
): BossAnalystResult {
  const currentKey = listingKey(currentScan);
  const knowledge =
    bossKnowledge.find((item) => item.upc === currentKey || item.productName.toLowerCase() === currentKey) || null;
  const profit = numeric(currentScan.estimatedProfit ?? currentScan.profitPotential, 0);
  const roi = numeric(currentScan.roiPercentage, 0);
  const baseline = normalizeRecommendation(currentScan.recommendation || currentScan.decisionCard?.action, profit, roi);

  if (knowledge && knowledge.timesSeen >= 2) {
    const recommendation = normalizeRecommendation(baseline, knowledge.avgProfit, knowledge.avgROI);
    return {
      recommendation,
      previousWinner: isPreviousWinner(knowledge),
      averageROI: knowledge.avgROI,
      averageProfit: knowledge.avgProfit,
      reasoning: `Historically this item produced ${Math.round(knowledge.avgROI)}% ROI across ${knowledge.timesSeen} scans.`
    };
  }

  const similar = historicalData.filter((scan) =>
    [scan.category, scan.brand].some((value) => value && [currentScan.category, currentScan.brand].includes(value))
  );
  if (similar.length) {
    const avgROI = similar.reduce((sum, scan) => sum + scan.roi, 0) / similar.length;
    const avgProfit = similar.reduce((sum, scan) => sum + scan.profit, 0) / similar.length;
    return {
      recommendation: baseline,
      previousWinner: false,
      averageROI: roundRoi(avgROI),
      averageProfit: roundMoney(avgProfit),
      reasoning: `Similar items averaged ${Math.round(avgROI)}% ROI across ${similar.length} local scans.`
    };
  }

  return {
    recommendation: baseline,
    previousWinner: false,
    averageROI: roi,
    averageProfit: profit,
    reasoning: "No historical match yet; Boss Brain will learn from this scan."
  };
}

function hotBuyScore(item: BossKnowledgeRecord) {
  return item.avgProfit * 3 + item.avgROI * 0.35 + item.timesSeen * 4 + item.timesPurchased * 8;
}

function topBy<T>(items: T[], score: (item: T) => number, limit: number) {
  return [...items].sort((a, b) => score(b) - score(a)).slice(0, limit);
}

function mode(items: string[]) {
  const counts = new Map<string, number>();
  items.filter(Boolean).forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "Learning";
}

function buildInsights(history: BossBrainScanHistoryRecord[], knowledge: BossKnowledgeRecord[]): BossBrainInsights {
  const today = new Date().toDateString();
  const todaysScans = history.filter((scan) => new Date(scan.createdAt).toDateString() === today);
  const roiValues = todaysScans.map((scan) => scan.roi).filter((value) => Number.isFinite(value));
  return {
    todaysProfitPotential: roundMoney(todaysScans.reduce((sum, scan) => sum + Math.max(0, scan.profit), 0)),
    averageROI: roiValues.length ? roundRoi(roiValues.reduce((sum, value) => sum + value, 0) / roiValues.length) : 0,
    bestCategory: mode(topBy(knowledge, hotBuyScore, 20).map((item) => item.category)),
    bestBrand: mode(topBy(knowledge, hotBuyScore, 20).map((item) => item.brand)),
    bestStoreAisle: mode(topBy(knowledge, hotBuyScore, 20).map((item) => item.store)),
    mostProfitableUPCs: topBy(knowledge.filter((item) => item.upc), (item) => item.avgProfit, 5)
  };
}

export function loadBossBrainSnapshot(currentListing?: NormalizedListing | null): BossBrainSnapshot {
  const scanHistory = loadBossBrainScanHistory();
  const knowledge = loadBossKnowledge();
  const previousWinner = knowledgeForListing(currentListing);
  return {
    scanHistory,
    knowledge,
    previousWinner: isPreviousWinner(previousWinner) ? previousWinner : null,
    analyst: currentListing ? runBossAnalyst(currentListing, scanHistory, knowledge) : null,
    hotBuys: topBy(knowledge.filter((item) => item.store === "WALMART" || /walmart/i.test(item.store)), hotBuyScore, 20),
    topRoiItems: topBy(knowledge, (item) => item.avgROI, 5),
    topProfitItems: topBy(knowledge, (item) => item.avgProfit, 5),
    mostFrequentlyScannedItems: topBy(knowledge, (item) => item.timesSeen, 5),
    mostFrequentlyPurchasedItems: topBy(knowledge, (item) => item.timesPurchased, 5),
    insights: buildInsights(scanHistory, knowledge)
  };
}

export function buildBossBrainAIContext(currentScan?: Partial<NormalizedListing>) {
  const history = loadBossBrainScanHistory();
  const knowledge = loadBossKnowledge();
  const currentBrand = clean(currentScan?.brand);
  const currentCategory = clean(currentScan?.category);
  const topSimilarItems = knowledge
    .filter((item) => item.brand === currentBrand || item.category === currentCategory)
    .slice(0, 8);
  const recentWalmartWinners = history
    .filter((scan) => /walmart/i.test(scan.store) && scan.recommendation === "BUY" && scan.profit >= 10)
    .slice(0, 10);

  return {
    currentScan: currentScan
      ? {
          upc: currentScan.upc || "",
          brand: currentScan.brand || "",
          productName: currentScan.itemTitle || "",
          category: currentScan.category || "",
          costPaid: currentScan.resolvedCostBasis || 0
        }
      : null,
    historicalScanData: history.slice(0, 25),
    topSimilarItems,
    recentWalmartWinners,
    bossKnowledge: topBy(knowledge, hotBuyScore, 25)
  };
}
