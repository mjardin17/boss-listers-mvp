// POST /api/inventory/sync-facebook
// Syncs a product from inventory to Facebook Marketplace
// body: { sku, dryRun?, confirm? }

const { syncToFacebook, publishToInventory } = require("../../lib/supabaseInventory");

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
    const { rest } = require("../../lib/supabaseRest");
    const products = await rest(
      res.req?.app?.locals?.env || process.env,
      "GET",
      `/products?select=*&sku=eq.${encodeURIComponent(sku)}&limit=1`
    );

    if (!products || !products.length) {
      return res.status(404).json({
        ok: false,
        error: `Product not found: ${sku}`,
      });
    }

    const product = products[0];

    // Sync to Facebook
    const result = await syncToFacebook(product, {
      dryRun,
      confirm,
    });

    return res.status(200).json({
      ok: true,
      listing: result,
      message: dryRun
        ? "Dry run successful — listing would be created on Facebook"
        : "Listing created on Facebook Marketplace",
    });
  } catch (err) {
    console.error("[api/inventory/sync-facebook]", err.code || "error", err.message);
    return res.status(err.statusCode || 500).json({
      ok: false,
      code: err.code || "sync_failed",
      error: err.message,
      detail: err.detail,
    });
  }
}
