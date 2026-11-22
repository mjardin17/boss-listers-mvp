// app/api/analytics/route.js
// Analytics API for Sales & Marketing Factory.
// Coordinates with lib/universal-creative/analytics.js for all persistence.
// Auth: resolveSession (per AGENTS.md auth gate for app/api/**/route.js)
//
// Render-only safety: read-only reporting. Never invents metrics.
// Reflects only user-entered or system-observed data.

import { resolveSession } from "../../../lib/supabaseAuth";
import {
  recordEvent,
  listEvents,
  getEvent,
  createMetric,
  listMetrics,
  getMetric,
  createReport,
  listReports,
  getReport,
  getDashboardSummary,
  getFunnelMetrics,
  getRetentionMetrics,
  getAttributionMetrics,
  getAnalyticsOverview,
} from "../../../lib/universal-creative/analytics.js";
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

const RecordEventSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  entityType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable(),
  properties: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().datetime().optional().nullable(),
  userId: z.string().optional().nullable(),
  sessionId: z.string().optional().nullable(),
});

const CreateMetricSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["counter", "gauge", "histogram", "summary"]),
  description: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  tags: z.record(z.string(), z.string()).optional(),
});

const CreateReportSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
  generatedBy: z.string().optional().nullable(),
});

export const runtime = "nodejs";

// ================================================================
// Events
// ================================================================

export async function GET(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const result = getEvent(id);
      if (!result.ok) return jsonResponse(result, 404);
      return jsonResponse(result);
    }

    const filter = {};
    const name = url.searchParams.get("name");
    const type = url.searchParams.get("type");
    const entityType = url.searchParams.get("entityType");
    const entityId = url.searchParams.get("entityId");
    if (name) filter.name = name;
    if (type) filter.type = type;
    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = entityId;

    const result = listEvents(filter);
    return jsonResponse(result);
  } catch (err) {
    console.error("[analytics GET]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function POST(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "record-event";

    switch (action) {
      case "record-event": {
        const body = await request.json();
        const validated = RecordEventSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = recordEvent(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      case "create-metric": {
        const body = await request.json();
        const validated = CreateMetricSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = createMetric(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      case "create-report": {
        const body = await request.json();
        const validated = CreateReportSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = createReport({ ...validated.data, generatedBy: tenantId });
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      default:
        return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[analytics POST]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function PATCH(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const type = url.searchParams.get("type") || "metric";

    if (!id) {
      return jsonResponse({ ok: false, error: "id required" }, 400);
    }

    const body = await request.json();

    if (type === "report") {
      const result = listReports(); // reports are immutable after creation in this layer
      return jsonResponse({ ok: true, reports: result.reports || [] });
    }

    const validated = CreateMetricSchema.partial().safeParse(body);
    if (!validated.success) {
      return jsonResponse(
        { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
        400
      );
    }

    // Metrics are not updated directly; return not-implemented for now
    return jsonResponse({ ok: false, error: "Metric updates not supported" }, 405);
  } catch (err) {
    console.error("[analytics PATCH]", err.message);
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

    // Analytics events/metrics are append-only for audit integrity
    return jsonResponse({ ok: false, error: "Analytics records are append-only" }, 405);
  } catch (err) {
    console.error("[analytics DELETE]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

// ================================================================
// Sub-resources / read-only views
// ================================================================

export async function PUT(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const sub = url.searchParams.get("sub");

    if (sub === "metrics") {
      const name = url.searchParams.get("name");
      const result = listMetrics({ name });
      return jsonResponse(result);
    }

    if (sub === "metric" && url.searchParams.get("id")) {
      const result = getMetric(url.searchParams.get("id"));
      if (!result.ok) return jsonResponse(result, 404);
      return jsonResponse(result);
    }

    if (sub === "reports") {
      const result = listReports();
      return jsonResponse(result);
    }

    if (sub === "report" && url.searchParams.get("id")) {
      const result = getReport(url.searchParams.get("id"));
      if (!result.ok) return jsonResponse(result, 404);
      return jsonResponse(result);
    }

    if (sub === "funnel") {
      const result = getFunnelMetrics();
      return jsonResponse(result);
    }

    if (sub === "retention") {
      const result = getRetentionMetrics();
      return jsonResponse(result);
    }

    if (sub === "attribution") {
      const result = getAttributionMetrics();
      return jsonResponse(result);
    }

    return jsonResponse({ ok: false, error: "Invalid sub-resource" }, 400);
  } catch (err) {
    console.error("[analytics PUT]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

// ================================================================
// Overview / summary
// ================================================================

export async function HEAD(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return new Response(null, { status: 401 });

    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "overview") {
      const result = getAnalyticsOverview();
      return jsonResponse(result);
    }

    if (action === "dashboard") {
      const result = getDashboardSummary();
      return jsonResponse(result);
    }

    return new Response(null, { status: 400 });
  } catch (err) {
    console.error("[analytics HEAD]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
