// lib/supabaseInventory.js
// Server-side bridge from Boss Listers MVP to the shared Empire OS
// inventory database (Supabase Postgres `products` table) — the same
// table the eBay sync writes and the website storefront reads.
//
// SERVER-SIDE ONLY: uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
// Must only ever be imported from pages/api/* (Next.js API routes run on
// the server). Never import from a page/component.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertConfigured() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    const err = new Error(
      "Supabase not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side env only)"
    );
    err.statusCode = 503;
    throw err;
  }
}

async function rest(path, options = {}) {
  assertConfigured();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    const err = new Error(`Supabase ${options.method || "GET"} ${path} failed (${res.status}): ${detail}`);
    err.statusCode = 502;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/**
 * Publishes a generated listing into the shared inventory as a manual
 * (non-eBay) product. Idempotent on SKU. Items later claimed by the eBay
 * sync (source flips to "ebay") become read-only from this app's side.
 */
async function publishToInventory(listing) {
  const { sku, title, description, price, quantity, imageUrl, condition } = listing;
  if (!sku || !title || typeof price !== "number") {
    const err = new Error("publishToInventory requires sku, title, and numeric price");
    err.statusCode = 400;
    throw err;
  }
  const row = {
    sku,
    title,
    description: description || null,
    price,
    quantity: Number.isInteger(quantity) ? quantity : 1,
    image_url: imageUrl || null,
    condition: condition || null,
    status: "active",
    source: "manual",
    published: true,
  };
  return rest("products?on_conflict=sku", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
}

/** Lists shared-inventory products (both eBay-synced and manual). */
async function listInventory() {
  return rest("products?select=sku,title,price,quantity,status,source,ebay_listing_id,slug,updated_at&order=updated_at.desc&limit=200");
}

/** Lists channel connection rows (metadata only — table holds no secrets). */
async function listChannelAccounts() {
  return rest("marketplace_accounts?select=marketplace,account_label,environment,status,connection_mode,last_sync_at,last_error&order=marketplace.asc");
}

/**
 * Records a manual-listing lifecycle change (Ready to Post / Posted / Sold /
 * Ended) in marketplace_listings. Idempotent per (product, account):
 * repeats update the same row instead of duplicating it.
 */
async function upsertManualListing({ sku, marketplace, status, listingUrl, listingId, notes }) {
  const allowed = ["draft", "ready_to_post", "posted", "sold", "ended"];
  if (!allowed.includes(status)) {
    const err = new Error(`status must be one of: ${allowed.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }
  const products = await rest(`products?select=id&sku=eq.${encodeURIComponent(sku)}&limit=1`);
  if (!products.length) {
    const err = new Error(`Unknown SKU: ${sku}`);
    err.statusCode = 404;
    throw err;
  }
  const accounts = await rest(
    `marketplace_accounts?select=id&marketplace=eq.${encodeURIComponent(marketplace)}&account_label=eq.manual&limit=1`
  );
  if (!accounts.length) {
    const err = new Error(`No manual channel row for: ${marketplace} (run migration 0004)`);
    err.statusCode = 404;
    throw err;
  }
  const row = {
    product_id: products[0].id,
    account_id: accounts[0].id,
    marketplace,
    status,
    listing_id: listingId || null,
    listing_url: listingUrl || null,
    posted_at: status === "posted" ? new Date().toISOString() : undefined,
    sold_at: status === "sold" ? new Date().toISOString() : undefined,
    notes: notes || undefined,
  };
  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
  return rest("marketplace_listings?on_conflict=product_id,account_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
}

module.exports = { publishToInventory, listInventory, listChannelAccounts, upsertManualListing };
