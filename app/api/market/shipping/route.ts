import { NextResponse } from "next/server";
import { estimateShippingRisk } from "../../../../lib/liveMarket/shippingRiskModel";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return NextResponse.json({
    ok: true,
    shipping: estimateShippingRisk({
      weightLb: searchParams.get("weightLb") ? Number(searchParams.get("weightLb")) : null,
      category: searchParams.get("category") || "",
      fragile: searchParams.get("fragile") === "true"
    })
  });
}
