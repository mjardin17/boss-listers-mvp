import { NextResponse } from "next/server";
import { ApiError, enforceRateLimit, withApiRequest } from "../../../lib/apiRuntime";
import { runInventorySyncMonitorAgent } from "../../../lib/agents/inventorySyncMonitorAgent";
import { runMultiPlatformPostingAgent } from "../../../lib/agents/multiPlatformPostingAgent";

export const runtime = "nodejs";

type ApiRequestContext = {
  requestId: string;
  identity: {
    userId: string;
    ip: string;
  };
};

type BotSelector = "inventory-sync" | "multi-platform-posting" | "all";

function botParam(value: string | null): BotSelector {
  if (value === "inventory-sync" || value === "multi-platform-posting") return value;
  return "all";
}

function numberParam(value: string | null, fallback: number) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function platformParam(value: string | null) {
  return String(value || "")
    .split(",")
    .map((platform) => platform.trim())
    .filter(Boolean);
}

async function runSelectedBots({
  bot,
  maxItems,
  staleAfterMs,
  targetPlatforms
}: {
  bot: BotSelector;
  maxItems?: number;
  staleAfterMs?: number;
  targetPlatforms?: string[];
}) {
  const tasks: Promise<unknown>[] = [];
  if (bot === "all" || bot === "inventory-sync") {
    tasks.push(runInventorySyncMonitorAgent({ maxItems, staleAfterMs }));
  }
  if (bot === "all" || bot === "multi-platform-posting") {
    tasks.push(runMultiPlatformPostingAgent({ maxItems, targetPlatforms }));
  }

  const results = await Promise.all(tasks);
  const inventorySync = results.find((result: any) => result?.bot === "inventory-sync-monitor") || null;
  const multiPlatformPosting = results.find((result: any) => result?.bot === "multi-platform-posting") || null;

  return {
    ok: true,
    monitor: "specialist-bots",
    generatedAt: new Date().toISOString(),
    inventorySync,
    multiPlatformPosting,
    summary: {
      inventoryActionRequired: Number((inventorySync as any)?.summary?.actionRequiredCount || 0),
      postingBlocked: Number((multiPlatformPosting as any)?.summary?.blockedCount || 0),
      postingPartialReady: Number((multiPlatformPosting as any)?.summary?.partialReadyCount || 0)
    }
  };
}

export const GET = withApiRequest(async function GET(req: Request, context: ApiRequestContext) {
  enforceRateLimit(`${context.identity.userId}:${context.identity.ip}:specialist-bots`);
  const { searchParams } = new URL(req.url);
  const snapshot = await runSelectedBots({
    bot: botParam(searchParams.get("bot")),
    maxItems: numberParam(searchParams.get("maxItems"), 50),
    staleAfterMs: numberParam(searchParams.get("staleAfterMs"), 1000 * 60 * 60 * 6),
    targetPlatforms: platformParam(searchParams.get("targetPlatforms"))
  });

  return NextResponse.json({
    ...snapshot,
    requestId: context.requestId
  });
});

export const POST = withApiRequest(async function POST(req: Request, context: ApiRequestContext) {
  enforceRateLimit(`${context.identity.userId}:${context.identity.ip}:specialist-bots`);

  let body: any;
  try {
    body = await req.json();
  } catch {
    throw new ApiError("Specialist bot payload must be valid JSON.", {
      status: 400,
      code: "INVALID_SPECIALIST_BOT_PAYLOAD",
      expose: true
    });
  }

  const snapshot = await runSelectedBots({
    bot: botParam(body.bot),
    maxItems: numberParam(body.maxItems, 50),
    staleAfterMs: numberParam(body.staleAfterMs, 1000 * 60 * 60 * 6),
    targetPlatforms: Array.isArray(body.targetPlatforms) ? body.targetPlatforms.map(String) : []
  });

  return NextResponse.json({
    ...snapshot,
    requestId: context.requestId
  });
});
