import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/identify-card/route.js";

const oldEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  PRICECHARTING_API_TOKEN: process.env.PRICECHARTING_API_TOKEN,
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
