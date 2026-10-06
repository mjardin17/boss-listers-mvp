// lib/supabaseInventory.js
// Server-side bridge from Boss Listers MVP to the shared Empire OS
// inventory database (Supabase Postgres `products` table) — the same
// table the eBay sync writes and the website storefront reads.
//
// SERVER-SIDE ONLY: uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
// Must only ever be imported from pages/api/* (Next.js API routes run on
// the server). Never import from a page/component.

const { ensurePublicUrl } = require("./supabaseStorage");

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

// Upstream detail (Supabase error bodies) is logged server-side only and never
// placed in err.message, because route handlers return err.message to clients.
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
    console.error(
      `[supabaseInventory] ${options.method || "GET"} ${path.split("?")[0]} failed (${res.status}): ${detail}`
    );
    const err = new Error("Database request failed");
    err.statusCode = 502;
    try {
      err.pgCode = JSON.parse(detail).code;
    } catch {
      // non-JSON error body
    }
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/** Every query in this module is tenant-scoped; refuse to run without one. */
function requireTenantId(tenantId) {
  if (!tenantId || typeof tenantId !== "string") {
    const err = new Error("tenantId is required");
    err.statusCode = 403;
    throw err;
  }
  return encodeURIComponent(tenantId);
}

/**
 * Tenant-scoped product upsert keyed on (tenant_id, sku).
 *
 * products.sku is still globally UNIQUE in the database (0007 only moved the
 * slug constraint per-tenant), so `on_conflict=sku` would let one tenant
 * overwrite another tenant's row. Instead: look the row up inside the tenant,
 * PATCH it if found, else INSERT with the tenant_id forced from the session.
 * A SKU already owned by a different tenant fails with 409 (no detail leaked).
 * Recommended migration: unique (tenant_id, sku) — see report.
 */
async function upsertTenantProduct(tenantId, row) {
  const t = requireTenantId(tenantId);
  const sku = encodeURIComponent(row.sku);
  const returnRep = { Prefer: "return=representation" };
  const { tenant_id: _ignored, ...fields } = row; // never trust a caller-supplied tenant_id

  const patchExisting = async () => {
    const existing = await rest(`products?select=id&sku=eq.${sku}&tenant_id=eq.${t}&limit=1`);
    if (!existing.length) return null;
    return rest(`products?sku=eq.${sku}&tenant_id=eq.${t}`, {
      method: "PATCH",
      headers: returnRep,
      body: JSON.stringify(fields),
    });
  };

  const updated = await patchExisting();
  if (updated) return updated;
  try {
    return await rest("products", {
      method: "POST",
      headers: returnRep,
      body: JSON.stringify({ ...fields, tenant_id: tenantId }),
    });
  } catch (err) {
    if (err.pgCode !== "23505") throw err;
    // Lost a race with a concurrent insert in our own tenant, or the SKU
    // belongs to another tenant.
    const raced = await patchExisting();
    if (raced) return raced;
    const conflict = new Error("That SKU is already in use");
    conflict.statusCode = 409;
    throw conflict;
  }
}

/**
 * Publishes a generated listing into the tenant's inventory as a manual
 * (non-eBay) product. Idempotent on (tenant, SKU). Items later claimed by the
 * eBay sync (source flips to "ebay") become read-only from this app's side.
 */
async function publishToInventory(listing, tenantId) {
  requireTenantId(tenantId);
  const { sku, title, description, price, quantity, imageUrl, condition } = listing || {};
  if (!sku || !title || typeof price !== "number") {
    const err = new Error("publishToInventory requires sku, title, and numeric price");
    err.statusCode = 400;
    throw err;
  }
  const resolvedImageUrl = await ensurePublicUrl(imageUrl);
  const row = {
    sku,
    title,
    description: description || null,
    price,
    quantity: Number.isInteger(quantity) ? quantity : 1,
    image_url: resolvedImageUrl || null,
    condition: condition || null,
    status: "active",
    source: "manual",
    published: true,
  };
  return upsertTenantProduct(tenantId, row);
}

/** Lists the tenant's inventory products (both eBay-synced and manual). */
async function listInventory(tenantId) {
  const t = requireTenantId(tenantId);
  return rest(
    `products?select=sku,title,price,quantity,status,source,ebay_listing_id,slug,updated_at&tenant_id=eq.${t}&order=updated_at.desc&limit=200`
  );
}

/** Lists the tenant's channel connection rows (metadata only — table holds no secrets). */
async function listChannelAccounts(tenantId) {
  const t = requireTenantId(tenantId);
  return rest(
    `marketplace_accounts?select=marketplace,account_label,environment,status,connection_mode,last_sync_at,last_error&tenant_id=eq.${t}&order=marketplace.asc`
  );
}

/**
 * Finds this tenant's manual channel row for a marketplace, creating it on
 * first use (the 0004 seed rows only exist for the default tenant).
 */
async function ensureManualAccount(tenantId, marketplace) {
  const t = requireTenantId(tenantId);
  const m = encodeURIComponent(marketplace);
  const lookup = () =>
    rest(`marketplace_accounts?select=id&marketplace=eq.${m}&account_label=eq.manual&tenant_id=eq.${t}&limit=1`);
  const found = await lookup();
  if (found.length) return found[0];
  try {
    const created = await rest("marketplace_accounts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        tenant_id: tenantId,
        marketplace,
        account_label: "manual",
        environment: "production",
        status: "disconnected",
        connection_mode: "manual",
      }),
    });
    return created[0];
  } catch (err) {
    const retry = await lookup().catch(() => []);
    if (retry.length) return retry[0];
    throw err;
  }
}

