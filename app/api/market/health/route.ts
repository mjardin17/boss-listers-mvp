import { NextResponse } from "next/server";
import { evaluateMarketHealth } from "../../../../lib/liveMarket/marketHealth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return NextResponse.json({
    ok: true,
    health: evaluateMarketHealth({
      soldCount: Number(searchParams.get("soldCount")) || 0,
      activeCount: Number(searchParams.get("activeCount")) || 0,
      category: searchParams.get("category") || "",
      confidenceWeight: Number(searchParams.get("confidenceWeight")) || 0
    })
  });
}
