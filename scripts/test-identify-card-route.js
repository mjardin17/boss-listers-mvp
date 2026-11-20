import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/identify-card/route.js";

const oldEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  PRICECHARTING_API_TOKEN: process.env.PRICECHARTING_API_TOKEN,
  PRICECHARTING_API_ENABLED: process.env.PRICECHARTING_API_ENABLED,
  PRICECHARTING_ALLOWED_TENANT_ID: process.env.PRICECHARTING_ALLOWED_TENANT_ID,
  PRICECHARTING_COMMERCIAL_LICENSE_CONFIRMED: process.env.PRICECHARTING_COMMERCIAL_LICENSE_CONFIRMED,
};
const originalFetch = globalThis.fetch;

function authFetch(url) {
  if (String(url).includes("/auth/v1/user")) {
    return Response.json({ id: "user-test", email: "test@example.invalid" });
  }
  if (String(url).includes("/rest/v1/tenant_members")) {
    return Response.json([{ tenant_id: "tenant-test", role: "owner" }]);
  }
  throw new Error("Unexpected network request");
}

function makeRequest(form, token = "test-access-token") {
  return new Request("http://localhost:3001/api/identify-card", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
}

test("route authenticates before processing and returns scanner response contract", async (t) => {
  process.env.SUPABASE_URL = "https://supabase.invalid";
  process.env.SUPABASE_ANON_KEY = "sb_publishable_test";
  process.env.GEMINI_API_KEY = "";
  process.env.PRICECHARTING_API_TOKEN = "";
  process.env.PRICECHARTING_API_ENABLED = "false";
  globalThis.fetch = authFetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const unauthorized = await POST(new Request("http://localhost/api/identify-card", { method: "POST" }));
  assert.equal(unauthorized.status, 401);

  const form = new FormData();
  form.append("front", new Blob([Buffer.from([0xff, 0xd8, 0xff, 0x00])], { type: "image/jpeg" }), "front.jpg");
  const response = await POST(makeRequest(form));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.identification.status, "unknown");
  assert.match(body.identification.error, /provider configuration/i);
  assert.equal(body.valuation.status, "insufficient");
  assert.equal(body.requiresConfirmation, false);
});

test("route rejects MIME spoofing and unsupported content types", async (t) => {
  process.env.SUPABASE_URL = "https://supabase.invalid";
  process.env.SUPABASE_ANON_KEY = "sb_publishable_test";
  process.env.GEMINI_API_KEY = "";
  process.env.PRICECHARTING_API_TOKEN = "";
  process.env.PRICECHARTING_API_ENABLED = "false";
  globalThis.fetch = authFetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const badForm = new FormData();
  badForm.append("front", new Blob(["not an image"], { type: "image/jpeg" }), "front.jpg");
  const badImage = await POST(makeRequest(badForm));
  assert.equal(badImage.status, 415);

  const wrongType = await POST(new Request("http://localhost/api/identify-card", {
    method: "POST",
    headers: { authorization: "Bearer test-access-token", "content-type": "application/json" },
    body: JSON.stringify({ front: "not a file" }),
  }));
  assert.equal(wrongType.status, 415);
});

test("PriceCharting token is not exposed to other tenants without a commercial license", async (t) => {
  process.env.SUPABASE_URL = "https://supabase.invalid";
  process.env.SUPABASE_ANON_KEY = "sb_publishable_test";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.PRICECHARTING_API_TOKEN = "test-pricecharting-token";
  process.env.PRICECHARTING_API_ENABLED = "true";
  process.env.PRICECHARTING_ALLOWED_TENANT_ID = "another-tenant";
  process.env.PRICECHARTING_COMMERCIAL_LICENSE_CONFIRMED = "false";

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/auth/v1/user")) {
      return Response.json({ id: "user-test", email: "test@example.invalid" });
    }
    if (String(url).includes("/rest/v1/tenant_members")) {
      return Response.json([{ tenant_id: "tenant-test", role: "owner" }]);
    }
    if (String(url).includes("generativelanguage.googleapis.com")) {
      assert.equal(options.headers["x-goog-api-key"], "test-gemini-key");
      assert.equal(String(url).includes("test-gemini-key"), false);
      return Response.json({
        candidates: [{
          cardNumber: "58", set: "Base Set", manufacturer: "Nintendo",
          year: "1999", player: "Oddish",
        }],
        frontOcrText: "Oddish",
        backOcrText: "Base Set 58",
        frontBackTextConflict: false,
      });
    }
    throw new Error("PriceCharting must not be called for an unauthorized tenant.");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const form = new FormData();
  form.append("front", new Blob([Buffer.from([0xff, 0xd8, 0xff, 0x00])], { type: "image/jpeg" }), "front.jpg");
  const response = await POST(makeRequest(form));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.identification.status, "likely");
  assert.equal(body.valuation.status, "insufficient");
  assert.match(body.valuation.explanation, /disabled/i);
});
