export type LiveMarketPlatform =
  | "ebay"
  | "amazon"
  | "walmart"
  | "mercari"
  | "facebook"
  | "tiktok";

export interface NormalizedSoldComp {
  platform: LiveMarketPlatform;
  title: string;
  price: number;
  soldAt: string;
  condition: string;
  shippingCost: number | null;
  listingType: "AUCTION" | "BIN" | "UNKNOWN";
  sourceUrl: string;
  titleSimilarity: number;
}

export interface SoldCompsSummary {
  platform: LiveMarketPlatform;
  unavailable: boolean;
  reason: string;
  soldCount: number;
  averageSoldPrice: number | null;
  priceRange: {
    low: number | null;
    midpoint: number | null;
    high: number | null;
  };
  comps: NormalizedSoldComp[];
  confidenceWeight: number;
}

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function tokenSet(value: unknown) {
  return new Set(
    cleanText(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3)
  );
}

export function titleSimilarity(sourceTitle: unknown, compTitle: unknown) {
  const source = tokenSet(sourceTitle);
  const comp = tokenSet(compTitle);
  if (!source.size || !comp.size) return 0;
  const overlap = Array.from(source).filter((token) => comp.has(token)).length;
  return Number((overlap / source.size).toFixed(3));
}

function normalizePrice(value: unknown): number | null {
  const parsed = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

export function normalizeSoldComps({
  platform,
  rawComps = [],
  productTitle = ""
}: {
  platform: LiveMarketPlatform;
  rawComps?: any[];
  productTitle?: string;
}): SoldCompsSummary {
  const comps = rawComps
    .map((item): NormalizedSoldComp | null => {
      const price = normalizePrice(item?.price ?? item?.soldPrice ?? item?.value);
      const soldAt = cleanText(item?.soldAt ?? item?.dateSold ?? item?.endDate);
      const title = cleanText(item?.title ?? item?.name);
      const isSold = item?.isSold === true || String(item?.status || "").toLowerCase() === "completed";
      if (!price || !soldAt || !title || !isSold) return null;
      return {
        platform,
        title,
        price,
        soldAt,
        condition: cleanText(item?.condition || "unknown").toLowerCase(),
        shippingCost: normalizePrice(item?.shippingCost),
        listingType: item?.listingType === "AUCTION" || item?.listingType === "BIN" ? item.listingType : "UNKNOWN",
        sourceUrl: cleanText(item?.sourceUrl || item?.url),
        titleSimilarity: titleSimilarity(productTitle, title)
      };
    })
    .filter((item): item is NormalizedSoldComp => Boolean(item))
    .sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());

  const prices = comps.map((item) => item.price);
  const averageSoldPrice = prices.length
    ? Number((prices.reduce((sum, price) => sum + price, 0) / prices.length).toFixed(2))
    : null;

  return {
    platform,
    unavailable: comps.length === 0,
    reason: comps.length ? "" : "No normalized sold comps were available from a live source.",
    soldCount: comps.length,
    averageSoldPrice,
    priceRange: {
      low: percentile(prices, 0.2),
      midpoint: percentile(prices, 0.5),
      high: percentile(prices, 0.8)
    },
    comps,
    confidenceWeight: Math.min(60, comps.length * 8)
  };
}
