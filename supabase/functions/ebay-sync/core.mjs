// supabase/functions/ebay-sync/core.mjs
// The automatic stock sync, written so it runs the same in the cloud (Deno) and in tests (Node).
// Everything it needs from outside is passed in: fetch, an XML parser, keys, config and the planner.
//
// What one run does:
//   1. Reads every live eBay listing and every counted product in BossListers.
//   2. Plans the counts (plan.mjs, generated from lib/inventoryCountPlan.js).
//   3. Changes the BossListers count where eBay is the proof (sold or ended goes to 0).
//   4. If eBay changes are switched on, lowers or ends eBay listings whose stock sold elsewhere.
//   5. Saves each item's condition and shipping price from eBay (one GetItem, read only): every
//      item missing either one, and each known one about once a day. Only the condition and
//      shipping columns are written; a failure here is reported but never fails the stock sync.
//      Live items with no fixed shipping price are listed in the log's conflicts so they show up.
//   6. Writes one row to sync_logs.
// It fails closed: an empty or suspect eBay read changes nothing.

import { conditionFromTradingItem, isMissingCondition, pickConditionChecks } from "./condition.mjs";
import { isMissingShipping, shippingChanges, shippingFromTradingItem } from "./shipping.mjs";

const EBAY_API = "https://api.ebay.com";
const TRADING_URL = `${EBAY_API}/ws/api.dll`;
const OAUTH_URL = `${EBAY_API}/identity/v1/oauth2/token`;
const OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account";
const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const TIMEOUT_MS = 30_000;
const XMLNS = "urn:ebay:apis:eBLBaseComponents";
const MIN_SECONDS_BETWEEN_RUNS = 300; // the caller's key is a public one, so extra calls are simply ignored

function makeRest({ fetchImpl, supabaseUrl, serviceKey }) {
  return async (path, opts = {}) => {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/${path}`, {
      ...opts,
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", ...(opts.headers || {}) },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`database ${opts.method || "GET"} ${path.split("?")[0]} failed (HTTP ${res.status})`);
    return text ? JSON.parse(text) : null;
  };
}

async function getAccessToken({ fetchImpl, rest, tenantId, ebayClientId, ebayClientSecret }) {
  const refreshToken = await rest("rpc/get_decrypted_marketplace_token", {
    method: "POST",
    body: JSON.stringify({ p_tenant_id: tenantId, p_marketplace: "ebay", p_environment: "production" }),
  });
  if (!refreshToken) throw new Error("eBay is not connected for this account");
  const res = await fetchImpl(OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${ebayClientId}:${ebayClientSecret}`)}` },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, scope: OAUTH_SCOPE }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || !body.access_token) throw new Error(`eBay login failed (HTTP ${res.status})`);
  return body.access_token;
}

async function trading({ fetchImpl, parseXml, token }, callName, innerXml) {
  const res = await fetchImpl(TRADING_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml", "X-EBAY-API-SITEID": "0", "X-EBAY-API-COMPATIBILITY-LEVEL": "1155", "X-EBAY-API-CALL-NAME": callName, "X-EBAY-API-IAF-TOKEN": token },
    body: `<?xml version="1.0" encoding="utf-8"?><${callName}Request xmlns="${XMLNS}">${innerXml}</${callName}Request>`,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  const response = res.ok ? parseXml(text)[`${callName}Response`] : null;
  if (!response || response.Ack === "Failure") throw new Error(`eBay ${callName} failed (HTTP ${res.status})`);
  return response;
}

/** Every live listing: Map of listing id -> units still available. */
async function readActiveListings(ctx) {
  const live = new Map();
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    if (page > MAX_PAGES) throw new Error("eBay returned more pages than expected; refusing a partial read");
    const response = await trading(ctx, "GetMyeBaySelling",
      `<ActiveList><Include>true</Include><Pagination><EntriesPerPage>${PAGE_SIZE}</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList>`);
    const list = response.ActiveList || {};
    totalPages = Number(list.PaginationResult?.TotalNumberOfPages || 1);
    for (const item of [].concat(list.ItemArray?.Item || [])) {
      if (item.ItemID == null) continue;
      const listed = Number(item.Quantity || 0);
      const sold = Number(item.SellingStatus?.QuantitySold || 0);
      live.set(String(item.ItemID), Math.max(0, listed - sold));
    }
  }
  return live;
}

async function whyGone(ctx, classifyEbayItem, itemId) {
  try {
    const response = await trading(ctx, "GetItem", `<ItemID>${Number(itemId)}</ItemID>`);
    return classifyEbayItem([].concat(response.Item || [])[0]);
  } catch {
    return "unknown";
  }
}

const setEbayQuantity = (ctx, itemId, quantity) =>
  trading(ctx, "ReviseInventoryStatus", `<InventoryStatus><ItemID>${Number(itemId)}</ItemID><Quantity>${Number(quantity)}</Quantity></InventoryStatus>`);

const endEbayListing = (ctx, itemId) =>
  trading(ctx, "EndFixedPriceItem", `<ItemID>${Number(itemId)}</ItemID><EndingReason>NotAvailable</EndingReason>`);

async function applySteps({ steps, ctx, rest, tenantId, live, classifyEbayItem, stamp }) {
  const result = { applied: [], ebayChanged: [], held: [...steps.held], failed: [] };
  for (const step of steps.apply) {
    try {
      let note = "automatic sync (cloud)";
      if (step.needsEbayProof) {
        const why = await whyGone(ctx, classifyEbayItem, step.ebayListingId);
        if (why !== "sold" && why !== "ended") { result.held.push({ sku: step.sku, reason: `missing from eBay's live list, but eBay reports it as "${why}"` }); continue; }
        note = `automatic sync (cloud); eBay says: ${why}`;
      }
      const out = await rest("rpc/set_inventory_count", {
        method: "POST",
        body: JSON.stringify({ p_tenant_id: tenantId, p_sku: step.sku, p_expected: step.from, p_new: step.to, p_source: "reconcile", p_external_id: `${step.sku}:${step.from}>${step.to}:${stamp}`, p_ebay_baseline: live.get(step.ebayListingId) ?? 0, p_note: note }),
      });
      const row = Array.isArray(out) ? out[0] : out;
      // "already applied" means another run (this PC, or a retry) made the same change this minute.
      if (row && row.applied) result.applied.push({ sku: step.sku, from: step.from, to: step.to });
      else if (!row || row.reason !== "already applied") result.failed.push({ sku: step.sku, reason: row ? row.reason : "no answer from the database" });
    } catch (err) {
      result.failed.push({ sku: step.sku, reason: err.message });
    }
  }
  const notReady = new Set([...result.failed, ...result.held].map((x) => x.sku));
  for (const step of steps.ebay) {
    if (notReady.has(step.sku)) continue;
    try {
      if (step.end) await endEbayListing(ctx, step.ebayListingId);
      else await setEbayQuantity(ctx, step.ebayListingId, step.set);
      result.ebayChanged.push({ sku: step.sku, set: step.set, ended: step.end });
    } catch (err) {
      result.failed.push({ sku: step.sku, reason: `eBay: ${err.message}` });
    }
  }
  return result;
}

