import { createHmac, timingSafeEqual } from "node:crypto";
import { rest } from "../../../../lib/supabaseRest.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
const JOB_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readBoundedBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      throw Object.assign(new Error("Callback body exceeds 16 KB."), { status: 413 });
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function safeEqualHex(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || !/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request) {
  const secret = String(process.env.VIDEO_PIPELINE_CALLBACK_SECRET || "");
  if (secret.length < 32) {
    return json({ ok: false, error: "Commercial callback is not configured." }, 503);
  }
  if ((request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ ok: false, error: "Content-Type must be application/json." }, 415);
  }

  const timestamp = request.headers.get("x-webhook-timestamp") || "";
  const signature = request.headers.get("x-webhook-signature") || "";
  if (!/^\d{10,12}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    return json({ ok: false, error: "Invalid or expired callback timestamp." }, 401);
  }

  try {
    const bodyBytes = await readBoundedBody(request);
    const bodyText = bodyBytes.toString("utf8");
    const expected = createHmac("sha256", secret).update(`${timestamp}.${bodyText}`).digest("hex");
    if (!safeEqualHex(signature, expected)) {
      return json({ ok: false, error: "Invalid callback signature." }, 401);
    }

    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return json({ ok: false, error: "Callback body must be valid JSON." }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ ok: false, error: "Callback body must be a JSON object." }, 400);
    }

    const { job_id: jobId, tenant_id: tenantId, status, error } = body;
    if (typeof jobId !== "string" || !JOB_ID_RE.test(jobId) || typeof tenantId !== "string" || !UUID_RE.test(tenantId)) {
      return json({ ok: false, error: "Invalid job or tenant identifier." }, 422);
    }
    if (!["completed", "failed"].includes(status)) {
      return json({ ok: false, error: "Status must be completed or failed." }, 422);
    }
    if (error !== undefined && (typeof error !== "string" || error.length > 500)) {
      return json({ ok: false, error: "Callback error detail is too long." }, 422);
    }

    const rows = await rest(
      process.env,
      "PATCH",
      `/commercial_jobs?id=eq.${encodeURIComponent(jobId)}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
      { status },
      { Prefer: "return=representation" },
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      return json({ ok: false, error: "Commercial job was not found for this tenant." }, 404);
    }
    return json({ ok: true, job_id: jobId, status });
  } catch (err) {
    const status = Number(err.status) || 500;
    console.error("[commercial callback]", status >= 500 ? "database update failed" : err.message);
    return json({ ok: false, error: status >= 500 ? "Commercial callback failed." : err.message }, status);
  }
}