/**
 * Records a manual-listing lifecycle change (Ready to Post / Posted / Sold /
 * Ended) in marketplace_listings. Idempotent per (product, account):
 * repeats update the same row instead of duplicating it. Tenant-scoped:
 * both the product and the channel account must belong to `tenantId`.
 */
async function upsertManualListing({ tenantId, sku, marketplace, status, listingUrl, listingId, notes }) {
  const t = requireTenantId(tenantId);
  const allowed = ["draft", "ready_to_post", "posted", "sold", "ended"];
  if (!allowed.includes(status)) {
    const err = new Error(`status must be one of: ${allowed.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }
  const products = await rest(`products?select=id&sku=eq.${encodeURIComponent(sku)}&tenant_id=eq.${t}&limit=1`);
  if (!products.length) {
    const err = new Error(`Unknown SKU: ${sku}`);
    err.statusCode = 404;
    throw err;
  }
  const account = await ensureManualAccount(tenantId, marketplace);
  if (!account) {
    const err = new Error(`No manual channel available for: ${marketplace}`);
    err.statusCode = 404;
    throw err;
  }
  const row = {
    tenant_id: tenantId,
    product_id: products[0].id,
    account_id: account.id,
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

/**
 * Syncs a product to Facebook Marketplace. Posts the listing via the
 * FacebookConnector and records it in marketplace_listings.
 *
 * @param {object} product - { sku, title, description, price, condition, image_url }
 * @param {object} [options] - { dryRun, confirm }
 * @param {string} [tenantId] - owning tenant (defaults to product.tenant_id)
 * @returns {Promise<object>} The created marketplace listing record
 */
async function syncToFacebook(product, options = {}, tenantId = product && product.tenant_id) {
  const { FacebookConnector } = require("./channels/apiConnectors");
  const connector = new FacebookConnector();

  if (!product || !product.sku || !product.title) {
    const err = new Error("syncToFacebook requires product with sku and title");
    err.statusCode = 400;
    throw err;
  }

  // Transform product to Facebook format
  const publicImageUrl = await ensurePublicUrl(product.image_url);
  const facebookProduct = {
    title: product.title,
    description: product.description || "Item in excellent condition. See photos for details.",
    price: product.price || 0,
    sku: product.sku,
    condition: product.condition || "used",
    images: publicImageUrl ? [publicImageUrl] : [],
    category: "Other",
  };

  // Create listing on Facebook (via connector → Python bridge)
  let result;
  try {
    result = await connector.createListing(facebookProduct, options);
  } catch (err) {
    console.error("[syncToFacebook]", err.code, err.message);
    throw err;
  }

  // Record in marketplace_listings table
  const listingId = result.listing_id || result.detail?.listing_id;
  const listing_url = result.listing_url || `https://www.facebook.com/marketplace/item/${listingId}`;

  return upsertManualListing({
    tenantId,
    sku: product.sku,
    marketplace: "facebook",
    status: "posted",
    listingId,
    listingUrl: listing_url,
    notes: `Synced at ${new Date().toISOString()}`,
  });
}

/**
 * Syncs a product to Instagram Shop. Posts the listing via the
 * InstagramConnector and records it in marketplace_listings.
 *
 * @param {object} product - { sku, title, description, price, condition, image_url }
 * @param {object} [options] - { dryRun, confirm }
 * @param {string} [tenantId] - owning tenant (defaults to product.tenant_id)
 * @returns {Promise<object>} The created marketplace listing record
 */
async function syncToInstagram(product, options = {}, tenantId = product && product.tenant_id) {
  const { InstagramConnector } = require("./channels/apiConnectors");
  const connector = new InstagramConnector();

  if (!product || !product.sku || !product.title) {
    const err = new Error("syncToInstagram requires product with sku and title");
    err.statusCode = 400;
    throw err;
  }

  // Transform product to Instagram format (same as Facebook for now)
  const publicImageUrl = await ensurePublicUrl(product.image_url);
  const instagramProduct = {
    title: product.title,
    description: product.description || "Item in excellent condition. See photos for details.",
    price: product.price || 0,
    sku: product.sku,
    condition: product.condition || "used",
    images: publicImageUrl ? [publicImageUrl] : [],
    category: "Other",
  };

  // Create listing on Instagram (via connector → Python bridge)
  let result;
  try {
    result = await connector.createListing(instagramProduct, options);
  } catch (err) {
    console.error("[syncToInstagram]", err.code, err.message);
    throw err;
  }

  // Record in marketplace_listings table
  const listingId = result.listing_id || result.detail?.listing_id;
  const listing_url = result.listing_url || `https://instagram.com/shop/${listingId}`;

  return upsertManualListing({
    tenantId,
    sku: product.sku,
    marketplace: "instagram",
    status: "posted",
    listingId,
    listingUrl: listing_url,
    notes: `Synced at ${new Date().toISOString()}`,
  });
}

module.exports = {
  publishToInventory,
  upsertTenantProduct,
  listInventory,
  listChannelAccounts,
  upsertManualListing,
  syncToFacebook,
  syncToInstagram,
};
