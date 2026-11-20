import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { POST } from "../app/api/commercials/callback/route.js";

const envNames = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VIDEO_PIPELINE_CALLBACK_SECRET"];
const oldEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
const originalFetch = globalThis.fetch;

function restore() {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const secret = "callback-secret-that-is-at-least-32-bytes-long";
const tenantId = "11111111-1111-4111-8111-111111111111";
const jobId = "commercial_callback_001";

function setup({ rows = [{ id: jobId }] } = {}) {
  process.env.SUPABASE_URL = "https://supabase.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  process.env.VIDEO_PIPELINE_CALLBACK_SECRET = secret;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return Response.json(rows);
  };
  return calls;
}

function makeBody(overrides = {}) {
  return JSON.stringify({
    job_id: jobId,
    tenant_id: tenantId,
    status: "completed",
    error: "",
    ...overrides,
  });
}

function makeRequest(body, { timestamp = Math.floor(Date.now() / 1000).toString(), signatureSecret = secret } = {}) {
  const signature = createHmac("sha256", signatureSecret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return new Request("https://boss.example.test/api/commercials/callback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-timestamp": timestamp,
      "x-webhook-signature": signature,
    },
    body,
  });
}

test("valid signed callback updates only the matching tenant's job", async (t) => {
  const calls = setup();
  t.after(restore);
  const response = await POST(makeRequest(makeBody()));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.job_id, jobId);
  assert.equal(body.status, "completed");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/commercial_jobs\?id=eq\.commercial_callback_001&tenant_id=eq\.11111111-1111-4111-8111-111111111111/);
  assert.equal(calls[0].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].options.body), { status: "completed" });
});

test("callback rejects invalid signatures and expired timestamps", async (t) => {
  const calls = setup();
  t.after(restore);
  const body = makeBody();
  const badSignature = await POST(makeRequest(body, { signatureSecret: "wrong-secret" }));
  assert.equal(badSignature.status, 401);
  const stale = await POST(makeRequest(body, { timestamp: String(Math.floor(Date.now() / 1000) - 600) }));
  assert.equal(stale.status, 401);
  assert.equal(calls.length, 0);
});

test("callback rejects invalid status and tenant identifiers", async (t) => {
  const calls = setup();
  t.after(restore);
  const invalidStatus = await POST(makeRequest(makeBody({ status: "queued" })));
  assert.equal(invalidStatus.status, 422);
  const invalidTenant = await POST(makeRequest(makeBody({ tenant_id: "../../other-tenant" })));
  assert.equal(invalidTenant.status, 422);
  assert.equal(calls.length, 0);
});

test("callback returns 404 when no tenant-scoped job matches", async (t) => {
  setup({ rows: [] });
  t.after(restore);
  const response = await POST(makeRequest(makeBody({ status: "failed", error: "render error" })));
  assert.equal(response.status, 404);
});

test("callback fails closed when its secret is not configured", async (t) => {
  setup();
  process.env.VIDEO_PIPELINE_CALLBACK_SECRET = "";
  t.after(restore);
  const response = await POST(makeRequest(makeBody()));
  assert.equal(response.status, 503);
});
