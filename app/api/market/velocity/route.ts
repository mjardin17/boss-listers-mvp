import { NextResponse } from "next/server";
import { withSession } from "../../../../lib/requireSessionApp";
import { calculateVelocity } from "../../../../lib/liveMarket/velocityEngine";

export const runtime = "nodejs";

async function GET_handler(req: Request) {
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

export const GET = withSession(GET_handler);
