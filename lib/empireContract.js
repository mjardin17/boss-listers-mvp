// lib/empireContract.js
// The Empire OS module contract for Boss Listers. Empire OS (the hub) calls:
//   GET  /empire/health        no key: is Boss Listers up and set up? (no data, no secrets)
//   POST /empire/event         an Empire OS event; accepted and kept in memory
//   GET  /empire/listings      stock list summary by stage + the newest items
//   GET  /empire/platforms     which selling sites have credentials set (names only, no probing)
//   POST /empire/stock/add     add an item to the in-house stock list as an UNLISTED draft
//                              ("dryRun": true only checks it). Nothing is ever posted to a selling site.
// next.config.js rewrites /empire/* to pages/api/empire/*. Every route except health needs the
// shared key: header X-Empire-Key must equal EMPIRE_SHARED_KEY. Without that variable the
// routes answer 503 (fail closed). Data is read for the platform owner's tenant only.
// Pure logic with injected dependencies, so it can be tested without a server or database.

const crypto = require("crypto");
const { STAGES, stockStage, missingForApproval, newItemRow, summarize } = require("./stockList");

const MODULE_ID = "bosslisters";
const CONTRACT_VERSION = 1;
const STARTED_AT = Date.now();
const MAX_EVENTS = 50;
const EMPIRE_ROUTES = ["/empire/health", "/empire/event", "/empire/listings", "/empire/platforms", "/empire/stock/add"];

// Selling sites and the env variables each one needs (same lists as lib/channels/apiConnectors.js).
const PLATFORM_ENV = {
  ebay: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_REFRESH_TOKEN", "EBAY_ENVIRONMENT"],
  etsy: ["ETSY_KEYSTRING", "ETSY_SHARED_SECRET", "ETSY_REDIRECT_URI"],
  facebook: ["FB_ACCESS_TOKEN", "FB_PAGE_ID"],
  instagram: ["IG_ACCESS_TOKEN", "IG_APP_ID"],
  bonanza: ["BONANZA_DEV_ID", "BONANZA_CERT_ID", "BONANZA_ACCESS_TOKEN"],
  shopify: ["SHOPIFY_STORE_URL", "SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"],
  woocommerce: ["WOOCOMMERCE_STORE_URL", "WOOCOMMERCE_CONSUMER_KEY", "WOOCOMMERCE_CONSUMER_SECRET"],
  amazon: ["AMAZON_CLIENT_ID", "AMAZON_CLIENT_SECRET"],
  tiktok_shop: ["TIKTOK_SHOP_APP_KEY", "TIKTOK_SHOP_APP_SECRET"],
};

const events = [];

const sha256 = (v) => crypto.createHash("sha256").update(String(v)).digest();

/**
 * Checks the X-Empire-Key header against EMPIRE_SHARED_KEY (constant-time).
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
function checkEmpireKey(headers, env = process.env) {
  const expected = String(env.EMPIRE_SHARED_KEY || "").trim();
  if (!expected) return { ok: false, status: 503, error: "Empire OS access is off: set EMPIRE_SHARED_KEY in Boss Listers" };
  const raw = headers && (headers["x-empire-key"] ?? headers["X-Empire-Key"]);
  const given = Array.isArray(raw) ? raw[0] : raw;
  if (!given) return { ok: false, status: 401, error: "Missing X-Empire-Key header" };
  if (!crypto.timingSafeEqual(sha256(given), sha256(expected))) return { ok: false, status: 401, error: "Wrong X-Empire-Key" };
  return { ok: true };
}

/** The tenant Empire OS works for: the platform owner (Josh). */
function ownerTenantId(env = process.env, config = safeConfig()) {
  return String(env.PLATFORM_OWNER_TENANT_ID || config.ownerTenantId || "").trim() || null;
}

function safeConfig() {
  try {
    return require("../config/inventory-sync.json");
  } catch {
    return {};
  }
}