/**
 * Reads the condition and shipping of the chosen listings from eBay and saves what changed.
 * Returns both reports and the products as saved after this run.
 */
async function refreshListingDetails({ ctx, rest, tenantId, products, live, now }) {
  const conditions = { checked: 0, updated: [], failed: [] };
  const shipping = { updated: [], missing: [] };
  const saved = new Map(products.map((p) => [p.id, p]));
  const isMissing = (p) => isMissingCondition(p.condition) || isMissingShipping(p);
  for (const p of pickConditionChecks(products, live, { now, isMissing })) {
    conditions.checked++;
    try {
      const response = await trading(ctx, "GetItem", `<ItemID>${Number(p.ebay_listing_id)}</ItemID>`);
      const item = [].concat(response.Item || [])[0];
      const condition = conditionFromTradingItem(item);
      const changes = { ...(condition && condition !== p.condition ? { condition } : {}), ...(shippingChanges(p, shippingFromTradingItem(item)) || {}) };
      if (Object.keys(changes).length === 0) continue;
      await rest(`products?id=eq.${encodeURIComponent(p.id)}&tenant_id=eq.${tenantId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(changes),
      });
      saved.set(p.id, { ...p, ...changes });
      if (changes.condition) conditions.updated.push({ sku: p.sku, from: p.condition ?? null, to: condition });
      if (changes.shipping_type) shipping.updated.push({ sku: p.sku, type: changes.shipping_type, cost: changes.shipping_cost });
    } catch (err) {
      conditions.failed.push({ sku: p.sku, reason: String(err.message).slice(0, 200) });
    }
  }
  for (const p of saved.values()) {
    const onEbay = p.ebay_listing_id && live.has(String(p.ebay_listing_id));
    if (onEbay && !(Number(p.shipping_cost) > 0)) shipping.missing.push({ sku: p.sku, shipping_type: p.shipping_type || "not read yet" });
  }
  return { conditions, shipping };
}

/** True when a run was logged less than MIN_SECONDS_BETWEEN_RUNS ago. */
async function ranRecently(rest, nowMs) {
  const rows = await rest("sync_logs?select=started_at&order=started_at.desc&limit=1");
  const last = rows && rows[0] ? Date.parse(rows[0].started_at) : NaN;
  return Number.isFinite(last) && nowMs - last < MIN_SECONDS_BETWEEN_RUNS * 1000;
}

async function writeLog(rest, startedAt, summary) {
  const status = summary.blocked ? "failed" : summary.failed.length ? "partial" : "success";
  try {
    await rest("sync_logs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status,
        items_seen: summary.ebayLive ?? 0,
        items_upserted: summary.applied.length + summary.ebayChanged.length,
        conflicts: [
          ...summary.held,
          ...summary.shipping.missing.map((m) => ({ sku: m.sku, reason: `no fixed shipping price on eBay (${m.shipping_type}); the store uses its Stripe rate` })),
        ],
        errors: summary.blocked ? [{ error: summary.blocked }] : summary.failed,
      }),
    });
  } catch {
    // The log is best effort: a failed log write must not turn a good sync into an error.
  }
  return status;
}

/**
 * Runs one sync.
 * @param {{ fetchImpl: typeof fetch, parseXml: (xml: string) => any,
 *           env: { supabaseUrl: string, serviceKey: string, ebayClientId: string, ebayClientSecret: string },
 *           config: { ownerTenantId: string, digitalSkus?: string[], ebayWritesEnabled?: boolean },
 *           planner: { planCounts: Function, autoSteps: Function, classifyEbayItem: Function },
 *           now?: number }} deps  `now` only picks which known conditions are re-checked (tests)
 * @returns {Promise<{ ok: boolean, status: string, ebayLive: number|null, blocked: string|null,
 *                     applied: object[], ebayChanged: object[], held: object[], failed: object[],
 *                     conditions: { checked: number, updated: object[], failed: object[] },
 *                     shipping: { updated: object[], missing: object[] } }>}
 */
export async function runSync({ fetchImpl, parseXml, env, config, planner, now }) {
  const startedAt = new Date().toISOString();
  const summary = { ebayLive: null, blocked: null, applied: [], ebayChanged: [], held: [], failed: [], conditions: { checked: 0, updated: [], failed: [] }, shipping: { updated: [], missing: [] } };
  const missing = ["supabaseUrl", "serviceKey", "ebayClientId", "ebayClientSecret"].filter((k) => !env[k]);
  if (missing.length || !config.ownerTenantId) {
    return { ok: false, status: "failed", ...summary, blocked: `not set up: ${[...missing, ...(config.ownerTenantId ? [] : ["ownerTenantId"])].join(", ")}` };
  }
  const rest = makeRest({ fetchImpl, supabaseUrl: env.supabaseUrl, serviceKey: env.serviceKey });
  const tenantId = config.ownerTenantId;
  try {
    if (await ranRecently(rest, Date.parse(startedAt))) return { ok: true, status: "skipped", ...summary, skipped: "a sync ran less than five minutes ago" };
  } catch (err) {
    return { ok: false, status: "failed", ...summary, blocked: `run failed: ${String(err.message).slice(0, 200)}` };
  }
  try {
    const token = await getAccessToken({ fetchImpl, rest, tenantId, ebayClientId: env.ebayClientId, ebayClientSecret: env.ebayClientSecret });
    const ctx = { fetchImpl, parseXml, token };
    const live = await readActiveListings(ctx);
    summary.ebayLive = live.size;
    const products = await rest(`products?select=id,sku,quantity,status,ebay_listing_id,last_ebay_quantity,condition,shipping_type,shipping_cost&tenant_id=eq.${tenantId}&limit=5000`);
    const plan = planner.planCounts({ products: products.map((p) => ({ ...p, shopify_baseline: null })), ebay: live, shopify: new Map(), digitalSkus: config.digitalSkus || [] });
    const steps = planner.autoSteps(plan, { ebayWrites: config.ebayWritesEnabled === true });
    if (steps.blocked) summary.blocked = steps.blocked;
    else {
      Object.assign(summary, await applySteps({ steps, ctx, rest, tenantId, live, classifyEbayItem: planner.classifyEbayItem, stamp: startedAt.slice(0, 16) }));
      Object.assign(summary, await refreshListingDetails({ ctx, rest, tenantId, products, live, now: now ?? Date.parse(startedAt) }));
    }
  } catch (err) {
    summary.blocked = `run failed: ${String(err.message).slice(0, 200)}`;
  }
  const status = await writeLog(rest, startedAt, summary);
  return { ok: status === "success", status, ...summary };
}
