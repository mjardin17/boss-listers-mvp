#!/usr/bin/env node
// scripts/push-all-to-shopify.js
// Pushes the products already in BossListers (eBay imports + manual) to Shopify,
// one Shopify product per SKU, skipping anything Shopify already has.
//
//   node scripts/push-all-to-shopify.js                     preview only (default, changes nothing)
//   node scripts/push-all-to-shopify.js --limit 3           preview the first 3
//   node scripts/push-all-to-shopify.js --live --confirm PUSH_TO_SHOPIFY --limit 3
//   node scripts/push-all-to-shopify.js --live --confirm PUSH_TO_SHOPIFY      all eligible
//   flags: --sku a,b   only these SKUs     --no-social   do not publish to TikTok/FB/IG channels
//
// Live mode requires BOTH --live and --confirm PUSH_TO_SHOPIFY. It never creates a
// duplicate: a SKU already in Shopify, or already recorded as posted, is skipped.

const { loadEnvConfig } = require("@next/env");

const CONFIRM_WORD = "PUSH_TO_SHOPIFY";
const DELAY_MS = 700; // stay well under Shopify's request rate limit
const MAX_CONSECUTIVE_FAILURES = 5;
const MIN_PLAUSIBLE_PRICE = 1; // a price under $1 is almost always a test value, never push it

/** Splits products into what can be pushed and what is skipped, with the reason for each skip. */
function planPush(products, shopifySkus, postedSkus = new Set(), onlySkus = null) {
  const eligible = [];
  const skipped = [];
  const have = new Set([...shopifySkus].map((s) => String(s).toLowerCase()));
  for (const p of products) {
    const sku = String(p.sku || "");
    const why = [];
    if (onlySkus && !onlySkus.has(sku)) continue;
    if (!sku) why.push("no SKU");
    else if (have.has(sku.toLowerCase())) why.push("already in Shopify");
    else if (postedSkus.has(sku)) why.push("already recorded as posted");
    if (!p.title || !String(p.title).trim()) why.push("no title");
    if (!(Number(p.price) > 0)) why.push("no price");
    else if (Number(p.price) < MIN_PLAUSIBLE_PRICE) why.push("price under $1 (test price?)");
    if (!/^https:\/\//.test(String(p.image_url || ""))) why.push("no public photo");
    if (p.status && p.status !== "active") why.push(`status ${p.status}`);
    (why.length ? skipped : eligible).push(why.length ? { sku, title: p.title, why } : p);
  }
  return { eligible, skipped };
}

function parseArgs(argv) {
  const get = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  return {
    live: argv.includes("--live"),
    confirm: get("--confirm"),
    limit: get("--limit") ? Number(get("--limit")) : Infinity,
    only: get("--sku") ? new Set(get("--sku").split(",").map((s) => s.trim()).filter(Boolean)) : null,
    social: !argv.includes("--no-social"),
  };
}

async function main() {
  loadEnvConfig(process.cwd());
  const args = parseArgs(process.argv.slice(2));
  const tenantId = process.env.PLATFORM_OWNER_TENANT_ID;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!tenantId || !url || !key) throw new Error("Need PLATFORM_OWNER_TENANT_ID, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  if (args.live && args.confirm !== CONFIRM_WORD) throw new Error(`Live mode needs --confirm ${CONFIRM_WORD}. Nothing was changed.`);

  const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const rest = async (path, opts = {}) => {
    const res = await fetch(`${url}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
    if (!res.ok) throw new Error(`Supabase ${opts.method || "GET"} ${path.split("?")[0]} failed (${res.status})`);
    return res.status === 204 ? null : res.json();
  };

  const { ShopifyConnector } = require("../lib/channels/apiConnectors");
  const shopify = new ShopifyConnector();

  const products = await rest(`products?select=*&tenant_id=eq.${tenantId}&order=updated_at.desc&limit=2000`);
  const shopifyProducts = await shopify.fetchProducts(tenantId);
  const posted = await rest(`marketplace_listings?select=product_id,status&marketplace=eq.shopify&status=eq.posted&limit=5000`).catch(() => []);
  const idToSku = new Map(products.map((p) => [p.id, p.sku]));
  const postedSkus = new Set(posted.map((r) => idToSku.get(r.product_id)).filter(Boolean));

  const { eligible, skipped } = planPush(products, shopifyProducts.map((p) => p.sku).filter(Boolean), postedSkus, args.only);
  const batch = eligible.slice(0, args.limit);

  console.log(`BossListers products: ${products.length} | already in Shopify: ${shopifyProducts.length} | can push: ${eligible.length} | skipped: ${skipped.length}`);
  const why = {};
  skipped.forEach((s) => s.why.forEach((w) => { why[w] = (why[w] || 0) + 1; }));
  console.log("skipped because:", JSON.stringify(why));
  console.log(`this run will ${args.live ? "CREATE" : "preview"}: ${batch.length} product(s)${args.social ? " (and publish to TikTok/Facebook/Instagram channels)" : ""}\n`);

  if (!args.live) {
    for (const p of batch) console.log(`  would create  ${p.sku.padEnd(22)} $${String(p.price).padEnd(7)} ${String(p.title).slice(0, 60)}`);
    if (batch[0]) {
      const preview = await shopify.createListing({ ...batch[0], tenantId }, { dryRun: true });
      console.log("\nexample Shopify payload for the first item:\n" + JSON.stringify(preview.payload.product, null, 2).slice(0, 700));
    }
    console.log(`\nPREVIEW ONLY. Nothing was created. To create: add  --live --confirm ${CONFIRM_WORD}  (start with --limit 3).`);
    return;
  }

  let ok = 0, failed = 0, consecutive = 0;
  for (const p of batch) {
    try {
      const result = await shopify.createListing({ ...p, tenantId }, { dryRun: false, publishToSocial: args.social });
      if (!result || !result.listingId) throw new Error("Shopify returned no product id");
      await rest("marketplace_listings", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ tenant_id: tenantId, product_id: p.id, marketplace: "shopify", status: "posted", listing_id: result.listingId, listing_url: result.url || null, posted_at: new Date().toISOString(), notes: "Bulk push from BossListers" }),
      }).catch((e) => console.error("   (could not record listing row: " + e.message + ")"));
      ok++; consecutive = 0;
      const ch = result.channels ? " channels=" + Object.entries(result.channels).map(([k, v]) => `${k}:${v.published ? "yes" : v.reason}`).join(",") : "";
      const st = result.stock ? (result.stock.set ? ` stock=${result.stock.available}` : ` STOCK-NOT-SET(${result.stock.reason})`) : "";
      console.log(`  CREATED  ${p.sku.padEnd(22)} -> Shopify ${result.listingId}${st}${ch}`);
    } catch (err) {
      failed++; consecutive++;
      console.log(`  FAILED   ${p.sku.padEnd(22)} ${err.message}`);
      if (consecutive >= MAX_CONSECUTIVE_FAILURES) { console.log(`\nStopping: ${MAX_CONSECUTIVE_FAILURES} failures in a row.`); break; }
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  console.log(`\nDONE: ${ok} created, ${failed} failed, ${eligible.length - ok} still to push.`);
}

module.exports = { planPush, parseArgs };

if (require.main === module) {
  main().catch((err) => { console.error("push-all-to-shopify:", err.message); process.exit(1); });
}
