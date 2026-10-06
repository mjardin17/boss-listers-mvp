// GET /api/products/[sku]
// Server-side lookup of a single product's full record (including
// description, image_url, condition — fields listInventory() in
// lib/supabaseInventory.js deliberately omits for the list view). Uses
// SUPABASE_SERVICE_ROLE_KEY, same as the rest of that module, so this must
// stay a pages/api/* route and never be imported into a page/component.
// Auth: Bearer session required; only the caller's tenant's products are visible.
const { requireSession } = require("../../../lib/requireSession");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const session = await requireSession(req, res);
  if (!session) return;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(503).json({ ok: false, error: "Supabase not configured" });
  }
  const { sku } = req.query;
  if (!sku || typeof sku !== "string") {
    return res.status(400).json({ ok: false, error: "Missing sku" });
  }
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/products?sku=eq.${encodeURIComponent(sku)}&tenant_id=eq.${encodeURIComponent(session.tenantId)}&select=*&limit=1`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (!r.ok) {
      const detail = await r.text();
      console.error(`[api/products/sku] Supabase lookup failed (${r.status}): ${detail}`);
      return res.status(502).json({ ok: false, error: "Product lookup failed" });
    }
    const rows = await r.json();
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: `Unknown SKU: ${sku}` });
    }
    return res.status(200).json({ ok: true, product: rows[0] });
  } catch (err) {
    console.error("[api/products/sku]", err.message);
    return res.status(502).json({ ok: false, error: "Product lookup failed" });
  }
}
