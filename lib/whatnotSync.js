// lib/whatnotSync.js
// Keeps Whatnot in step with eBay, which is the master list of stock.
//  - an eBay item not yet on Whatnot is created there at the eBay price and quantity
//  - an item already on Whatnot gets its quantity set to the eBay quantity
//  - an item no longer live on eBay gets quantity 0 on Whatnot
// Nothing is guessed: an item whose Whatnot category or package weight can't be
// worked out from the real eBay listing is skipped and reported.
const fs = require("fs");
const path = require("path");
const { EbayInventoryFetcher } = require("./ebayInventoryFetcher");
const { WhatnotConnector } = require("./channels/WhatnotConnector");

const STATE_FILE = path.join(__dirname, "..", "data", "whatnot-sync-state.json");
// Whatnot order ids the 15-minute inventory sync has already counted, so a sale is never counted twice.
const ORDERS_STATE_FILE = path.join(__dirname, "..", "data", "whatnot-orders-state.json");

// First match wins. Each rule tests the eBay title plus eBay category path.
const CATEGORY_RULES = [
  [/transformers?/i, "385"],
  [/\b(tmnt|ninja turtles?)\b/i, "381"],
  [/star wars|mandalorian|darth vader/i, "383"],
  [/\bmarvel\b|avengers|spider-?man|captain america/i, "380"],
  [/\bwwe\b|wrestling/i, "382"],
  [/action figure/i, "390"],
  [/pok[eé]mon/i, "2"],
  [/football|nfl/i, "590"],
  [/baseball|mlb/i, "586"],
  [/basketball|nba/i, "593"],
  [/hockey|nhl/i, /card/i, "599"],
  [/sports trading cards/i, "139"],
  [/hello kitty|sanrio|kawaii/i, "314"],
  [/athletic shoes|sneakers?/i, "49"],
  [/curling iron|hair styling/i, "620"],
  [/hot wheels|matchbox|diecast|die-cast|jada|monster trucks?/i, "635"],
  [/plush|squishmallow/i, "640"],
  [/funko/i, "631"],
  [/lego/i, "634"],
  [/snow ?globe|halloween|christmas decor|home decor/i, "626"],
  [/snack|candy|granola|warheads|bites/i, "621"],
  [/shampoo|conditioner|serum|lotion|body (mist|scrub|butter|spray)|toner|sunscreen|makeup|cleansing|skin|foot cream|soap|sponges|wipes|scalp/i, "618"],
  [/batter(y|ies)|charger|portable battery/i, "264"],
  [/ebook|information products/i, null],
  [/toys?|figure|nerf|blaster|bluey|peanuts|playset/i, "150"],
];

function categoryFor(title, ebayCategory) {
  const text = `${title} ${ebayCategory || ""}`;
  for (const rule of CATEGORY_RULES) {
    const id = rule[rule.length - 1];
    const tests = rule.slice(0, -1);
    if (tests.every((re) => re.test(text))) return id;
  }
  return null;
}

const num = (n) => Number(n?.["#text"] ?? n) || 0;

