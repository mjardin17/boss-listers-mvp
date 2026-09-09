// pages/api/sync/status.js
// GET /api/sync/status
// Returns current sync status, last sync time, and synced SKUs with quantities

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function rest(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    const err = new Error("Supabase not configured");
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
    const detail = await res.text().catch(() => "Unknown error");
    const err = new Error(`Supabase ${options.method || "GET"} ${path} failed (${res.status}): ${detail}`);
    err.statusCode = 502;
    throw err;
  }

  return res.status === 204 ? null : res.json();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    // Get last sync run
    const lastSync = await rest(
      "sync_runs?select=id,run_id,status,started_at,finished_at,total_skus_checked,skus_synced,quantity_updates,delistings&order=created_at.desc&limit=1",
    );

    // Get count of synced products (products with marketplace listings on multiple platforms)
    const syncedProducts = await rest(
      "marketplace_listings?select=product_id&order=product_id.asc" +
      "&limit=1000" // Get first 1000 synced listings to show sync status
    );

    // Get product details for all synced listings
    let syncedSkuStatus = [];
    if (syncedProducts.length > 0) {
      const productIds = [...new Set(syncedProducts.map((m) => m.product_id))]; // Get unique product IDs
      syncedSkuStatus = await rest(
        `products?select=id,sku,title,quantity&id=in.${encodeURIComponent("(" + productIds.join(",") + ")")}&limit=500`,
      );
    }

    // Count products with listings on 2+ platforms (truly synced)
    const listingCountByProduct = {};
    for (const listing of syncedProducts) {
      listingCountByProduct[listing.product_id] = (listingCountByProduct[listing.product_id] || 0) + 1;
    }

    const trulySyncedProducts = Object.entries(listingCountByProduct)
      .filter(([_, count]) => count >= 2)
      .map(([productId, _]) =>
        syncedSkuStatus.find((p) => p.id === productId),
      )
      .filter(Boolean);

    return res.status(200).json({
      ok: true,
      lastSync: lastSync[0] || null,
      syncedProductCount: trulySyncedProducts.length,
      syncedProducts: trulySyncedProducts.slice(0, 50), // Return top 50 for display
      isConfigured: {
        ebay: !!process.env.EBAY_REFRESH_TOKEN,
        etsy: !!process.env.ETSY_API_KEY && !!process.env.ETSY_SHOP_ID,
      },
    });
  } catch (err) {
    const status = err.statusCode || 500;
    console.error("[api/sync/status]", err.message);
    return res.status(status).json({ ok: false, error: err.message });
  }
}
