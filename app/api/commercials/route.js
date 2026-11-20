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

import { createHmac, randomUUID } from "node:crypto";
import { rest } from "../../../lib/supabaseRest.js";
import { resolveSession } from "../../../lib/supabaseAuth.js";

export const runtime = "nodejs";
const MAX_COMMERCIAL_REQUEST_BYTES = 256 * 1024;
const COMMERCIAL_RATE_WINDOW_MS = 10 * 60 * 1000;
const COMMERCIAL_RATE_MAX = 5;
const commercialRateBuckets = new Map();
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

function enforceCommercialRateLimit(tenantId) {
  const now = Date.now();
  if (commercialRateBuckets.size > 1000) {
    for (const [key, bucket] of commercialRateBuckets.entries()) {
      if (bucket.resetAt <= now) commercialRateBuckets.delete(key);
    }
  }
  const bucket = commercialRateBuckets.get(tenantId);
  if (!bucket || bucket.resetAt <= now) {
    commercialRateBuckets.set(tenantId, { count: 1, resetAt: now + COMMERCIAL_RATE_WINDOW_MS });
    return;
  }
  bucket.count += 1;
  if (bucket.count > COMMERCIAL_RATE_MAX) {
    throw Object.assign(new Error("Commercial generation limit reached. Try again later."), { status: 429 });
  }
}

async function readBoundedJson(request) {
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error("Request body is required."), { status: 400 });
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_COMMERCIAL_REQUEST_BYTES) {
      await reader.cancel().catch(() => {});
      throw Object.assign(new Error("Commercial request body exceeds 256 KB."), { status: 413 });
    }
    chunks.push(Buffer.from(value));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

function validateCommercialInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw Object.assign(new Error("Request body must be a JSON object."), { status: 400 });
  }
  const { listingId, images, productName, description = "", price, sessionId } = body;
  if (typeof listingId !== "string" || !UUID_RE.test(listingId)) {
    throw Object.assign(new Error("listingId must be a valid UUID."), { status: 400 });
  }
  if (!Array.isArray(images) || images.length < 1 || images.length > 6 ||
      images.some((url) => typeof url !== "string" || url.length > 2048 || !/^https:\/\//i.test(url))) {
    throw Object.assign(new Error("Provide 1–6 HTTPS image URLs, each no longer than 2048 characters."), { status: 400 });
  }
  if (typeof productName !== "string" || !productName.trim() || productName.length > 200) {
    throw Object.assign(new Error("productName must be a non-empty string of at most 200 characters."), { status: 400 });
  }
  if (typeof description !== "string" || description.length > 2000) {
    throw Object.assign(new Error("description must be a string of at most 2000 characters."), { status: 400 });
  }
  const rawPrice = String(price ?? "").trim();
  const numericPriceText = rawPrice.replace(/[,$\s]/g, "");
  if (!rawPrice || rawPrice.length > 50 || !/^\d+(?:\.\d{1,2})?$/.test(numericPriceText)) {
    throw Object.assign(new Error("price must be a non-negative amount with at most two decimal places."), { status: 400 });
  }
  const numericPrice = Number(numericPriceText);
  if (!Number.isFinite(numericPrice) || numericPrice > 1_000_000_000) {
    throw Object.assign(new Error("price is outside the supported range."), { status: 400 });
  }
  if (sessionId !== undefined && (typeof sessionId !== "string" || sessionId.length > 128)) {
    throw Object.assign(new Error("sessionId must be a string of at most 128 characters."), { status: 400 });
  }
  return {
    listingId,
    images,
    productName: productName.trim(),
    description: description.trim(),
    price: numericPrice,
    displayPrice: "$" + numericPrice.toFixed(2),
    sessionId: sessionId || null,
  };
}


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
      `/commercial_jobs?id=eq.${encodeURIComponent(jobId)}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
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

    enforceCommercialRateLimit(tenantId);
    const body = await readBoundedJson(request);
    const { listingId, images, productName, description, price, displayPrice, sessionId } = validateCommercialInput(body);

    // Verify the listing being turned into a commercial actually belongs
    // to the caller's tenant before creating anything or spending on the
    // video pipeline webhook with someone else's data.
    const owned = await rest(
      process.env,
      "GET",
      `/listings?id=eq.${encodeURIComponent(listingId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=id`,
    );
    if (!owned.length) {
      return jsonResponse({ ok: false, error: "Listing not found" }, 404);
    }

    const jobId = `commercial_${randomUUID()}`;

    await rest(process.env, "POST", "/commercial_jobs", {
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

    try {
      await queueVideoGeneration(jobId, { tenantId, listingId, images, productName, description, price: displayPrice });
      await rest(
        process.env,
        "PATCH",
        `/commercial_jobs?id=eq.${encodeURIComponent(jobId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&status=eq.pending`,
        { status: "queued" },
        { Prefer: "return=minimal" },
      );
    } catch (deliveryError) {
      console.error("[commercials] Webhook delivery failed:", deliveryError.message);
      try {
        await rest(
          process.env,
          "PATCH",
          `/commercial_jobs?id=eq.${encodeURIComponent(jobId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&status=eq.pending`,
          { status: "failed" },
          { Prefer: "return=minimal" },
        );
      } catch (statusError) {
        console.error("[commercials] Could not persist failed delivery status:", statusError.message);
      }
      return jsonResponse({ ok: false, error: "Video pipeline did not accept the job. No queued status was recorded.", jobId }, 502);
    }

    return jsonResponse({ ok: true, jobId, status: "queued" }, 201);
  } catch (err) {
    const status = Number(err.status) || 500;
    console.error("[commercials POST]", err instanceof Error ? err.message : "Unknown failure");
    return jsonResponse(
      { ok: false, error: status >= 500 ? "Commercial request failed" : err.message },
      status,
    );
  }
}

async function queueVideoGeneration(jobId, data) {
  const webhookUrl = process.env.VIDEO_PIPELINE_WEBHOOK_URL;
  const webhookSecret = process.env.VIDEO_PIPELINE_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret || webhookSecret.length < 32) {
    throw new Error("Video pipeline webhook is not configured with a strong secret");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    throw new Error("Video pipeline webhook URL is invalid");
  }
  const isLocalDevelopment =
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname);
  if (parsedUrl.protocol !== "https:" && !(isLocalDevelopment && parsedUrl.protocol === "http:")) {
    throw new Error("Video pipeline webhook must use HTTPS outside local development");
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("Video pipeline webhook URL must not contain embedded credentials");
  }

  const payload = {
    type: "generate_commercial",
    job_id: jobId,
    tenant_id: data.tenantId,
    listing_id: data.listingId,
    product_name: data.productName,
    images: data.images,
    description: data.description,
    price: data.price,
  };
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Timestamp": timestamp,
      "X-Webhook-Signature": signature,
    },
    body,
    signal: AbortSignal.timeout(15000),
  });

  const acknowledgement = await response.json().catch(() => null);
  const accepted =
    acknowledgement &&
    acknowledgement.ok === true &&
    acknowledgement.job_id === jobId &&
    ["queued", "already_queued"].includes(acknowledgement.status);
  if (!response.ok || !accepted) {
    throw new Error(`Video pipeline did not confirm job acceptance (HTTP ${response.status})`);
  }
}
