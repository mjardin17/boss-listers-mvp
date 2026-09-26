// POST /api/inventory/sync-shopify-outbound
// Pushes a product from BossListers inventory to your Shopify store.
// body: { sku, dryRun?, confirm? }

const { ShopifyConnector } = require("../../../lib/channels/apiConnectors");
const { resolveSession } = require("../../../lib/supabaseAuth");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function rest(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    const err = new Error("Supabase not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    err.statusCode = 503;
    throw err;
  }
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { sku, dryRun = true, confirm } = req.body || {};

  if (!sku) {
    return res.status(400).json({
      ok: false,
      error: "sku is required",
    });
  }

  try {
    // resolveSession(env, accessToken) needs the Supabase config plus the
    // caller's own bearer token — never the raw req object, which has
    // neither.
    const authHeader = req.headers.authorization || "";
    const userAccessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const session = userAccessToken
      ? await resolveSession(process.env, userAccessToken)
      : null;
    if (!session) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const tenantId = session.tenantId;

    // Fetch the product from BossListers inventory
    const products = await rest(
      `/products?select=*&tenant_id=eq.${encodeURIComponent(tenantId)}&sku=eq.${encodeURIComponent(sku)}&limit=1`,
      { method: "GET" }
    );

    if (!products || !products.length) {
      return res.status(404).json({
        ok: false,
        error: `Product not found in BossListers: ${sku}`,
      });
    }

    const product = products[0];

    // Push to Shopify
    const connector = new ShopifyConnector();
    const result = await connector.createListing(
      {
        ...product,
        tenantId,
      },
      { dryRun, confirm }
    );

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        listing: result,
        message: "Dry run successful — product would be created on Shopify",
      });
    }

    // Record in marketplace_listings table
    const listingId = result.listingId;
    const listing_url = result.url;

    const listingRow = {
      product_id: product.id,
      marketplace: "shopify",
      status: "posted",
      listing_id: listingId || null,
      listing_url: listing_url || null,
      posted_at: new Date().toISOString(),
      notes: `Synced to Shopify at ${new Date().toISOString()}`,
    };

    // Try to find or create marketplace_accounts row for shopify
    let accountId;
    try {
      const accounts = await rest(
        `marketplace_accounts?select=id&marketplace=eq.shopify&tenant_id=eq.${encodeURIComponent(tenantId)}&limit=1`,
        { method: "GET" }
      );
      if (accounts && accounts.length > 0) {
        accountId = accounts[0].id;
      }
    } catch {
      // account might not exist yet
    }

    if (accountId) {
      listingRow.account_id = accountId;
    }

    try {
      await rest("marketplace_listings", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(listingRow),
      });
    } catch (err) {
      // Log recording failed, but don't fail the whole call
      console.error("[api/inventory/sync-shopify-outbound] Failed to record listing:", err.message);
    }

    return res.status(200).json({
      ok: true,
      listing: result,
      message: "Product created on Shopify",
      listingId,
      listingUrl: listing_url,
    });
  } catch (err) {
    console.error("[api/inventory/sync-shopify-outbound]", err.code || "error", err.message);
    return res.status(err.statusCode || 500).json({
      ok: false,
      code: err.code || "sync_failed",
      error: err.message,
      detail: err.detail,
    });
  }
}
