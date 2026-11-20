import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Readable } from "node:stream";

const require = createRequire(import.meta.url);
const handler = require("../../lib/cardFactoryLocalBridge.js");

const envNames = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "CARD_FACTORY_LOCAL_BRIDGE_ENABLED",
  "CARD_FACTORY_LOCAL_TOKEN",
  "CARD_FACTORY_LOCAL_WORKSPACE_ID",
];
const oldEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
const originalFetch = globalThis.fetch;

function restoreEnv() {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function setupEnv(workspaceId = "tenant-test") {
  process.env.SUPABASE_URL = "https://supabase.invalid";
  process.env.SUPABASE_ANON_KEY = "sb_publishable_test";
  process.env.CARD_FACTORY_LOCAL_BRIDGE_ENABLED = "true";
  process.env.CARD_FACTORY_LOCAL_TOKEN = "local-bridge-token-".padEnd(48, "x");
  process.env.CARD_FACTORY_LOCAL_WORKSPACE_ID = workspaceId;
}

function makeReq(method, { body = "", headers = {}, query = {} } = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = method;
  req.headers = headers;
  req.query = query;
  return req;
}

function makeRes() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function authAndLocalFetch({ tenantId = "tenant-test", localStatus = 201 } = {}) {
  const localCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/auth/v1/user")) {
      return Response.json({ id: "user-test", email: "test@example.invalid" });
    }
    if (target.includes("/rest/v1/tenant_members")) {
      return Response.json([{ tenant_id: tenantId, role: "owner" }]);
    }
    if (target === "http://127.0.0.1:8787/api/cards") {
      localCalls.push({ url: target, options });
      return Response.json({ ok: true, syncStatus: "local_only", cards: [] }, { status: localStatus });
    }
    throw new Error("Unexpected outbound request");
  };
  return localCalls;
}

test("disabled bridge fails closed without contacting local service", async (t) => {
  setupEnv();
  process.env.CARD_FACTORY_LOCAL_BRIDGE_ENABLED = "false";
  const localCalls = authAndLocalFetch();
  t.after(restoreEnv);
  const res = makeRes();
  await handler(makeReq("GET"), res);
  assert.equal(res.statusCode, 404);
  assert.equal(localCalls.length, 0);
});

test("bridge requires a valid Supabase session before forwarding", async (t) => {
  setupEnv();
  const localCalls = authAndLocalFetch();
  t.after(restoreEnv);
  const res = makeRes();
  await handler(makeReq("GET"), res);
  assert.equal(res.statusCode, 401);
  assert.equal(localCalls.length, 0);
});

test("bridge rejects tenant mismatch before forwarding", async (t) => {
  setupEnv("tenant-configured");
  const localCalls = authAndLocalFetch({ tenantId: "tenant-other" });
  t.after(restoreEnv);
  const res = makeRes();
  await handler(makeReq("GET", { headers: { authorization: "Bearer valid-session-token" } }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(localCalls.length, 0);
});

test("authorized POST forwards server-side token and does not return it", async (t) => {
  setupEnv();
  const localCalls = authAndLocalFetch();
  t.after(restoreEnv);
  const payload = JSON.stringify({ userConfirmed: true, idempotencyKey: "scan-1" });
  const res = makeRes();
  await handler(makeReq("POST", {
    headers: {
      authorization: "Bearer valid-session-token",
      "content-type": "application/json",
    },
    body: payload,
  }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(localCalls.length, 1);
  assert.equal(localCalls[0].options.headers.authorization, process.env.CARD_FACTORY_LOCAL_TOKEN);
  assert.equal(JSON.stringify(res.body).includes(process.env.CARD_FACTORY_LOCAL_TOKEN), false);
});

test("bridge rejects non-JSON bodies and out-of-range list limits", async (t) => {
  setupEnv();
  const localCalls = authAndLocalFetch();
  t.after(restoreEnv);
  const wrongType = makeRes();
  await handler(makeReq("POST", {
    headers: {
      authorization: "Bearer valid-session-token",
      "content-type": "text/plain",
    },
    body: "no",
  }), wrongType);
  assert.equal(wrongType.statusCode, 415);

  const badLimit = makeRes();
  await handler(makeReq("GET", {
    headers: { authorization: "Bearer valid-session-token" },
    query: { limit: "101" },
  }), badLimit);
  assert.equal(badLimit.statusCode, 400);
  assert.equal(localCalls.length, 0);
});

test("bridge enforces the 12 MB streamed request limit", async (t) => {
  setupEnv();
  const localCalls = authAndLocalFetch();
  t.after(restoreEnv);
  const res = makeRes();
  const tooLarge = "x".repeat(12 * 1024 * 1024 + 1);
  await handler(makeReq("POST", {
    headers: {
      authorization: "Bearer valid-session-token",
      "content-type": "application/json",
    },
    body: tooLarge,
  }), res);
  assert.equal(res.statusCode, 413);
  assert.equal(localCalls.length, 0);
});
