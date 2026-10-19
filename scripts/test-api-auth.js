// Safety net for middleware.js: it exempts every /api/* route from the site
// gate, on the promise that each route enforces its own auth. This test makes
// that promise checkable: every file under pages/api must either call an auth
// helper or be on the reviewed PUBLIC allowlist below. Adding a new open route
// requires a deliberate edit here.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const API_ROOT = path.join(__dirname, "..", "pages", "api");

// Reviewed as intentionally public: they authenticate by other means
// (signature/state/secret) or expose nothing.
const PUBLIC_ALLOWLIST = new Set([
  "health.js",
  "debug-buckets.js", // returns 410
  "channels/payhip/webhook.js", // constant-time signature check
  "channels/ebay/account-deletion.js", // eBay challenge + verification token
  "inventory/ebay-webhook.js", // HMAC signature on POST
  "channels/ebay/callback.js", // OAuth callback (state validated inside)
  "channels/etsy/callback.js",
  "channels/shopify/callback.js",
  "channels/amazon/callback.js",
  "channels/tiktok-shop/callback.js",
  "oauth/[platform]/callback.js",
]);

// Reviewed: reject a missing token, then forward the caller's own bearer token
// to a Supabase RPC/RLS query that resolves the tenant from auth.uid(), so an
// invalid token fails downstream (no service-role access).
const TOKEN_FORWARDING_ALLOWLIST = new Set([
  "channels/ebay/disconnect.js",
  "channels/etsy/disconnect.js",
  "channels/amazon/disconnect.js",
  "channels/shopify/disconnect.js",
  "channels/tiktok-shop/disconnect.js",
  "channels/ebay/policies.js",
  "social/disconnect.js",
]);

const AUTH_MARKERS = /requireSession|requireOwnerSession|resolveSession/;

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(full) : full.endsWith(".js") ? [full] : [];
  });
}

test("every pages/api route enforces auth or is on the reviewed public allowlist", () => {
  const unprotected = listFiles(API_ROOT)
    .map((f) => path.relative(API_ROOT, f).split(path.sep).join("/"))
    .filter((rel) => !PUBLIC_ALLOWLIST.has(rel) && !TOKEN_FORWARDING_ALLOWLIST.has(rel))
    .filter((rel) => !AUTH_MARKERS.test(fs.readFileSync(path.join(API_ROOT, rel), "utf8")));
  assert.deepStrictEqual(unprotected, [], `Routes with no auth check and not allowlisted:\n  ${unprotected.join("\n  ")}`);
});

test("allowlisted public routes still exist (remove stale entries)", () => {
  const missing = [...PUBLIC_ALLOWLIST, ...TOKEN_FORWARDING_ALLOWLIST].filter((rel) => !fs.existsSync(path.join(API_ROOT, rel)));
  assert.deepStrictEqual(missing, []);
});

// ---- App Router routes (app/api/**/route.{js,ts}) --------------------------
const APP_API_ROOT = path.join(__dirname, "..", "app", "api");

// Reviewed as intentionally public: called by external services and verified by
// signature, never by a user login.
const APP_PUBLIC_ALLOWLIST = new Set([
  "listings/webhook/route.ts",
]);

const APP_AUTH_MARKERS = /withSession|withOwnerSession|resolveSession|getUserFromToken/;

function listAppRoutes(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listAppRoutes(full);
    return /^route\.(js|ts)$/.test(e.name) ? [full] : [];
  });
}

test("every app/api route enforces auth or is on the reviewed public allowlist", () => {
  const unprotected = listAppRoutes(APP_API_ROOT)
    .map((f) => path.relative(APP_API_ROOT, f).split(path.sep).join("/"))
    .filter((rel) => !APP_PUBLIC_ALLOWLIST.has(rel))
    .filter((rel) => !APP_AUTH_MARKERS.test(fs.readFileSync(path.join(APP_API_ROOT, rel), "utf8")));
  assert.deepStrictEqual(unprotected, [], `App routes with no auth check and not allowlisted:\n  ${unprotected.join("\n  ")}`);
});

test("allowlisted public app routes still exist (remove stale entries)", () => {
  const missing = [...APP_PUBLIC_ALLOWLIST].filter((rel) => !fs.existsSync(path.join(APP_API_ROOT, rel)));
  assert.deepStrictEqual(missing, []);
});
