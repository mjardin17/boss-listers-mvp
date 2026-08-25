import { titleSimilarity, type LiveMarketPlatform } from "./soldCompsEngine";

export interface NormalizedActiveListing {
  platform: LiveMarketPlatform;
  title: string;
  price: number;
  condition: string;
  shippingCost: number | null;
  listingType: "AUCTION" | "BIN" | "UNKNOWN";
  sourceUrl: string;
  titleSimilarity: number;
}

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizePrice(value: unknown): number | null {
  const parsed = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
}

export function normalizeActiveListings({
  platform,
  rawListings = [],
  productTitle = ""
}: {
  platform: LiveMarketPlatform;
  rawListings?: any[];
  productTitle?: string;
}) {
  const listings = rawListings
    .map((item): NormalizedActiveListing | null => {
      const price = normalizePrice(item?.price ?? item?.currentPrice ?? item?.value);
      const title = cleanText(item?.title ?? item?.name);
      if (!price || !title) return null;
      return {
        platform,
        title,
        price,
        condition: cleanText(item?.condition || "unknown").toLowerCase(),
        shippingCost: normalizePrice(item?.shippingCost),
        listingType: item?.listingType === "AUCTION" || item?.listingType === "BIN" ? item.listingType : "UNKNOWN",
        sourceUrl: cleanText(item?.sourceUrl || item?.url),
        titleSimilarity: titleSimilarity(productTitle, title)
      };
    })
    .filter((item): item is NormalizedActiveListing => Boolean(item));

  return {
    platform,
    unavailable: listings.length === 0,
    reason: listings.length ? "" : "No normalized active listings were available from a live source.",
    activeCount: listings.length,
    listings
  };
}
