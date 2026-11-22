// app/api/campaigns/route.js
// Campaign Manager API for Sales & Marketing Factory.
// Coordinates with lib/universal-creative/campaign-manager.js for all persistence.
// Auth: resolveSession (per AGENTS.md auth gate for app/api/**/route.js)
//
// Render-only safety: no auto-post, no auto-list, no auto-spend.
// Never invents prices, discounts, or claims.

import { resolveSession } from "../../../lib/supabaseAuth";
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
  deleteCampaign,
  getCampaignWithDetails,
  createCampaignAudience,
  listCampaignAudiences,
  buildAudienceFromCRM,
  linkCampaignCreative,
  listCampaignCreatives,
  recordCampaignPerformance,
  listCampaignPerformance,
  getCampaignStats,
} from "../../../lib/universal-creative/campaign-manager.js";
import { z } from "zod";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function requireTenant(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const session = token ? await resolveSession(process.env, token) : null;
  return session?.tenantId || null;
}

const CreateCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  type: z.enum([
    "brand-awareness",
    "direct-response",
    "product-launch",
    "retargeting",
    "seasonal",
    "lead-gen",
  ]),
  status: z.enum(["draft", "active", "paused", "completed", "cancelled"]).optional(),
  budget: z.number().nonnegative().optional().nullable(),
  currency: z.string().optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  targetAudience: z.string().optional().nullable(),
  channels: z.array(z.string()).optional(),
  creativeIds: z.array(z.string()).optional(),
  customerSegmentIds: z.array(z.string()).optional(),
  createdBy: z.string().optional().nullable(),
});

const UpdateCampaignSchema = CreateCampaignSchema.partial();

const CreateAudienceSchema = z.object({
  campaignId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  customerIds: z.array(z.string()).optional(),
  criteria: z.record(z.string(), z.unknown()).optional(),
});

const LinkCreativeSchema = z.object({
  campaignId: z.string().min(1),
  creativeType: z.enum(["commercial", "video", "image", "audio"]),
  creativeId: z.string().min(1),
  creativeName: z.string().min(1),
  role: z.enum(["hero", "supporting", "cta", "branding"]).optional(),
  platform: z.string().optional().nullable(),
});

const RecordPerformanceSchema = z.object({
  campaignId: z.string().min(1),
  date: z.string().datetime().optional(),
  channel: z.string().min(1),
  impressions: z.number().nonnegative().optional(),
  clicks: z.number().nonnegative().optional(),
  conversions: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  revenue: z.number().nonnegative().optional(),
});

export const runtime = "nodejs";

// ================================================================
// Campaigns
// ================================================================

export async function GET(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const withDetails = url.searchParams.get("withDetails") === "true";

    if (id) {
      const result = withDetails
        ? getCampaignWithDetails(id)
        : getCampaign(id);
      if (!result.ok) return jsonResponse(result, 404);
      return jsonResponse(result);
    }

    const filter = {};
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");
    const channel = url.searchParams.get("channel");
    const search = url.searchParams.get("search");
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (channel) filter.channel = channel;
    if (search) filter.search = search;

    const result = listCampaigns(filter);
    return jsonResponse(result);
  } catch (err) {
    console.error("[campaigns GET]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function POST(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "create-campaign";

    switch (action) {
      case "create-campaign": {
        const body = await request.json();
        const validated = CreateCampaignSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = createCampaign({ ...validated.data, createdBy: tenantId });
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      case "create-audience": {
        const body = await request.json();
        const validated = CreateAudienceSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = createCampaignAudience(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      case "build-audience-from-crm": {
        const body = await request.json();
        const { campaignId, segmentName, filter } = body;
        if (!campaignId || !segmentName) {
          return jsonResponse({ ok: false, error: "campaignId and segmentName required" }, 400);
        }
        const result = buildAudienceFromCRM(campaignId, segmentName, filter || {});
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      case "link-creative": {
        const body = await request.json();
        const validated = LinkCreativeSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = linkCampaignCreative(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      case "record-performance": {
        const body = await request.json();
        const validated = RecordPerformanceSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = recordCampaignPerformance(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      default:
        return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[campaigns POST]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function PATCH(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return jsonResponse({ ok: false, error: "id required" }, 400);
    }

    const body = await request.json();
    const validated = UpdateCampaignSchema.safeParse(body);
    if (!validated.success) {
      return jsonResponse(
        { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
        400
      );
    }

    const result = updateCampaign(id, validated.data);
    if (!result.ok) return jsonResponse(result, 404);
    return jsonResponse(result);
  } catch (err) {
    console.error("[campaigns PATCH]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function DELETE(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return jsonResponse({ ok: false, error: "id required" }, 400);
    }

    // Destructive operation — requires explicit authorization
    const result = deleteCampaign(id, tenantId);
    if (!result.ok) return jsonResponse(result, 400);
    return jsonResponse(result);
  } catch (err) {
    console.error("[campaigns DELETE]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

// ================================================================
// Sub-resources
// ================================================================

export async function PUT(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const sub = url.searchParams.get("sub");

    if (sub === "audiences" && id) {
      const result = listCampaignAudiences({ campaignId: id });
      return jsonResponse(result);
    }

    if (sub === "creatives" && id) {
      const result = listCampaignCreatives({ campaignId: id });
      return jsonResponse(result);
    }

    if (sub === "performance" && id) {
      const result = listCampaignPerformance({ campaignId: id });
      return jsonResponse(result);
    }

    return jsonResponse({ ok: false, error: "Invalid sub-resource" }, 400);
  } catch (err) {
    console.error("[campaigns PUT]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function HEAD(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return new Response(null, { status: 401 });

    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "stats") {
      const result = getCampaignStats();
      return jsonResponse(result);
    }

    return new Response(null, { status: 400 });
  } catch (err) {
    console.error("[campaigns HEAD]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