/** Health report in the Empire OS shape. Says what is set up, never any values. */
function buildHealth({ env = process.env, dataDirWritable = true, now = new Date() } = {}) {
  const checks = {
    dataDirWritable,
    supabaseConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
    empireKeyConfigured: Boolean(String(env.EMPIRE_SHARED_KEY || "").trim()),
    ownerTenantConfigured: Boolean(ownerTenantId(env)),
  };
  const problems = [];
  if (!checks.dataDirWritable) problems.push("the data folder is not writable");
  if (!checks.supabaseConfigured) problems.push("Supabase is not configured, so listings cannot be read");
  if (!checks.empireKeyConfigured) problems.push("EMPIRE_SHARED_KEY is not set, so Empire OS can only see this health check");
  const status = !checks.dataDirWritable ? "unhealthy" : problems.length ? "degraded" : "healthy";
  return {
    status,
    details: {
      module: MODULE_ID,
      app: "Boss Listers",
      contract: CONTRACT_VERSION,
      uptimeSeconds: Math.round((now.getTime() - STARTED_AT) / 1000),
      checks,
      problems,
      routes: EMPIRE_ROUTES,
      eventsReceived: events.length,
    },
    checkedAt: now.toISOString(),
  };
}

/** Accepts an Empire OS event. Kept in memory (last 50); nothing is posted anywhere. */
function acceptEvent(input, now = new Date()) {
  const e = input && typeof input === "object" ? input : {};
  if (typeof e.topic !== "string" || !e.topic.trim()) return { status: 400, body: { accepted: false, error: "topic is required" } };
  const event = {
    topic: e.topic.trim().slice(0, 120),
    source: typeof e.source === "string" ? e.source.slice(0, 120) : null,
    correlationId: typeof e.correlationId === "string" ? e.correlationId.slice(0, 120) : null,
    receivedAt: now.toISOString(),
  };
  events.unshift(event);
  events.length = Math.min(events.length, MAX_EVENTS);
  return { status: 202, body: { accepted: true, topic: event.topic } };
}

const recentEvents = () => events.slice();

const LISTING_FIELDS = ["sku", "title", "price", "quantity", "condition", "status", "source", "published", "image_url", "updated_at"];
const pick = (p) => Object.fromEntries(LISTING_FIELDS.map((k) => [k, p[k] ?? null]));

/** Stock list summary by stage plus the newest items, for the Empire OS panel. */
async function listingsReport({ tenantId, listStock, digitalSkus = [], limit = 10, stage = null }) {
  const products = await listStock(tenantId);
  const n = Math.max(1, Math.min(50, Number(limit) || 10));
  const withStage = products.map((p) => ({ ...pick(p), stage: stockStage(p), missing: missingForApproval(p) }));
  const filtered = stage ? withStage.filter((p) => p.stage === stage) : withStage;
  return {
    ok: true,
    total: products.length,
    stages: STAGES,
    summary: summarize(products, { digitalSkus }),
    items: filtered.slice(0, n),
  };
}

/** Which selling sites have their credentials set. Names only; no values, no live calls. */
function platformsReport(env = process.env) {
  return {
    ok: true,
    probed: false,
    note: "Credentials present or not. Boss Listers did not call any selling site.",
    platforms: Object.entries(PLATFORM_ENV).map(([marketplace, names]) => {
      const missing = names.filter((n) => !env[n]);
      return { marketplace, credsPresent: missing.length === 0, missing };
    }),
  };
}

/**
 * Adds one item to the in-house stock list as an unlisted draft (status "draft", not published),
 * exactly like the Stock page's Add form. dryRun only checks it.
 */
async function addStockItem({ tenantId, input, insertStockItem, now = Date.now() }) {
  const body = input && typeof input === "object" ? input : {};
  const made = newItemRow(body, { tenantId, now });
  if (!made.ok) return { status: 400, body: { ok: false, error: made.error } };
  const preview = { ...made.row };
  delete preview.tenant_id;
  if (body.dryRun === true) {
    return { status: 200, body: { ok: true, dryRun: true, wouldCreate: { ...preview, stage: stockStage(made.row) }, note: "Checked only. Nothing was saved." } };
  }
  const saved = await insertStockItem(made.row);
  const item = saved ? pick(saved) : pick(preview);
  return {
    status: 201,
    body: {
      ok: true,
      dryRun: false,
      item: { ...item, stage: stockStage(saved || made.row), missing: missingForApproval(saved || made.row) },
      note: "Saved to your stock list as an unlisted draft. Nothing was posted to any selling site.",
    },
  };
}

module.exports = {
  MODULE_ID,
  CONTRACT_VERSION,
  EMPIRE_ROUTES,
  PLATFORM_ENV,
  checkEmpireKey,
  ownerTenantId,
  buildHealth,
  acceptEvent,
  recentEvents,
  listingsReport,
  platformsReport,
  addStockItem,
};
