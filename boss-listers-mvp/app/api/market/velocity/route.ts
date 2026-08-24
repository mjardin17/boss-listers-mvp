import { NextResponse } from "next/server";
import { calculateVelocity } from "../../../../lib/liveMarket/velocityEngine";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return NextResponse.json({
    ok: true,
    velocity: calculateVelocity({
      soldCount: Number(searchParams.get("soldCount")) || 0,
      activeCount: Number(searchParams.get("activeCount")) || 0,
      trailingDays: Number(searchParams.get("trailingDays")) || 90
    })
  });
}
