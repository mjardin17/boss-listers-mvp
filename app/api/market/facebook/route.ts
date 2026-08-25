import { NextResponse } from "next/server";
import { normalizeActiveListings } from "../../../../lib/liveMarket/activeListingEngine";
import { normalizeSoldComps } from "../../../../lib/liveMarket/soldCompsEngine";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") || searchParams.get("q") || "";
  return NextResponse.json({
    ok: true,
    platform: "facebook",
    query: title,
    sold: normalizeSoldComps({ platform: "facebook", productTitle: title, rawComps: [] }),
    active: normalizeActiveListings({ platform: "facebook", productTitle: title, rawListings: [] }),
    unavailable: true,
    reason: "Facebook Marketplace adapter is not connected. No metrics fabricated."
  });
}
