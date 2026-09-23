// POST /api/inventory/sync-to-etsy
// Syncs one or more items to Etsy
// Body: { sku } for single, or { skus: [...] } for multiple

const { EtsyConnector } = require("../../../lib/channels/apiConnectors");

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
    const detail = await res.text();
    const err = new Error(`Supabase failed (${res.status}): ${detail}`);
    err.statusCode = 502;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/**
 * Fetch a product from the inventory by SKU
 */
async function getProductBySku(sku) {
  const products = await rest(
    `products?sku=eq.${encodeURIComponent(sku)}&select=id,sku,title,description,price,quantity,condition,image_url,synced_to`
  );
  return products && products.length > 0 ? products[0] : null;
}

/**
 * Update product sync status
 */
async function updateProductSyncStatus(sku, syncedTo, syncStatus, error = null) {
  const payload = {
    synced_to: JSON.stringify(syncedTo),
    sync_status: syncStatus,
    last_synced_at: new Date().toISOString(),
  };
  if (error) {
    payload.sync_error = error;
  }
  return rest(`products?sku=eq.${encodeURIComponent(sku)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { sku, skus } = req.body || {};

    // Handle both single and bulk sync
    const skuList = skus || (sku ? [sku] : []);
    if (skuList.length === 0) {
      return res.status(400).json({ ok: false, error: "sku or skus required in body" });
    }

    const connector = new EtsyConnector();

    // Check if Etsy is even configured
    const status = await connector.getConnectionStatus();
    if (status.status !== "CONNECTED") {
      return res.status(409).json({
        ok: false,
        error: "Etsy is not connected",
        detail: status.detail,
      });
    }

    const results = [];

    for (const currentSku of skuList) {
      try {
        const product = await getProductBySku(currentSku);
        if (!product) {
          results.push({
            sku: currentSku,
            success: false,
            error: "Product not found in inventory",
          });
          continue;
        }

        // Check if already synced to Etsy
        const syncedTo = JSON.parse(product.synced_to || "[]");
        if (syncedTo.includes("etsy")) {
          results.push({
            sku: currentSku,
            success: false,
            error: "Already synced to Etsy",
            etsyListingId: product.external_ids?.etsy_id,
          });
          continue;
        }

        // Prepare Etsy product
        const etsyProduct = {
          sku: product.sku,
          title: product.title,
          description: product.description || "",
          price: product.price,
          quantity: product.quantity || 1,
          condition: product.condition || "new",
          images: product.image_url ? [product.image_url] : [],
          who_made: "i_did", // Seller-made
          when_made: "2020_2024", // Recent
          is_supply: false,
          taxonomy_id: 1, // Unspecified
        };

        // Create a DRAFT listing on Etsy (dryRun defaults to true)
        const etsyResult = await connector.createListing(etsyProduct, {
          dryRun: false,
          targetState: "draft", // Create as draft only
        });

        if (etsyResult.ok || etsyResult.listing_id) {
          // Update sync status
          syncedTo.push("etsy");
          const externalIds = JSON.parse(product.external_ids || "{}");
          externalIds.etsy_id = etsyResult.listing_id;

          await rest(`products?sku=eq.${encodeURIComponent(currentSku)}`, {
            method: "PATCH",
            body: JSON.stringify({
              synced_to: JSON.stringify(syncedTo),
              sync_status: "synced",
              sync_error: null,
              last_synced_at: new Date().toISOString(),
              external_ids: JSON.stringify(externalIds),
            }),
          });

          results.push({
            sku: currentSku,
            success: true,
            etsyListingId: etsyResult.listing_id,
          });
        } else {
          throw new Error(etsyResult.error || "Unknown Etsy API error");
        }
      } catch (err) {
        console.error(`[sync-to-etsy] Failed for ${currentSku}:`, err.message);

        // Update sync status with error
        try {
          await updateProductSyncStatus(currentSku, [], "failed", err.message);
        } catch {}

        results.push({
          sku: currentSku,
          success: false,
          error: err.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    return res.status(200).json({
      ok: successCount > 0,
      synced: successCount,
      failed: failureCount,
      results,
    });
  } catch (err) {
    console.error("[sync-to-etsy]", err.message);
    const status = err.statusCode || 500;
    return res.status(status).json({ ok: false, error: err.message });
  }
}
