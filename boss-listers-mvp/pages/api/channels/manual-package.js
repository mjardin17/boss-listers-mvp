// POST /api/channels/manual-package
// body: { product: {...} | sku: "ABC", platforms: ["facebook","mercari"] }
// → { ok, packages: [...] }   or CSV download with ?format=csv
//
// `product` may be passed inline (unsaved drafts) or by `sku` (loaded
// from the shared Supabase inventory).

const { buildManualPackage, packagesToCsv, MANUAL_PLATFORMS } = require("../../../lib/channels/manualPackage");

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }
    const { product: inlineProduct, sku, platforms } = req.body || {};
    const targets = Array.isArray(platforms) && platforms.length
      ? platforms
      : Object.keys(MANUAL_PLATFORMS);

    let product = inlineProduct;
    if (!product && sku) {
      const { listInventory } = require("../../../lib/supabaseInventory");
      const rows = await listInventory();
      product = rows.find((r) => r.sku === sku);
      if (!product) return res.status(404).json({ ok: false, error: `SKU not found in inventory: ${sku}` });
    }
    if (!product) {
      return res.status(400).json({ ok: false, error: "Provide either `product` or `sku`" });
    }

    const packages = targets.map((p) => buildManualPackage(product, p));

    if (req.query.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="listing-package-${product.sku || "draft"}.csv"`);
      return res.status(200).send(packagesToCsv(packages));
    }
    return res.status(200).json({ ok: true, packages });
  } catch (err) {
    console.error("[api/channels/manual-package]", err.message);
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
}
