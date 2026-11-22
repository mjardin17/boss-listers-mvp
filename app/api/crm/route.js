// app/api/crm/route.js
// CRM (Customer Relationship Management) API for Sales & Marketing Factory.
// Coordinates with lib/universal-creative/crm.js for all persistence.
// Auth: resolveSession (per AGENTS.md auth gate for app/api/**/route.js)
//
// Render-only safety: no auto-contact, no auto-email, no auto-sell.
// All customer/lead data comes from user or inventory — never invented.

import { resolveSession } from "../../../lib/supabaseAuth";
import {
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
  deleteCustomer,
  getCustomerWithDetails,
  createLead,
  listLeads,
  updateLead,
  scoreLead,
  createContact,
  listContacts,
  segmentCustomers,
  getCrmStats,
} from "../../../lib/universal-creative/crm.js";
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

// Validation schemas (single source of truth — Zod)
const CreateCustomerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  status: z.enum(["lead", "prospect", "customer", "inactive"]).optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional().nullable(),
  sourceReference: z.string().optional().nullable(),
});

const UpdateCustomerSchema = CreateCustomerSchema.partial();

const CreateLeadSchema = z.object({
  customerId: z.string().min(1),
  source: z.enum(["inventory", "manual", "import", "campaign", "referral"]),
  status: z
    .enum([
      "new",
      "contacted",
      "qualified",
      "proposal",
      "negotiation",
      "closed-won",
      "closed-lost",
    ])
    .optional(),
  score: z.number().min(0).max(100).optional(),
  notes: z.string().optional().nullable(),
  expectedValue: z.number().nonnegative().optional().nullable(),
});

const UpdateLeadSchema = CreateLeadSchema.partial();

const ScoreLeadSchema = z.object({
  score: z.number().min(0).max(100),
  reason: z.string().optional(),
});

const CreateContactSchema = z.object({
  customerId: z.string().min(1),
  type: z.enum(["email", "phone", "address", "social"]),
  value: z.string().min(1),
  isPrimary: z.boolean().optional(),
  label: z.string().optional().nullable(),
});

export const runtime = "nodejs";

// ================================================================
// Customers
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
        ? getCustomerWithDetails(id)
        : getCustomer(id);
      if (!result.ok) return jsonResponse(result, 404);
      return jsonResponse(result);
    }

    // List with optional filters
    const filter = {};
    const status = url.searchParams.get("status");
    const source = url.searchParams.get("source");
    const tag = url.searchParams.get("tag");
    const search = url.searchParams.get("search");
    if (status) filter.status = status;
    if (source) filter.source = source;
    if (tag) filter.tag = tag;
    if (search) filter.search = search;

    const result = listCustomers(filter);
    return jsonResponse(result);
  } catch (err) {
    console.error("[crm GET]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function POST(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "create-customer";

    switch (action) {
      case "create-customer": {
        const body = await request.json();
        const validated = CreateCustomerSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = createCustomer(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      case "create-lead": {
        const body = await request.json();
        const validated = CreateLeadSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = createLead(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      case "create-contact": {
        const body = await request.json();
        const validated = CreateContactSchema.safeParse(body);
        if (!validated.success) {
          return jsonResponse(
            { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
            400
          );
        }
        const result = createContact(validated.data);
        return jsonResponse(result, result.ok ? 201 : 400);
      }

      default:
        return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("[crm POST]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function PATCH(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const type = url.searchParams.get("type") || "customer";

    if (!id) {
      return jsonResponse({ ok: false, error: "id required" }, 400);
    }

    const body = await request.json();

    if (type === "customer") {
      const validated = UpdateCustomerSchema.safeParse(body);
      if (!validated.success) {
        return jsonResponse(
          { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
          400
        );
      }
      const result = updateCustomer(id, validated.data);
      if (!result.ok) return jsonResponse(result, 404);
      return jsonResponse(result);
    }

    if (type === "lead") {
      const validated = UpdateLeadSchema.safeParse(body);
      if (!validated.success) {
        return jsonResponse(
          { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
          400
        );
      }
      const result = updateLead(id, validated.data);
      if (!result.ok) return jsonResponse(result, 404);
      return jsonResponse(result);
    }

    return jsonResponse({ ok: false, error: `Unknown type: ${type}` }, 400);
  } catch (err) {
    console.error("[crm PATCH]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function DELETE(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const type = url.searchParams.get("type") || "customer";

    if (!id) {
      return jsonResponse({ ok: false, error: "id required" }, 400);
    }

    // Destructive operation — requires explicit authorization (tenantId serves as the actor)
    if (type === "customer") {
      const result = deleteCustomer(id, tenantId);
      if (!result.ok) return jsonResponse(result, 400);
      return jsonResponse(result);
    }

    return jsonResponse({ ok: false, error: `Unknown type: ${type}` }, 400);
  } catch (err) {
    console.error("[crm DELETE]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

// ================================================================
// Lead scoring
// ================================================================

export async function PUT(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const action = url.searchParams.get("action");

    if (!id || action !== "score-lead") {
      return jsonResponse({ ok: false, error: "id and action=score-lead required" }, 400);
    }

    const body = await request.json();
    const validated = ScoreLeadSchema.safeParse(body);
    if (!validated.success) {
      return jsonResponse(
        { ok: false, error: validated.error.issues.map((e) => e.message).join(", ") },
        400
      );
    }

    const result = scoreLead(id, validated.data.score, validated.data.reason);
    if (!result.ok) return jsonResponse(result, 404);
    return jsonResponse(result);
  } catch (err) {
    console.error("[crm PUT]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

// ================================================================
// Stats / segmentation
// ================================================================

export async function HEAD(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return new Response(null, { status: 401 });

    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "stats") {
      const result = getCrmStats();
      return jsonResponse(result);
    }

    if (action === "segments") {
      const result = segmentCustomers();
      return jsonResponse(result);
    }

    return new Response(null, { status: 400 });
  } catch (err) {
    console.error("[crm HEAD]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