/** Weight (ounces) and box size (inches) from an eBay item's ShippingPackageDetails. */
function packageOf(item) {
  const pkg = item?.ShippingPackageDetails || {};
  const ounces = num(pkg.WeightMajor) * 16 + num(pkg.WeightMinor);
  const dims = [num(pkg.PackageLength), num(pkg.PackageWidth), num(pkg.PackageDepth)];
  return {
    ounces: ounces > 0 ? ounces : null,
    dimensions: dims.every((d) => d > 0) ? { length: dims[0], width: dims[1], height: dims[2], unit: "inch" } : null,
  };
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return { items: {} }; }
}
function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function getEbayItem(fetcher, token, itemId) {
  const body = `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${itemId}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`;
  const res = await fetch(fetcher.tradingApiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/xml", "X-EBAY-API-SITEID": "0", "X-EBAY-API-COMPATIBILITY-LEVEL": "1155", "X-EBAY-API-CALL-NAME": "GetItem", "X-EBAY-API-IAF-TOKEN": token },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const reply = fetcher.xmlParser.parse(await res.text()).GetItemResponse;
  return Array.isArray(reply?.Item) ? reply.Item[0] : reply?.Item || null;
}

/** A product left half-made by an earlier failed run (same external id), or null. */
async function findByExternalId(whatnot, externalId) {
  let cursor = null;
  for (let i = 0; i < 20; i++) {
    const page = await whatnot.request("GET", `/products?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { ok: [200], step: "list_products" });
    const hit = (page.json?.data || []).find((p) => p.external_id === externalId);
    if (hit) return hit.id;
    cursor = page.json?.next_cursor;
    if (!cursor) return null;
  }
  return null;
}

async function setQuantity(whatnot, productId, quantity) {
  const page = await whatnot.request("GET", `/products/${productId}/variants?limit=50`, { ok: [200], step: "list_variants" });
  const variants = Array.isArray(page.json?.data) ? page.json.data : [];
  if (!variants.length) throw new Error("no variants on Whatnot product");
  await whatnot.syncInventory(variants.map((v) => ({ variant_id: v.id, quantity })));
}

/**
 * @param {{ tenantId: string, live?: boolean, limit?: number, only?: string }} opts
 * live=false only reports what would happen.
 */
async function runWhatnotSync({ tenantId, live = false, limit = Infinity, only = null }) {
  const fetcher = new EbayInventoryFetcher();
  const whatnot = new WhatnotConnector();
  const state = loadState();
  const listed = await fetcher.fetchAllListings(tenantId, {});
  const ebayItems = (listed.items || listed).filter((i) => !only || i.sku === only || String(i.ebayListingId) === only);
  const token = await fetcher.connector._getAccessToken(tenantId);
  const report = { created: [], updated: [], zeroed: [], skipped: [], failed: [] };
  const seen = new Set();
  let createdCount = 0;

  for (const it of ebayItems) {
    const key = it.sku || String(it.ebayListingId);
    seen.add(key);
    const qty = Math.max(0, Number(it.quantity) || 0);
    const known = state.items[key];
    try {
      if (known?.productId) {
        if (known.quantity !== qty) {
          if (live) { await setQuantity(whatnot, known.productId, qty); known.quantity = qty; }
          report.updated.push({ key, quantity: qty });
        }
        continue;
      }
      if (createdCount >= limit) continue;
      const full = await getEbayItem(fetcher, token, it.ebayListingId);
      const ebayCategory = full?.PrimaryCategory?.CategoryName || "";
      const categoryId = categoryFor(it.title, ebayCategory);
      const pkg = packageOf(full);
      if (!categoryId) { report.skipped.push({ key, title: it.title, reason: `no Whatnot category for "${ebayCategory}"` }); continue; }
      if (!pkg.ounces) { report.skipped.push({ key, title: it.title, reason: "no package weight on the eBay listing" }); continue; }
      if (!(Number(it.price) > 0) || qty < 1) { report.skipped.push({ key, title: it.title, reason: "no price or quantity on eBay" }); continue; }
      const product = {
        title: String(it.title).slice(0, 80),
        description: it.description || it.title,
        category_id: categoryId,
        dimension_profile: { weight: { value: pkg.ounces, unit: "ounce" }, ...(pkg.dimensions ? { dimensions: pkg.dimensions } : {}) },
        price: Math.max(1, Math.round(Number(it.price))), // Whatnot takes whole dollars only
        quantity: qty,
        sku: key,
        images: it.imageUrls || (it.imageUrl ? [it.imageUrl] : []),
      };
      if (!live) { report.created.push({ key, title: it.title, categoryId, ounces: pkg.ounces, price: product.price, dryRun: true }); createdCount++; continue; }
      const orphan = await findByExternalId(whatnot, key);
      if (orphan) await whatnot.request("DELETE", `/products/${orphan}`, { ok: [200, 204, 404], step: "remove_unfinished" });
      const res = await whatnot.createListing(product, { dryRun: false, confirm: "PUBLISH_LIVE" });
      state.items[key] = { productId: res.listingId, quantity: qty, url: res.url, createdAt: new Date().toISOString() };
      saveState(state);
      report.created.push({ key, title: it.title, url: res.url });
      createdCount++;
    } catch (err) {
      report.failed.push({ key, title: it.title, error: String(err.message).slice(0, 200) });
    }
  }

  // Sold or ended on eBay: take it to 0 on Whatnot so it can't be sold twice.
  if (!only) {
    for (const [key, known] of Object.entries(state.items)) {
      if (seen.has(key) || !known.productId || known.quantity === 0) continue;
      try {
        if (live) { await setQuantity(whatnot, known.productId, 0); known.quantity = 0; }
        report.zeroed.push({ key });
      } catch (err) {
        report.failed.push({ key, error: String(err.message).slice(0, 200) });
      }
    }
  }
  if (live) { state.lastRun = new Date().toISOString(); saveState(state); }
  return report;
}

// ---------------------------------------------------------------------------------------------
// Used by the 15-minute inventory sync (scripts/inventory-count-sync.js --auto). Quantities only:
// nothing here creates a listing, changes a price or publishes anything.
// ---------------------------------------------------------------------------------------------

const ORDER_OVERLAP_MS = 60 * 60 * 1000; // re-read the last hour of orders each run; handled ids stop double counting
const ORDER_PAGE_LIMIT = 20; // at most 20 pages x 50 orders per run
const SKIP_ORDER_STATUSES = new Set(["cancelled", "failed"]); // nothing was sold

function loadOrdersState() {
  try {
    const s = JSON.parse(fs.readFileSync(ORDERS_STATE_FILE, "utf8"));
    return { checkpoint: s.checkpoint || null, orders: s.orders || {}, items: s.items || {} };
  } catch {
    return { checkpoint: null, orders: {}, items: {} };
  }
}
function saveOrdersState(state) {
  fs.mkdirSync(path.dirname(ORDERS_STATE_FILE), { recursive: true });
  fs.writeFileSync(ORDERS_STATE_FILE, JSON.stringify(state, null, 2));
}

/** eBay listing id for a sync key: the BossListers product's ebay_listing_id, else the id in "ebay-<id>". */
function listingIdFinder(products = []) {
  const bySku = new Map(products.filter((p) => p && p.sku && p.ebay_listing_id).map((p) => [p.sku, String(p.ebay_listing_id)]));
  return (key) => bySku.get(key) || (/^ebay-(\d+)$/.exec(key) || [])[1] || null;
}

async function listAll(whatnot, basePath, step, { stopWhen } = {}) {
  const out = [];
  let cursor = null;
  for (let i = 0; i < ORDER_PAGE_LIMIT; i++) {
    const sep = basePath.includes("?") ? "&" : "?";
    const page = await whatnot.request("GET", `${basePath}${sep}limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { ok: [200], step });
    const data = Array.isArray(page.json?.data) ? page.json.data : [];
    for (const row of data) {
      if (stopWhen && stopWhen(row)) return out;
      out.push(row);
    }
    cursor = page.json?.next_cursor;
    if (!cursor) return out;
  }
  return out;
}

/**
 * Direction 1: sold on Whatnot -> lower eBay. Reads new Whatnot orders (GET /orders, newest first,
 * paged) and, for each sold item that is synced from eBay, lowers that eBay listing's quantity by
 * the units sold (or ends the listing on its last unit). eBay is lowered here and in the eBay map
 * the sync already read; the sync's own count step then lowers the BossListers database to match
 * (eBay below its baseline = a sale). Every handled order and order item is recorded so a sale is
 * never counted twice. An order whose eBay change failed is left unrecorded and retried next run.
 *
 * @param {{ whatnot: object, syncState: {items: object}, ordersState: object, ebayMap: Map<string, number>,
 *           listingIdFor: (key: string) => string|null, enabled: boolean,
 *           changeEbay: { set: (listingId: string, qty: number) => Promise<void>, end: (listingId: string) => Promise<void> },
 *           saveOrders?: (state: object) => void, logChange?: (entry: object) => void, now?: Date }} opts
 */
async function applyWhatnotOrders({ whatnot, syncState, ordersState, ebayMap, listingIdFor, enabled, changeEbay, saveOrders = () => {}, logChange = () => {}, now = new Date() }) {
  const result = { ordersRead: 0, ebayLowered: [], held: [], failed: [] };
  const items = Object.entries(syncState.items || {}).filter(([, v]) => v && v.productId);
  if (!items.length) return result;
  const keyByProduct = new Map(items.map(([key, v]) => [String(v.productId), key]));
  const keyFor = (it) =>
    keyByProduct.get(String(it.product_id)) ||
    [it.product_external_id, it.variant_external_id, it.purchased_item && it.purchased_item.sku].find((k) => k && syncState.items[k]?.productId) ||
    null;

  // First run: start at the oldest synced Whatnot product, since no order can be older than that.
  const oldestProduct = Math.min(...items.map(([, v]) => Date.parse(v.createdAt) || now.getTime()));
  const since = (ordersState.checkpoint ? Date.parse(ordersState.checkpoint) : oldestProduct) - ORDER_OVERLAP_MS;

  let orders;
  try {
    orders = await listAll(whatnot, "/orders", "list_orders", { stopWhen: (o) => o.created_at && Date.parse(o.created_at) < since });
  } catch (err) {
    result.failed.push({ reason: `Whatnot orders: ${String(err.message).slice(0, 200)}` });
    return result;
  }
  result.ordersRead = orders.length;
  let newest = ordersState.checkpoint ? Date.parse(ordersState.checkpoint) : null;
  let oldestUnfinished = null;

  for (const order of orders.slice().reverse()) { // oldest first
    const created = order.created_at ? Date.parse(order.created_at) : null;
    if (created && (!newest || created > newest)) newest = created;
    if (ordersState.orders[order.id]) continue;
    if (SKIP_ORDER_STATUSES.has(order.status)) {
      ordersState.orders[order.id] = { at: now.toISOString(), status: order.status, note: "not sold" };
      saveOrders(ordersState);
      continue;
    }
    let done = true;
    let lines;
    try {
      lines = await listAll(whatnot, `/orders/${encodeURIComponent(order.id)}/items`, "list_order_items");
    } catch (err) {
      result.failed.push({ order: order.id, reason: `Whatnot order items: ${String(err.message).slice(0, 200)}` });
      done = false;
      lines = [];
    }
    for (const line of lines) {
      const itemKey = `${order.id}:${line.id}`;
      if (ordersState.items[itemKey]) continue;
      const key = keyFor(line);
      if (!key) { ordersState.items[itemKey] = { at: now.toISOString(), note: "not an eBay-synced item" }; continue; }
      const sold = Math.max(1, Number(line.quantity) || 1);
      const listingId = listingIdFor(key);
      const live = listingId ? ebayMap.get(listingId) : undefined;
      if (live === undefined) {
        ordersState.items[itemKey] = { at: now.toISOString(), sku: key, sold, note: "already off eBay" };
        logChange({ whatnot: "order", order: order.id, sku: key, sold, ebay: "not live, nothing to lower" });
        continue;
      }
      if (!enabled) {
        result.held.push({ sku: key, reason: `Whatnot order ${order.id} sold ${sold}; eBay changes from Whatnot sales are switched off` });
        done = false;
        continue;
      }
      const to = Math.max(0, live - sold);
      try {
        if (to > 0) await changeEbay.set(listingId, to);
        else await changeEbay.end(listingId);
        if (to > 0) ebayMap.set(listingId, to);
        else ebayMap.delete(listingId);
        ordersState.items[itemKey] = { at: now.toISOString(), sku: key, sold, ebay: `${live}>${to}` };
        result.ebayLowered.push({ sku: key, order: order.id, from: live, to, ended: to === 0 });
        logChange({ whatnot: "order", order: order.id, sku: key, sold, ebay: to > 0 ? `${live} -> ${to}` : `${live} -> 0, listing ended` });
      } catch (err) {
        result.failed.push({ sku: key, order: order.id, reason: `eBay: ${String(err.message).slice(0, 200)}` });
        done = false;
      }
    }
    if (done) ordersState.orders[order.id] = { at: now.toISOString(), status: order.status };
    else if (created && (!oldestUnfinished || created < oldestUnfinished)) oldestUnfinished = created;
    saveOrders(ordersState); // after every order, so a crash can't count it again
  }

  const checkpoint = oldestUnfinished ? Math.min(oldestUnfinished, newest || oldestUnfinished) : newest;
  if (checkpoint) ordersState.checkpoint = new Date(checkpoint).toISOString();
  // Keep the handled lists small: anything well before the checkpoint can no longer be re-read.
  const keepAfter = (Date.parse(ordersState.checkpoint || now.toISOString()) || now.getTime()) - 7 * 24 * 3600 * 1000;
  for (const bag of [ordersState.orders, ordersState.items]) {
    for (const [id, v] of Object.entries(bag)) if (Date.parse(v.at) < keepAfter) delete bag[id];
  }
  saveOrders(ordersState);
  return result;
}

/**
 * Direction 2: sold or ended on eBay -> lower Whatnot. For every product in whatnot-sync-state.json,
 * the Whatnot quantity follows eBay (0 when the eBay listing is gone). It only ever LOWERS a
 * quantity, so an item Josh holds at 0 stays at 0; it raises one only when that item is marked
 * "released": true in the state file. A listing missing from eBay's list is only zeroed when eBay
 * itself says it sold or ended, and never when the eBay read looked bad (plan blocked).
 *
 * @param {{ whatnot: object, syncState: {items: object}, ebayMap: Map<string, number>, listingIdFor: Function,
 *           blocked?: string|null, whyGone?: (listingId: string) => Promise<string>,
 *           saveSync?: (state: object) => void, logChange?: (entry: object) => void }} opts
 */
async function pushWhatnotQuantities({ whatnot, syncState, ebayMap, listingIdFor, blocked = null, whyGone = async () => "unknown", saveSync = () => {}, logChange = () => {} }) {
  const result = { lowered: [], raised: [], held: [], failed: [] };
  let changed = false;
  for (const [key, known] of Object.entries(syncState.items || {})) {
    if (!known || !known.productId) continue;
    try {
      const listingId = listingIdFor(key);
      const live = listingId ? ebayMap.get(listingId) : undefined;
      const target = live === undefined ? 0 : Math.max(0, Number(live) || 0);
      const page = await whatnot.request("GET", `/products/${encodeURIComponent(known.productId)}/variants?limit=50`, { ok: [200], step: "list_variants" });
      const variants = Array.isArray(page.json?.data) ? page.json.data : [];
      if (!variants.length) { result.failed.push({ sku: key, reason: "Whatnot: no variants on the product" }); continue; }
      const writes = [];
      let goneChecked = null;
      for (const v of variants) {
        const current = v.inventory?.available_quantity;
        if (!Number.isInteger(current)) { result.failed.push({ sku: key, reason: "Whatnot did not report a quantity" }); continue; }
        if (current === target) continue;
        if (target > current && known.released !== true) continue; // held on purpose: never raised
        if (target < current && live === undefined) {
          if (blocked) { result.held.push({ sku: key, reason: `not zeroed on Whatnot: eBay read looked bad (${blocked})` }); continue; }
          goneChecked = goneChecked || (await whyGone(listingId).catch(() => "unknown"));
          if (goneChecked !== "sold" && goneChecked !== "ended") { result.held.push({ sku: key, reason: `missing from eBay's live list, but eBay reports it as "${goneChecked}"; Whatnot left at ${current}` }); continue; }
        }
        writes.push({ variant_id: v.id, quantity: target, from: current });
      }
      if (!writes.length) continue;
      const out = await whatnot.syncInventory(writes.map((w) => ({ variant_id: w.variant_id, quantity: w.quantity })));
      const results = Array.isArray(out?.results) ? out.results : [];
      writes.forEach((w, i) => {
        const r = results[i] || {};
        const ok = r.status === "applied" || r.status === "already_applied" || (!r.status && !r.error);
        if (!ok) { result.failed.push({ sku: key, reason: `Whatnot refused the quantity: ${r.status || r.error || "no result"}` }); return; }
        const from = Number.isInteger(r.previous_quantity) ? r.previous_quantity : w.from;
        const to = Number.isInteger(r.new_quantity) ? r.new_quantity : w.quantity;
        (to < from ? result.lowered : result.raised).push({ sku: key, from, to });
        logChange({ whatnot: "quantity", sku: key, product: String(known.productId), from, to, why: live === undefined ? "gone from eBay" : `eBay has ${live}` });
        known.quantity = to;
        changed = true;
      });
    } catch (err) {
      result.failed.push({ sku: key, reason: `Whatnot: ${String(err.message).slice(0, 200)}` });
    }
  }
  if (changed) saveSync(syncState);
  return result;
}

module.exports = {
  runWhatnotSync,
  categoryFor,
  packageOf,
  applyWhatnotOrders,
  pushWhatnotQuantities,
  listingIdFinder,
  loadState,
  saveState,
  loadOrdersState,
  saveOrdersState,
};
