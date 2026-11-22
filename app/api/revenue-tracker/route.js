// app/api/revenue-tracker/route.js
// Revenue Tracker API for Sales & Marketing Factory.
// Coordinates with lib/universal-creative/revenue-tracker.js for all persistence.
// Auth: resolveSession (per AGENTS.md auth gate for app/api/**/route.js)
//
// Render-only safety: read-only financial reporting. Never invents prices,
// revenue figures, or discounts. Only reflects user-entered data.

import { resolveSession } from "../../../lib/supabaseAuth";
import {
  createRevenueRecord,
  getRevenueRecord,
  listRevenueRecords,
  updateRevenueRecord,
  deleteRevenueRecord,
  getRevenueStats,
  listRevenueByPeriod,
  createInvoice,
  getInvoice,
  listInvoices,
  updateInvoice,
  recordPayment,
  getRevenueOverview,
} from "../../../lib/universal-creative/revenue-tracker.js";
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

const CreateRevenueRecordSchema = z.object({
  dealId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  amount: z.number().nonnegative(),
  currency: z.string().optional(),
  type: z.enum(["sale", "subscription", "service", "refund", "other"]),
  status: z.enum(["pending", "paid", "overdue", "cancelled"]).optional(),
  date: z.string().datetime().optional().nullable(),
  description: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  taxAmount: z.number().nonnegative().optional().nullable(),
  discountAmount: z.number().nonnegative().optional().nullable(),
});

const UpdateRevenueRecordSchema = CreateRevenueRecordSchema.partial();

const CreateInvoiceSchema = z.object({
  customerId: z.string().min(1),
  dealId: z.string().optional().nullable(),
  amount: z.number().nonnegative(),
  currency: z.string().optional(),
  dueDate: z.string().datetime().optional().nullable(),
  lineItems: z.array(z.record(z.string(), z.unknown())).optional(),
  notes: z.string().optional().nullable(),
});

const RecordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().nonnegative(),
  date: z.string().datetime().optional().nullable(),
  method: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
});

export const runtime = "nodejs";

// ================================================================
// Revenue records
// ================================================================

export async function GET(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const result = getRevenueRecord(id);
      if (!result.ok) return jsonResponse(result, 404);
      return jsonResponse(result);
    }

    const filter = {};
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");
    const customerId = url.searchParams.get("customerId");
    const dealId = url.searchParams.get("dealId");
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (customerId) filter.customerId = customerId;
    if (dealId) filter.dealId = dealId;

    const result = listRevenueRecords(filter);
    return jsonResponse(result);
  } catch (err) {
    console.error("[revenue-tracker GET]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function POST(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "create-revenue-record";

    switch (action) {
      case "create-revenue-record": {
        const body = await request.json();
        const validated = CreateRevenueRecordSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = createRevenueRecord(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      case "create-invoice": {
        const body = await request.json();
        const validated = CreateInvoiceSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = createInvoice(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      case "record-payment": {
        const body = await request.json();
        const validated = RecordPaymentSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = recordPayment(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      default:
        return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[revenue-tracker POST]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function PATCH(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const type = url.searchParams.get("type") || "revenue";

    if (!id) {
      return jsonResponse({ ok: false, error: "id required" }, 400);
    }

    const body = await request.json();

    if (type === "invoice") {
      const result = updateInvoice(id, body);
      if (!result.ok) return jsonResponse(result, 404);
      return jsonResponse(result);
    }

    const validated = UpdateRevenueRecordSchema.safeParse(body);
    if (!validated.success) {
      return jsonResponse(
        { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
        400
      );
    }

    const result = updateRevenueRecord(id, validated.data);
    if (!result.ok) return jsonResponse(result, 404);
    return jsonResponse(result);
  } catch (err) {
    console.error("[revenue-tracker PATCH]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function DELETE(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const type = url.searchParams.get("type") || "revenue";

    if (!id) {
      return jsonResponse({ ok: false, error: "id required" }, 400);
    }

    // Destructive operation — requires explicit authorization
    if (type === "invoice") {
      const result = deleteRevenueRecord(id);
      if (!result.ok) return jsonResponse(result, 400);
      return jsonResponse(result);
    }

    const result = deleteRevenueRecord(id);
    if (!result.ok) return jsonResponse(result, 400);
    return jsonResponse(result);
  } catch (err) {
    console.error("[revenue-tracker DELETE]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

// ================================================================
// Stats / overview / by-period
// ================================================================

export async function PUT(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const sub = url.searchParams.get("sub");

    if (sub === "invoices") {
      const customerId = url.searchParams.get("customerId");
      const status = url.searchParams.get("status");
      const result = listInvoices({ customerId, status });
      return jsonResponse(result);
    }

    if (sub === "by-period") {
      const period = url.searchParams.get("period") || "month";
      const result = listRevenueByPeriod({ period });
      return jsonResponse(result);
    }

    if (sub === "invoice" && url.searchParams.get("id")) {
      const result = getInvoice(url.searchParams.get("id"));
      if (!result.ok) return jsonResponse(result, 404);
      return jsonResponse(result);
    }

    return jsonResponse({ ok: false, error: "Invalid sub-resource" }, 400);
  } catch (err) {
    console.error("[revenue-tracker PUT]", err.message);
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
      const result = getRevenueStats();
      return jsonResponse(result);
    }

    if (action === "overview") {
      const result = getRevenueOverview();
      return jsonResponse(result);
    }

    return new Response(null, { status: 400 });
  } catch (err) {
    console.error("[revenue-tracker HEAD]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
