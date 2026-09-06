// POST /api/inventory/sync-instagram
// Syncs a product from inventory to Instagram Shop
// body: { sku, dryRun?, confirm? }

const { syncToInstagram } = require("../../../lib/supabaseInventory");

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

  const { sku, dryRun = true, confirm } = req.body || {};

  if (!sku) {
    return res.status(400).json({
      ok: false,
      error: "sku is required",
    });
  }

  try {
    // Fetch the product from inventory
    const products = await rest(
      `/products?select=*&sku=eq.${encodeURIComponent(sku)}&limit=1`,
      { method: "GET" }
    );

    if (!products || !products.length) {
      return res.status(404).json({
        ok: false,
        error: `Product not found: ${sku}`,
      });
    }

    const product = products[0];

    // Sync to Instagram
    const result = await syncToInstagram(product, {
      dryRun,
      confirm,
    });

    return res.status(200).json({
      ok: true,
      listing: result,
      message: dryRun
        ? "Dry run successful — listing would be created on Instagram Shop"
        : "Listing created on Instagram Shop",
    });
  } catch (err) {
    console.error("[api/inventory/sync-instagram]", err.code || "error", err.message);
    return res.status(err.statusCode || 500).json({
      ok: false,
      code: err.code || "sync_failed",
      error: err.message,
      detail: err.detail,
    });
  }
}
