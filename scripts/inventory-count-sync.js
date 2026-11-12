#!/usr/bin/env node
// Quantity sync: one unit count per SKU, shared by eBay and the BossListers database (which
// feeds the storefront). A sale anywhere lowers the count everywhere.
//
//   node scripts/inventory-count-sync.js                 preview only, changes nothing
//   node scripts/inventory-count-sync.js --sku ebay-123   preview one item
//   node scripts/inventory-count-sync.js --live --sku ebay-123 --confirm SYNC_ONE_ITEM
//
//   Shopify is left out: Josh stopped using it on 2026-11-11. --with-shopify turns that leg back on.
//
// Live mode works on ONE named SKU at a time and needs migration 0022 applied
// (set_inventory_count). It refuses to run if the plan is blocked. It never ends an eBay
// listing by itself: when eBay must go to zero it says so and leaves that to Josh.
const { loadEnvConfig } = require("@next/env");
const { XMLParser } = require("fast-xml-parser");
const { planCounts, classifyEbayItem } = require("../lib/inventoryCountPlan");

const CONFIRM_WORD = "SYNC_ONE_ITEM";
const SHOPIFY_API = "2024-10";

function parseArgs(argv) {
  const get = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  return { live: argv.includes("--live"), confirm: get("--confirm"), sku: get("--sku") || null, shopify: argv.includes("--with-shopify") };
}

async function readEbay(tenantId) {
  const { EbayInventoryFetcher } = require("../lib/ebayInventoryFetcher");
  const fetcher = new EbayInventoryFetcher();
  const listings = await fetcher.fetchAllListings(tenantId, {});
  const map = new Map();
  for (const l of listings) if (l.ebayListingId) map.set(String(l.ebayListingId), Number(l.quantity));
  return { map, fetcher };
}

async function readShopify() {
  const { ShopifyConnector } = require("../lib/channels/apiConnectors");
  const connector = new ShopifyConnector();
  const token = await connector._getValidAdminToken();
  const origin = ShopifyConnector.normalizeStoreOrigin(process.env.SHOPIFY_STORE_URL);
  const gql = async (query, variables) => {
    const res = await fetch(`${origin}/admin/api/${SHOPIFY_API}/graphql.json`, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.errors) throw new Error(`Shopify GraphQL failed (HTTP ${res.status}): ${JSON.stringify(json.errors || {}).slice(0, 200)}`);
    return json.data;
  };
  const map = new Map();
  let after = null;
  do {
    const data = await gql(
      `query($a:String){ products(first:100, after:$a){ pageInfo{hasNextPage endCursor}
         nodes{ status totalInventory variants(first:1){ nodes{ sku inventoryItem{ id } } } } } }`,
      { a: after },
    );
    for (const p of data.products.nodes) {
      const v = p.variants.nodes[0];
      if (v && v.sku) map.set(v.sku, { qty: p.totalInventory, status: p.status, inventoryItemId: v.inventoryItem.id });
    }
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after);
  return { map, gql };
}

/**
 * Sets a product's total Shopify stock. Stock can sit at more than one location, so this reads
 * every location's level, puts the whole count at the location holding the most, and zeroes the
 * rest. Each write is compare-and-set against the level just read, so a sale in between is
 * refused (COMPARE_QUANTITY_STALE) instead of overwritten.
 */
async function setShopify(gql, inventoryItemId, quantity) {
  const data = await gql(
    `query($id:ID!){ inventoryItem(id:$id){ inventoryLevels(first:20){ nodes{ location{ id name } quantities(names:["available"]){ quantity } } } } }`,
    { id: inventoryItemId },
  );
  const levels = data.inventoryItem.inventoryLevels.nodes.map((n) => ({ locationId: n.location.id, name: n.location.name, have: n.quantities[0].quantity }));
  if (!levels.length) throw new Error("Shopify has no stock location for this item");
  const main = levels.reduce((best, l) => (l.have > best.have ? l : best), levels[0]);
  const quantities = levels
    .map((l) => ({ inventoryItemId, locationId: l.locationId, quantity: l === main ? quantity : 0, compareQuantity: l.have }))
    .filter((q) => q.quantity !== q.compareQuantity);
  if (!quantities.length) return { changed: [] };
  const out = await gql(
    `mutation($input: InventorySetQuantitiesInput!){ inventorySetQuantities(input:$input){ userErrors{ code message } } }`,
    { input: { name: "available", reason: "correction", quantities } },
  );
  const errors = out.inventorySetQuantities.userErrors;
  if (errors.length) throw new Error(`Shopify refused the count: ${errors.map((e) => e.code || e.message).join(", ")}`);
  return { changed: quantities.map((q) => ({ location: levels.find((l) => l.locationId === q.locationId).name, from: q.compareQuantity, to: q.quantity })) };
}

