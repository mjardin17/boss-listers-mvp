// POST /api/inventory/sync-shopify
// Syncs all products from connected Shopify store into local inventory database.
// Idempotent on SKU — re-running this endpoint safely updates existing products.

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
    if (!tenantId) {
      return res.status(400).json({
        ok: false,
        error: "No tenant found. User must be part of a tenant.",
      });
    }

    console.log(`[api/inventory/sync-shopify] Syncing tenant ${tenantId}`);

    const connector = new ShopifyConnector();
    let shopifyProducts;
    try {
      shopifyProducts = await connector.fetchProducts(tenantId);
    } catch (err) {
      console.error("[api/inventory/sync-shopify] Failed to fetch Shopify products:", err.message);
      return res.status(502).json({
        ok: false,
        error: "Failed to fetch Shopify products",
        detail: err.message,
      });
    }

    if (shopifyProducts.length === 0) {
      return res.status(200).json({
        ok: true,
        itemsSeen: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        message: "No products found in Shopify store",
      });
    }

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const product of shopifyProducts) {
      try {
        const row = {
          tenant_id: tenantId,
          sku: product.sku,
          title: product.title,
          description: product.description,
          price: product.price,
          quantity: product.quantity,
          image_url: product.image_url,
          condition: product.condition,
          status: product.quantity > 0 ? "active" : "out_of_stock",
          source: "shopify",
          shopify_product_id: product.shopify_product_id,
          shopify_variant_id: product.shopify_variant_id,
          published: true,
        };

        // Check if this SKU already exists for this tenant
        const existing = await rest(
          `/products?tenant_id=eq.${encodeURIComponent(tenantId)}&sku=eq.${encodeURIComponent(product.sku)}&select=id`,
          { method: "GET" }
        );

        if (existing && existing.length > 0) {
          // Update existing
          await rest(
            `/products?tenant_id=eq.${encodeURIComponent(tenantId)}&sku=eq.${encodeURIComponent(product.sku)}`,
            {
              method: "PATCH",
              body: JSON.stringify(row),
            }
          );
          updated++;
        } else {
          // Insert new
          await rest("/products", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates" },
            body: JSON.stringify(row),
          });
          created++;
        }
      } catch (err) {
        console.error(`[api/inventory/sync-shopify] Error syncing SKU ${product.sku}:`, err.message);
        errors++;
      }
    }

    return res.status(200).json({
      ok: true,
      itemsSeen: shopifyProducts.length,
      created,
      updated,
      skipped: 0,
      errors,
      message: `Synced ${created} new and updated ${updated} existing products from Shopify`,
    });
  } catch (err) {
    console.error("[api/inventory/sync-shopify] Unhandled error:", err.message);
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      detail: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}
