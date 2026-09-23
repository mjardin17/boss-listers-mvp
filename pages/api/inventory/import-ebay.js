// POST /api/inventory/import-ebay
// Triggers eBay inventory import and saves items to database

const { importEbayListings } = require("../../../lib/services/ebayImportService");
const { publishToInventory } = require("../../../lib/supabaseInventory");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function rest(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    const err = new Error(
      "Supabase not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
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
    console.log("[import-ebay] Starting eBay inventory import...");

    // Fetch all eBay listings
    const { items, imported, skipped, errors } = await importEbayListings();

    console.log(`[import-ebay] Fetched ${imported} items from eBay, ${skipped} skipped`);

    // Save each item to Supabase inventory table
    let successCount = 0;
    let failureCount = 0;
    const saveErrors = [];

    for (const item of items) {
      try {
        const payload = {
          sku: item.sku,
          title: item.title,
          description: item.description,
          price: item.price,
          quantity: item.quantity,
          image_url: item.images && item.images[0] ? item.images[0] : null,
          condition: item.condition,
          source: "ebay",
          external_ids: JSON.stringify(item.external_ids || {}),
          ebay_item_id: item.ebay_item_id,
          status: "active",
          published: true,
          synced_to: JSON.stringify([]),
          sync_status: "pending",
        };

        await rest("products?on_conflict=sku", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify(payload),
        });

        successCount += 1;
      } catch (err) {
        failureCount += 1;
        saveErrors.push(`SKU ${item.sku}: ${err.message}`);
        console.error(`[import-ebay] Failed to save ${item.sku}:`, err.message);
      }
    }

    console.log(`[import-ebay] Saved ${successCount} items, failed to save ${failureCount}`);

    return res.status(200).json({
      ok: true,
      imported: successCount,
      skipped,
      failed: failureCount,
      errors: errors || [],
      saveErrors: saveErrors.length > 0 ? saveErrors : undefined,
    });
  } catch (err) {
    console.error("[import-ebay] Error:", err.message);
    const status = err.statusCode || 500;
    return res.status(status).json({
      ok: false,
      error: err.message,
    });
  }
}
