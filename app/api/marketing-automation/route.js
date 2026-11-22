// app/api/marketing-automation/route.js
// Marketing Automation API for Sales & Marketing Factory.
// Coordinates with lib/universal-creative/marketing-automation.js for all persistence.
// Auth: resolveSession (per AGENTS.md auth gate for app/api/**/route.js)
//
// Render-only safety: no auto-send, no auto-post, no auto-spend.
// Automation is rendered for user review/approval before any execution.

import { resolveSession } from "../../../lib/supabaseAuth";
import {
  createAutomation,
  getAutomation,
  listAutomations,
  updateAutomation,
  deleteAutomation,
  getAutomationWithDetails,
  createTrigger,
  listTriggers,
  createAction,
  listActions,
  createWorkflow,
  listWorkflows,
  getWorkflow,
  enrollContact,
  listEnrollments,
  getAutomationStats,
} from "../../../lib/universal-creative/marketing-automation.js";
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

const CreateAutomationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  type: z.enum(["email", "sms", "social", "task", "mixed"]),
  status: z.enum(["draft", "active", "paused", "completed", "cancelled"]).optional(),
  triggerType: z.string().optional(),
  targetAudience: z.string().optional().nullable(),
  createdBy: z.string().optional().nullable(),
});

const UpdateAutomationSchema = CreateAutomationSchema.partial();

const CreateTriggerSchema = z.object({
  automationId: z.string().min(1),
  type: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
});

const CreateActionSchema = z.object({
  automationId: z.string().min(1),
  type: z.string().min(1),
  order: z.number().int().nonnegative().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const CreateWorkflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  automationIds: z.array(z.string()).optional(),
});

const EnrollContactSchema = z.object({
  automationId: z.string().min(1),
  contactId: z.string().min(1),
  note: z.string().optional().nullable(),
});

export const runtime = "nodejs";

// ================================================================
// Automations
// ================================================================

export async function GET(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const withDetails = url.searchParams.get("withDetails") === "true";

    if (id) {
      const result = withDetails ? getAutomationWithDetails(id) : getAutomation(id);
      if (!result.ok) return jsonResponse(result, 404);
      return jsonResponse(result);
    }

    const filter = {};
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");
    if (status) filter.status = status;
    if (type) filter.type = type;

    const result = listAutomations(filter);
    return jsonResponse(result);
  } catch (err) {
    console.error("[marketing-automation GET]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function POST(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "create-automation";

    switch (action) {
      case "create-automation": {
        const body = await request.json();
        const validated = CreateAutomationSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = createAutomation({ ...validated.data, createdBy: tenantId });
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      case "create-trigger": {
        const body = await request.json();
        const validated = CreateTriggerSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = createTrigger(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      case "create-action": {
        const body = await request.json();
        const validated = CreateActionSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = createAction(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      case "create-workflow": {
        const body = await request.json();
        const validated = CreateWorkflowSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = createWorkflow(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      case "enroll-contact": {
        const body = await request.json();
        const validated = EnrollContactSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = enrollContact(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      default:
        return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[marketing-automation POST]", err.message);
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
    const validated = UpdateAutomationSchema.safeParse(body);
    if (!validated.success) {
      return jsonResponse(
        { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
        400
      );
    }

    const result = updateAutomation(id, validated.data);
    if (!result.ok) return jsonResponse(result, 404);
    return jsonResponse(result);
  } catch (err) {
    console.error("[marketing-automation PATCH]", err.message);
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
    const result = deleteAutomation(id, tenantId);
    if (!result.ok) return jsonResponse(result, 400);
    return jsonResponse(result);
  } catch (err) {
    console.error("[marketing-automation DELETE]", err.message);
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

    if (sub === "triggers" && id) {
      const result = listTriggers({ automationId: id });
      return jsonResponse(result);
    }

    if (sub === "actions" && id) {
      const result = listActions({ automationId: id });
      return jsonResponse(result);
    }

    if (sub === "workflows") {
      const result = listWorkflows();
      return jsonResponse(result);
    }

    if (sub === "workflow" && url.searchParams.get("id")) {
      const result = getWorkflow(url.searchParams.get("id"));
      if (!result.ok) return jsonResponse(result, 404);
      return jsonResponse(result);
    }

    if (sub === "enrollments") {
      const automationId = url.searchParams.get("automationId");
      const contactId = url.searchParams.get("contactId");
      const result = listEnrollments({ automationId, contactId });
      return jsonResponse(result);
    }

    return jsonResponse({ ok: false, error: "Invalid sub-resource" }, 400);
  } catch (err) {
    console.error("[marketing-automation PUT]", err.message);
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
      const result = getAutomationStats();
      return jsonResponse(result);
    }

    return new Response(null, { status: 400 });
  } catch (err) {
    console.error("[marketing-automation HEAD]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
