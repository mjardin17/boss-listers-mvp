import { NextResponse } from "next/server";
import { normalizeActiveListings } from "../../../../lib/liveMarket/activeListingEngine";
import { normalizeSoldComps } from "../../../../lib/liveMarket/soldCompsEngine";
import { analyzeDemand } from "../../../../lib/liveMarket/demandAnalyzer";
import { analyzeSaturation } from "../../../../lib/liveMarket/saturationAnalyzer";

export const runtime = "nodejs";

function safeJsonArray(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function fetchEbayActiveListings(query: string) {
  const token = process.env.EBAY_ACCESS_TOKEN;
  if (!token || !query) return { unavailable: true, reason: "EBAY_ACCESS_TOKEN is not configured.", rawListings: [] };
  const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "25");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 600 }
  });
  if (!response.ok) {
    return { unavailable: true, reason: `eBay Browse API returned ${response.status}.`, rawListings: [] };
  }
  const data = await response.json();
  return {
    unavailable: false,
    reason: "",
    rawListings: (data.itemSummaries || []).map((item: any) => ({
      title: item.title,
      price: item.price?.value,
      condition: item.condition,
      shippingCost: item.shippingOptions?.[0]?.shippingCost?.value,
      listingType: item.buyingOptions?.includes("AUCTION") ? "AUCTION" : "BIN",
      sourceUrl: item.itemWebUrl
    }))
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") || "";
  const query = searchParams.get("q") || searchParams.get("upc") || title;
  const liveActive = await fetchEbayActiveListings(query);
  const sold = normalizeSoldComps({
    platform: "ebay",
    productTitle: title || query,
    rawComps: safeJsonArray(searchParams.get("soldComps"))
  });
  const active = normalizeActiveListings({
    platform: "ebay",
    productTitle: title || query,
    rawListings: liveActive.rawListings
  });
  const saturation = analyzeSaturation({ activeCount: active.activeCount, soldCount: sold.soldCount });
  const demand = analyzeDemand({
    activeCount: active.activeCount,
    soldCount: sold.soldCount,
    confidenceWeight: sold.confidenceWeight
  });
  return NextResponse.json({
    ok: true,
    platform: "ebay",
    query,
    sold,
    active: { ...active, unavailable: liveActive.unavailable || active.unavailable, reason: liveActive.reason || active.reason },
    saturation,
    demand,
    warning: sold.unavailable ? "Sold comps unavailable; active listings are market pressure only." : ""
  });
}
