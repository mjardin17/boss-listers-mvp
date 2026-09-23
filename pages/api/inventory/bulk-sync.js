// POST /api/inventory/bulk-sync
// Syncs multiple items to specified platforms
// Body: { skus: [...], platforms: ["etsy", "facebook"] }

const { EtsyConnector, FacebookConnector } = require("../../../lib/channels/apiConnectors");

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

async function getProductBySku(sku) {
  const products = await rest(
    `products?sku=eq.${encodeURIComponent(sku)}&select=id,sku,title,description,price,quantity,condition,image_url,synced_to,external_ids`
  );
  return products && products.length > 0 ? products[0] : null;
}

async function updateProductSync(sku, syncedTo, syncStatus, externalIds, error = null) {
  const payload = {
    synced_to: JSON.stringify(syncedTo),
    sync_status: syncStatus,
    last_synced_at: new Date().toISOString(),
    external_ids: JSON.stringify(externalIds),
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
    const { skus = [], platforms = ["etsy"] } = req.body || {};

    if (!skus || skus.length === 0) {
      return res.status(400).json({ ok: false, error: "skus array required" });
    }

    if (!Array.isArray(platforms) || platforms.length === 0) {
      return res.status(400).json({ ok: false, error: "platforms array required" });
    }

    const results = [];

    for (const sku of skus) {
      const skuResult = { sku, platforms: {} };

      const product = await getProductBySku(sku);
      if (!product) {
        skuResult.error = "Product not found";
        results.push(skuResult);
        continue;
      }

      let syncedTo = JSON.parse(product.synced_to || "[]");
      let externalIds = JSON.parse(product.external_ids || "{}");

      // Sync to each requested platform
      for (const platform of platforms) {
        try {
          if (platform === "etsy") {
            if (syncedTo.includes("etsy")) {
              skuResult.platforms.etsy = {
                success: false,
                error: "Already synced",
                etsyListingId: externalIds.etsy_id,
              };
              continue;
            }

            const connector = new EtsyConnector();
            const status = await connector.getConnectionStatus();
            if (status.status !== "CONNECTED") {
              skuResult.platforms.etsy = { success: false, error: "Etsy not connected" };
              continue;
            }

            const etsyProduct = {
              sku: product.sku,
              title: product.title,
              description: product.description || "",
              price: product.price,
              quantity: product.quantity || 1,
              condition: product.condition || "new",
              images: product.image_url ? [product.image_url] : [],
              who_made: "i_did",
              when_made: "2020_2024",
              is_supply: false,
              taxonomy_id: 1,
            };

            const etsyResult = await connector.createListing(etsyProduct, {
              dryRun: false,
              targetState: "draft",
            });

            if (etsyResult.ok || etsyResult.listing_id) {
              syncedTo.push("etsy");
              externalIds.etsy_id = etsyResult.listing_id;
              skuResult.platforms.etsy = {
                success: true,
                etsyListingId: etsyResult.listing_id,
              };
            } else {
              throw new Error(etsyResult.error || "Unknown error");
            }
          } else if (platform === "facebook") {
            if (syncedTo.includes("facebook")) {
              skuResult.platforms.facebook = {
                success: false,
                error: "Already synced",
                facebookListingId: externalIds.facebook_id,
              };
              continue;
            }

            const connector = new FacebookConnector();
            const status = await connector.getConnectionStatus();
            if (status.status !== "CONNECTED") {
              skuResult.platforms.facebook = { success: false, error: "Facebook not connected" };
              continue;
            }

            const fbProduct = {
              sku: product.sku,
              title: product.title,
              description: product.description || "",
              price: product.price,
              images: product.image_url ? [product.image_url] : [],
              condition: product.condition || "used",
              tags: ["resale"],
            };

            const fbResult = await connector.createListing(fbProduct, {
              dryRun: false,
            });

            if (fbResult.ok || fbResult.listing_id) {
              syncedTo.push("facebook");
              externalIds.facebook_id = fbResult.listing_id;
              skuResult.platforms.facebook = {
                success: true,
                facebookListingId: fbResult.listing_id,
              };
            } else {
              throw new Error(fbResult.error || "Unknown error");
            }
          }
        } catch (err) {
          skuResult.platforms[platform] = {
            success: false,
            error: err.message,
          };
        }
      }

      // Update product with new sync status
      const anySuccess = Object.values(skuResult.platforms).some((p) => p.success);
      if (anySuccess) {
        await updateProductSync(sku, syncedTo, "synced", externalIds);
      }

      results.push(skuResult);
    }

    const syncedCount = results.filter(
      (r) =>
        Object.values(r.platforms).some((p) => p.success)
    ).length;

    return res.status(200).json({
      ok: syncedCount > 0,
      synced: syncedCount,
      failed: results.length - syncedCount,
      results,
    });
  } catch (err) {
    console.error("[bulk-sync]", err.message);
    const status = err.statusCode || 500;
    return res.status(status).json({ ok: false, error: err.message });
  }
}
