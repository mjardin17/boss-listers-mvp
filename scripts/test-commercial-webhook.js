import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { POST } from "../app/api/commercials/route.js";

const envNames = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VIDEO_PIPELINE_WEBHOOK_URL",
  "VIDEO_PIPELINE_WEBHOOK_SECRET",
  "NODE_ENV",
];
const oldEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
const originalFetch = globalThis.fetch;

function restore() {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function setup({ tenantId = `tenant-${Date.now()}`, ack = null } = {}) {
  process.env.SUPABASE_URL = "https://supabase.invalid";
  process.env.SUPABASE_ANON_KEY = "sb_publishable_test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-only";
  process.env.VIDEO_PIPELINE_WEBHOOK_URL = "https://video.example.test/webhook";
  process.env.VIDEO_PIPELINE_WEBHOOK_SECRET = "test-webhook-secret-value-that-is-at-least-32-bytes";
  process.env.NODE_ENV = "test";

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/auth/v1/user")) {
      return Response.json({ id: "user-test", email: "test@example.invalid" });
    }
    if (target.includes("/rest/v1/tenant_members")) {
      return Response.json([{ tenant_id: tenantId, role: "owner" }]);
    }
    if (target.includes("/rest/v1/listings")) {
      calls.push({ kind: "listing-check", target, options });
      return Response.json([{ id: "listing_123" }]);
    }
    if (target.includes("/rest/v1/commercial_jobs")) {
      calls.push({ kind: options.method, target, options });
      return new Response(null, { status: options.method === "POST" ? 201 : 204 });
    }
    if (target === process.env.VIDEO_PIPELINE_WEBHOOK_URL) {
      calls.push({ kind: "webhook", target, options });
      return ack || Response.json({
        ok: true,
        status: "queued",
        job_id: JSON.parse(options.body).job_id,
      }, { status: 202 });
    }
    throw new Error(`Unexpected request: ${target}`);
  };
  return { tenantId, calls };
}

function request(body, token = "test-access-token") {
  return new Request("http://localhost:3001/api/commercials", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function validBody() {
  return {
    listingId: "listing_123",
    images: ["https://images.example.test/oddish.jpg"],
    productName: "Oddish Pokémon Card",
    description: "Vintage card",
    price: "$12.50",
  };
}

test("commercial sender signs exact body and uses receiver snake_case contract", async (t) => {
  const { tenantId, calls } = setup();
  t.after(restore);
  const response = await POST(request(validBody()));
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.status, "queued");

  const webhook = calls.find((call) => call.kind === "webhook");
  assert.ok(webhook);
  assert.equal(webhook.options.headers["X-Webhook-Secret"], undefined);
  const body = JSON.parse(webhook.options.body);
  assert.equal(body.type, "generate_commercial");
  assert.equal(body.listing_id, "listing_123");
  assert.equal(body.product_name, "Oddish Pokémon Card");
  assert.equal(body.tenant_id, tenantId);
  const timestamp = webhook.options.headers["X-Webhook-Timestamp"];
  const expected = createHmac("sha256", process.env.VIDEO_PIPELINE_WEBHOOK_SECRET)
    .update(`${timestamp}.${webhook.options.body}`)
    .digest("hex");
  assert.equal(webhook.options.headers["X-Webhook-Signature"], expected);
});

test("commercial sender rejects invalid images and oversized request bodies", async (t) => {
  setup();
  t.after(restore);
  const invalid = await POST(request({ ...validBody(), images: ["http://127.0.0.1/private"] }));
  assert.equal(invalid.status, 400);

  const oversized = await POST(request("x".repeat(256 * 1024 + 1)));
  assert.equal(oversized.status, 413);
});

test("commercial sender requires a positive receiver acknowledgement", async (t) => {
  setup({ ack: Response.json({ ok: false, status: "rejected" }, { status: 200 }) });
  t.after(restore);
  const response = await POST(request(validBody()));
  assert.equal(response.status, 502);
});

test("commercial sender rate-limits generation per tenant", async (t) => {
  setup();
  t.after(restore);
  for (let i = 0; i < 5; i += 1) {
    const response = await POST(request({ ...validBody(), listingId: `listing_${i}` }));
    assert.equal(response.status, 201);
  }
  const limited = await POST(request(validBody()));
  assert.equal(limited.status, 429);
});
