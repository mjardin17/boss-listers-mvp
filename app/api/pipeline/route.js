// app/api/pipeline/route.js
// Sales Pipeline API for Sales & Marketing Factory.
// Coordinates with lib/universal-creative/sales-pipeline.js for all persistence.
// Auth: resolveSession (per AGENTS.md auth gate for app/api/**/route.js)
//
// Render-only safety: no auto-contact, no auto-sell.
// Never invents prices, discounts, or claims.

import { resolveSession } from "../../../lib/supabaseAuth";
import {
  createPipeline,
  getPipeline,
  listPipelines,
  updatePipeline,
  deletePipeline,
  getPipelineWithDetails,
  createStage,
  listStages,
  updateStage,
  deleteStage,
  createDeal,
  getDeal,
  listDeals,
  updateDeal,
  deleteDeal,
  moveDeal,
  linkDealContact,
  listDealContacts,
  getPipelineStats,
} from "../../../lib/universal-creative/sales-pipeline.js";
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

const CreatePipelineSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
  createdBy: z.string().optional().nullable(),
});

const UpdatePipelineSchema = CreatePipelineSchema.partial();

const CreateStageSchema = z.object({
  pipelineId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  order: z.number().int().nonnegative().optional(),
  isClosedWon: z.boolean().optional(),
  isClosedLost: z.boolean().optional(),
});

const UpdateStageSchema = CreateStageSchema.partial();

const CreateDealSchema = z.object({
  pipelineId: z.string().min(1),
  stageId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  value: z.number().optional().nullable(),
  currency: z.string().optional(),
  expectedCloseDate: z.string().datetime().optional().nullable(),
  probability: z.number().min(0).max(100).optional(),
  ownerId: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
});

const UpdateDealSchema = CreateDealSchema.partial();

const MoveDealSchema = z.object({
  dealId: z.string().min(1),
  fromStageId: z.string().optional().nullable(),
  toStageId: z.string().min(1),
  reason: z.string().optional().nullable(),
});

const LinkContactSchema = z.object({
  dealId: z.string().min(1),
  contactId: z.string().min(1),
  role: z.string().optional().nullable(),
});

export const runtime = "nodejs";

// ================================================================
// Pipelines
// ================================================================

export async function GET(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const withDetails = url.searchParams.get("withDetails") === "true";

    if (id) {
      const result = withDetails ? getPipelineWithDetails(id) : getPipeline(id);
      if (!result.ok) return jsonResponse(result, 404);
      return jsonResponse(result);
    }

    const result = listPipelines();
    return jsonResponse(result);
  } catch (err) {
    console.error("[pipeline GET]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function POST(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "create-pipeline";

    switch (action) {
      case "create-pipeline": {
        const body = await request.json();
        const validated = CreatePipelineSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = createPipeline({ ...validated.data, createdBy: tenantId });
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      case "create-stage": {
        const body = await request.json();
        const validated = CreateStageSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = createStage(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      case "create-deal": {
        const body = await request.json();
        const validated = CreateDealSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = createDeal(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      case "link-contact": {
        const body = await request.json();
        const validated = LinkContactSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = linkDealContact(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      default:
        return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[pipeline POST]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function PATCH(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const type = url.searchParams.get("type") || "pipeline";

    if (!id) {
      return jsonResponse({ ok: false, error: "id required" }, 400);
    }

    const body = await request.json();

    if (type === "stage") {
      const validated = UpdateStageSchema.safeParse(body);
      if (!validated.success) {
        return jsonResponse(
          { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
          400
        );
      }
      const result = updateStage(id, validated.data);
      if (!result.ok) return jsonResponse(result, 404);
      return jsonResponse(result);
    }

    if (type === "deal") {
      const validated = UpdateDealSchema.safeParse(body);
      if (!validated.success) {
        return jsonResponse(
          { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
          400
        );
      }
      const result = updateDeal(id, validated.data);
      if (!result.ok) return jsonResponse(result, 404);
      return jsonResponse(result);
    }

    const validated = UpdatePipelineSchema.safeParse(body);
    if (!validated.success) {
      return jsonResponse(
        { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
        400
      );
    }

    const result = updatePipeline(id, validated.data);
    if (!result.ok) return jsonResponse(result, 404);
    return jsonResponse(result);
  } catch (err) {
    console.error("[pipeline PATCH]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function DELETE(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const type = url.searchParams.get("type") || "pipeline";

    if (!id) {
      return jsonResponse({ ok: false, error: "id required" }, 400);
    }

    // Destructive operation — requires explicit authorization
    if (type === "stage") {
      const result = deleteStage(id, tenantId);
      if (!result.ok) return jsonResponse(result, 400);
      return jsonResponse(result);
    }

    if (type === "deal") {
      const result = deleteDeal(id, tenantId);
      if (!result.ok) return jsonResponse(result, 400);
      return jsonResponse(result);
    }

    const result = deletePipeline(id, tenantId);
    if (!result.ok) return jsonResponse(result, 400);
    return jsonResponse(result);
  } catch (err) {
    console.error("[pipeline DELETE]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

// ================================================================
// Move deal
// ================================================================

export async function PUT(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "move-deal") {
      const body = await request.json();
      const validated = MoveDealSchema.safeParse(body);
      if (!validated.success) {
        return jsonResponse(
          { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
          400
        );
      }
      const result = moveDeal(
        validated.data.dealId,
        validated.data.toStageId,
        validated.data.fromStageId || undefined,
        validated.data.reason
      );
      if (!result.ok) return jsonResponse(result, 400);
      return jsonResponse(result);
    }

    if (action === "stages") {
      const pipelineId = url.searchParams.get("pipelineId");
      if (!pipelineId) return jsonResponse({ ok: false, error: "pipelineId required" }, 400);
      const result = listStages({ pipelineId });
      return jsonResponse(result);
    }

    if (action === "deal-contacts" && url.searchParams.get("dealId")) {
      const result = listDealContacts({ dealId: url.searchParams.get("dealId") });
      return jsonResponse(result);
    }

    return jsonResponse({ ok: false, error: "Invalid action" }, 400);
  } catch (err) {
    console.error("[pipeline PUT]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

// ================================================================
// Stats
// ================================================================

export async function HEAD(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return new Response(null, { status: 401 });

    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "stats") {
      const result = getPipelineStats();
      return jsonResponse(result);
    }

    return new Response(null, { status: 400 });
  } catch (err) {
    console.error("[pipeline HEAD]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
