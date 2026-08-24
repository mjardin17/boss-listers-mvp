import { NextResponse } from "next/server";
import { normalizeActiveListings } from "../../../../lib/liveMarket/activeListingEngine";
import { normalizeSoldComps } from "../../../../lib/liveMarket/soldCompsEngine";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") || searchParams.get("q") || "";
  return NextResponse.json({
    ok: true,
    platform: "mercari",
    query: title,
    sold: normalizeSoldComps({ platform: "mercari", productTitle: title, rawComps: [] }),
    active: normalizeActiveListings({ platform: "mercari", productTitle: title, rawListings: [] }),
    unavailable: true,
    reason: "Mercari live adapter is not connected. No metrics fabricated."
  });
}
