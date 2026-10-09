import { NextResponse } from "next/server";
import { runBossCouncilMonitor, type CouncilMonitorOptions } from "../../../lib/agents/councilMonitor";
import { ApiError, enforceRateLimit, withApiRequest } from "../../../lib/apiRuntime";
import { withOwnerSession } from "../../../lib/requireSessionApp";

export const runtime = "nodejs";

type ApiRequestContext = {
  requestId: string;
  identity: {
    userId: string;
    ip: string;
  };
};

// Owner-only: these monitors read the shared, non-tenant-scoped local stores
// (lib/storage/*) and council "refresh-pricing" spends the platform's paid
// pricing lookups, so any other tenant would see/spend the owner's data.
// withOwnerSession returns 401 without a token and 403 for non-owner tenants;
// the session userId then replaces the client-controlled identity headers.
function guarded(inner: (req: Request, context: ApiRequestContext) => Promise<Response>) {
  return withOwnerSession((req: Request, _routeContext: unknown, session: { userId: string }) =>
    withApiRequest((request: Request, context: ApiRequestContext) =>
      inner(request, { ...context, identity: { ...context.identity, userId: session.userId } })
    )(req)
  );
}

function numberParam(value: string | null, fallback: number) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function modeParam(value: string | null) {
  return value === "refresh-pricing" ? "refresh-pricing" : "observe";
}

export const GET = guarded(async function GET(req: Request, context: ApiRequestContext) {
  const { searchParams } = new URL(req.url);
  enforceRateLimit(`${context.identity.userId}:${context.identity.ip}:council-monitor`);

  const snapshot = await runBossCouncilMonitor({
    mode: modeParam(searchParams.get("mode")),
    maxItems: numberParam(searchParams.get("maxItems"), 50),
    maxPricingRefreshesPerRun: numberParam(searchParams.get("maxPricingRefreshesPerRun"), 5),
    maxPaidLookupsPerRun: numberParam(searchParams.get("maxPaidLookupsPerRun"), 0)
  });

  return NextResponse.json({
    ...snapshot,
    requestId: context.requestId
  });
});

export const POST = guarded(async function POST(req: Request, context: ApiRequestContext) {
  enforceRateLimit(`${context.identity.userId}:${context.identity.ip}:council-monitor`);

  let body: CouncilMonitorOptions;
  try {
    body = await req.json();
  } catch {
    throw new ApiError("Monitor payload must be valid JSON.", {
      status: 400,
      code: "INVALID_MONITOR_PAYLOAD",
      expose: true
    });
  }

  const snapshot = await runBossCouncilMonitor({
    mode: body.mode === "refresh-pricing" ? "refresh-pricing" : "observe",
    maxItems: body.maxItems,
    maxPricingRefreshesPerRun: body.maxPricingRefreshesPerRun,
    maxPaidLookupsPerRun: body.maxPaidLookupsPerRun ?? 0,
    pricingMemoryTtlMs: body.pricingMemoryTtlMs,
    stalePricingAfterMs: body.stalePricingAfterMs,
    candidates: Array.isArray(body.candidates) ? body.candidates : []
  });

  return NextResponse.json({
    ...snapshot,
    requestId: context.requestId
  });
});
