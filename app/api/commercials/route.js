// app/api/commercials/route.js
// Trigger and track commercial generation — ported to the App Router
// 2026-08-24 after the hot-wheels merge deleted functions/api/commercials.js
// with no replacement. Logic and the tenant-scoping security fix preserved
// unchanged (see history: this route was previously unscoped — any signed-up
// tenant could read/create another tenant's commercial_jobs by guessing a
// jobId — fixed by requiring tenant_id on every query).
//
// The old Cloudflare Pages Function got `data.tenantId` for free from
// _middleware.js's shared request context. The App Router has no equivalent
// automatic injection, so this route resolves the tenant itself from the
// caller's own Bearer token via resolveSession — same pattern as
// app/api/billing/route.js, and the tenant is never taken from anything the
// client sends directly.
//
// NOT yet re-verified end-to-end (no VIDEO_PIPELINE_WEBHOOK_URL confirmed
// live as of this port) — the receiving side exists in video-bot-pipeline
// (empire_server, added 2026-08-18) but the two have not been tested
// together since this port. Verify before relying on it.

import { rest } from "../../../lib/supabaseRest";
import { resolveSession } from "../../../lib/supabaseAuth";

export const runtime = "nodejs";

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

export async function GET(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId");
    if (!jobId) {
      return jsonResponse({ ok: false, error: "jobId required" }, 400);
    }

    const rows = await rest(
      process.env,
      "GET",
      `commercial_jobs?id=eq.${encodeURIComponent(jobId)}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
    );
    if (!rows.length) {
      return jsonResponse({ ok: false, error: "Not found" }, 404);
    }

    return jsonResponse({ ok: true, job: rows[0] });
  } catch (err) {
    console.error("[commercials GET]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

export async function POST(request) {
  try {
    const tenantId = await requireTenant(request);
    if (!tenantId) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

    const body = await request.json();
    const { listingId, images, productName, description, price, sessionId } = body;

    if (!listingId || !images || images.length === 0) {
      return jsonResponse({ ok: false, error: "Missing required fields" }, 400);
    }

    // Verify the listing being turned into a commercial actually belongs
    // to the caller's tenant before creating anything or spending on the
    // video pipeline webhook with someone else's data.
    const owned = await rest(
      process.env,
      "GET",
      `listings?id=eq.${encodeURIComponent(listingId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=id`,
    );
    if (!owned.length) {
      return jsonResponse({ ok: false, error: "Listing not found" }, 404);
    }

    const jobId = `commercial_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    await rest(process.env, "POST", "commercial_jobs", {
      id: jobId,
      tenant_id: tenantId,
      listing_id: listingId,
      product_name: productName,
      images,
      description,
      price,
      status: "pending",
      created_at: new Date().toISOString(),
      session_id: sessionId,
    });

    if (process.env.VIDEO_PIPELINE_WEBHOOK_URL) {
      queueVideoGeneration(jobId, { listingId, images, productName, description, price }).catch((err) => {
        console.error("[commercials] Webhook queue failed:", err.message);
      });
    }

    return jsonResponse({ ok: true, jobId, status: "queued" }, 201);
  } catch (err) {
    console.error("[commercials POST]", err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}

async function queueVideoGeneration(jobId, data) {
  const payload = { type: "generate_commercial", job_id: jobId, ...data };

  await fetch(process.env.VIDEO_PIPELINE_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": process.env.VIDEO_PIPELINE_WEBHOOK_SECRET || "",
    },
    body: JSON.stringify(payload),
  });
}
