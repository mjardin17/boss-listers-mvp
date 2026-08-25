export type MarketDataInput = {
  upc?: string;
  brand?: string;
  productName?: string;
};

export type MarketDataComp = {
  title: string;
  price: number;
  soldDate: string;
  sourcePlatform: "eBay";
  estimated: boolean;
  confidence: number;
};

export type MarketDataResult = {
  walmartPrice: number | null;
  walmartTitle: string;
  soldCount: number;
  lowestSold: number | null;
  averageSold: number | null;
  highestSold: number | null;
  confidence: number;
  lookupPriority: "UPC" | "BRAND_PRODUCT" | "VISUAL_FALLBACK";
  comps: MarketDataComp[];
  status: "LIVE" | "UNAVAILABLE";
  notice: string;
};

type MarketDataContext = {
  comps?: Record<string, any> | null;
  listing?: Record<string, any>;
  analysis?: Record<string, any>;
  productLookup?: Record<string, any> | null;
};

function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function money(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : 0;
}

function roundMoney(value: number): number {
  return Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function normalizeUpc(value: unknown): string {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 14 ? digits : "";
}

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return roundMoney(sorted[index]);
}

function average(values: number[]): number | null {
  const filtered = values.filter((value) => Number.isFinite(value) && value > 0);
  return filtered.length
    ? roundMoney(filtered.reduce((sum, value) => sum + value, 0) / filtered.length)
    : null;
}

function collectLiveComps(context: MarketDataContext = {}): MarketDataComp[] {
  const sources = [
    ...asArray(context.comps?.recentSales),
    ...asArray(context.comps?.items),
    ...asArray(context.listing?.comps),
    ...asArray(context.analysis?.marketCompEstimates)
  ];

  return sources
    .map((comp) => ({
      title: clean(comp.title || comp.itemTitle || context.listing?.itemTitle || "eBay sold comp"),
      price: money(comp.price || comp.soldPrice || comp.value),
      soldDate: clean(comp.dateSold || comp.soldAt || comp.date || "Recent"),
      sourcePlatform: "eBay" as const,
      estimated: Boolean(comp.estimated),
      confidence: Math.max(35, Math.min(95, Math.round(Number(comp.confidence || 78))))
    }))
    .filter((comp) => comp.price > 0)
    .slice(0, 20);
}

export function getMarketData(
  input: MarketDataInput,
  context: MarketDataContext = {}
): MarketDataResult {
  const upc = normalizeUpc(input.upc || context.analysis?.upc || context.listing?.upc);
  const brand = clean(input.brand || context.analysis?.brand || context.listing?.brand);
  const productName = clean(
    input.productName || context.analysis?.productName || context.analysis?.itemTitle || context.listing?.itemTitle
  );
  const lookupPriority = upc ? "UPC" : brand && productName ? "BRAND_PRODUCT" : "VISUAL_FALLBACK";
  const liveComps = collectLiveComps(context);
  const confidenceBase = lookupPriority === "UPC" ? 84 : lookupPriority === "BRAND_PRODUCT" ? 68 : 48;
  const comps = liveComps.filter((comp) => !comp.estimated);
  const prices = comps.map((comp) => comp.price).filter((price) => price > 0);
  const soldCount = prices.length;

  return {
    walmartPrice: money(context.productLookup?.walmartPrice ?? context.analysis?.walmartPrice) || null,
    walmartTitle: clean(context.productLookup?.title || context.analysis?.walmartTitle || ""),
    soldCount,
    lowestSold: percentile(prices, 0),
    averageSold: average(prices),
    highestSold: percentile(prices, 1),
    confidence: soldCount > 0 ? Math.max(0, Math.min(99, confidenceBase + 8)) : 0,
    lookupPriority,
    comps,
    status: soldCount > 0 ? "LIVE" : "UNAVAILABLE",
    notice:
      soldCount > 0
        ? "Authorized sold comparable data was used."
        : "No authorized sold-comps feed is configured for this scan. Enter a manual sold comp or connect an official marketplace API."
  };
}