async function setEbay(fetcher, tenantId, itemId, quantity) {
  const token = await fetcher.connector._getAccessToken(tenantId);
  const body =
    `<?xml version="1.0" encoding="utf-8"?><ReviseInventoryStatusRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<InventoryStatus><ItemID>${Number(itemId)}</ItemID><Quantity>${Number(quantity)}</Quantity></InventoryStatus></ReviseInventoryStatusRequest>`;
  const res = await fetch(fetcher.tradingApiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/xml", "X-EBAY-API-SITEID": "0", "X-EBAY-API-COMPATIBILITY-LEVEL": "1155", "X-EBAY-API-CALL-NAME": "ReviseInventoryStatus", "X-EBAY-API-IAF-TOKEN": token },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const parsed = new XMLParser().parse(await res.text()).ReviseInventoryStatusResponse;
  if (!res.ok || !parsed || parsed.Ack === "Failure") throw new Error(`eBay refused the count (HTTP ${res.status}): ${JSON.stringify(parsed && parsed.Errors).slice(0, 200)}`);
}

/** Asks eBay about one listing that is missing from the active list: sold, ended, active or unknown. Read-only. */
async function whyGone(fetcher, tenantId, itemId) {
  const token = await fetcher.connector._getAccessToken(tenantId);
  const res = await fetch(fetcher.tradingApiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/xml", "X-EBAY-API-SITEID": "0", "X-EBAY-API-COMPATIBILITY-LEVEL": "1155", "X-EBAY-API-CALL-NAME": "GetItem", "X-EBAY-API-IAF-TOKEN": token },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${Number(itemId)}</ItemID></GetItemRequest>`,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return "unknown";
  const response = new XMLParser().parse(await res.text()).GetItemResponse;
  return classifyEbayItem(response && [].concat(response.Item || [])[0]);
}

function printPlan(plan, onlySku) {
  const s = plan.summary;
  console.log(`counted ${s.counted} | to change ${s.changed} | gone from eBay ${s.gone} | oversold ${s.oversold} | errors ${s.errors} | left out ${plan.skipped.length}`);
  if (plan.blocked) console.log(`BLOCKED: ${plan.blocked}`);
  for (const i of plan.items) {
    if (onlySku ? i.sku !== onlySku : !i.actions.length && !i.error) continue;
    const acts = i.actions.map((a) => (a.manual ? `${a.channel}: ${a.manual}` : `${a.channel} -> ${a.set}`)).join("; ") || "no change";
    console.log(`  ${i.sku.padEnd(20)} count ${i.dbQty} -> ${i.newQty} | ${i.error || acts}${i.notes.length ? " | " + i.notes.join("; ") : ""}`);
  }
}

async function main() {
  loadEnvConfig(process.cwd());
  const args = parseArgs(process.argv.slice(2));
  const tenantId = process.env.PLATFORM_OWNER_TENANT_ID;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!tenantId || !url || !key) throw new Error("Need PLATFORM_OWNER_TENANT_ID, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  if (args.live && (args.confirm !== CONFIRM_WORD || !args.sku)) throw new Error(`Live mode needs --sku <one SKU> and --confirm ${CONFIRM_WORD}. Nothing was changed.`);

  const rest = async (path, opts = {}) => {
    const res = await fetch(`${url}/rest/v1/${path}`, { ...opts, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(opts.headers || {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${opts.method || "GET"} ${path.split("?")[0]} failed (${res.status}) ${text.slice(0, 160)}`);
    return text ? JSON.parse(text) : null;
  };

  const log = console.log;
  console.log = () => {}; // the fetchers are chatty; keep the report readable
  let products, listings, ebay, shopify;
  try {
    products = await rest(`products?select=id,sku,quantity,status,ebay_listing_id,last_ebay_quantity&tenant_id=eq.${tenantId}&limit=5000`);
    listings = await rest(`marketplace_listings?select=id,product_id,listed_quantity&marketplace=eq.shopify&tenant_id=eq.${tenantId}&limit=5000`);
    ebay = await readEbay(tenantId);
    shopify = args.shopify ? await readShopify() : { map: new Map(), gql: null }; // default: eBay and the database only
  } finally {
    console.log = log;
  }
  const listingByProduct = new Map(listings.map((r) => [r.product_id, r]));
  const rows = products.map((p) => ({ ...p, shopify_baseline: listingByProduct.get(p.id)?.listed_quantity ?? null }));
  const config = require("../config/inventory-sync.json");
  const plan = planCounts({ products: rows, ebay: ebay.map, shopify: shopify.map, digitalSkus: config.digitalSkus || [] });

  console.log(`eBay live listings: ${ebay.map.size} | Shopify products: ${shopify.map.size} | database products: ${products.length}`);
  printPlan(plan, args.sku);
  if (!args.live) { console.log(`\nPREVIEW ONLY. Nothing was changed.`); return; }

  if (plan.blocked) throw new Error("Plan is blocked. Nothing was changed.");
  const item = plan.items.find((i) => i.sku === args.sku);
  if (!item) throw new Error(`${args.sku} is not a counted product. Nothing was changed.`);
  if (item.error) throw new Error(`${args.sku}: ${item.error}. Nothing was changed.`);
  const product = rows.find((p) => p.sku === args.sku);
  const ebayLive = ebay.map.get(item.ebayListingId);

  // A listing missing from the active list is only zeroed when eBay itself says it sold or ended.
  if (item.ebayGone && item.newQty !== item.dbQty) {
    const why = await whyGone(ebay.fetcher, tenantId, item.ebayListingId).catch(() => "unknown");
    if (why !== "sold" && why !== "ended") throw new Error(`${args.sku} is missing from eBay's active list but eBay reports it as "${why}". Nothing was changed.`);
    item.notes.push(`eBay says: ${why}`);
    console.log(`  eBay says this listing is ${why}`);
  }

  // 1. Database first, atomically. If this does not apply, no channel is touched.
  if (item.newQty !== item.dbQty) {
    const runId = `${args.sku}:${item.dbQty}>${item.newQty}:${new Date().toISOString().slice(0, 16)}`;
    const out = await rest("rpc/set_inventory_count", {
      method: "POST",
      body: JSON.stringify({ p_tenant_id: tenantId, p_sku: args.sku, p_expected: item.dbQty, p_new: item.newQty, p_source: "reconcile", p_external_id: runId, p_ebay_baseline: ebayLive ?? 0, p_note: item.notes.join("; ") || null }),
    });
    const r = Array.isArray(out) ? out[0] : out;
    if (!r || !r.applied) throw new Error(`Database did not apply the count (${r ? r.reason : "no answer"}). No channel was changed.`);
    console.log(`  database: ${item.dbQty} -> ${item.newQty}`);
  }
  // 2. Channels. Each failure is reported; the next preview run shows what is still off.
  for (const a of item.actions) {
    try {
      if (a.channel === "shopify") { await setShopify(shopify.gql, shopify.map.get(args.sku).inventoryItemId, a.set); console.log(`  Shopify: -> ${a.set}`); }
      if (a.channel === "ebay" && a.manual) console.log(`  eBay: NOT changed. Josh needs to ${a.manual} (item ${item.ebayListingId}).`);
      if (a.channel === "ebay" && !a.manual) { await setEbay(ebay.fetcher, tenantId, item.ebayListingId, a.set); console.log(`  eBay: -> ${a.set}`); }
    } catch (err) {
      console.log(`  ${a.channel}: FAILED ${err.message}`);
      process.exitCode = 1;
    }
  }
  // 3. Record the Shopify baseline so the next run can tell a sale from drift.
  const listing = listingByProduct.get(product.id);
  if (args.shopify && listing && !process.exitCode) {
    await rest(`marketplace_listings?id=eq.${listing.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ listed_quantity: item.newQty, last_synced_at: new Date().toISOString() }) });
  }
  console.log(process.exitCode ? "\nDONE WITH FAILURES: run the preview again." : "\nDONE.");
}

module.exports = { parseArgs, readShopify, setShopify, whyGone, CONFIRM_WORD };

if (require.main === module) {
  main().catch((err) => { console.error(`ERROR: ${err.message}`); process.exit(1); });
}
