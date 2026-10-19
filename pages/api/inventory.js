// pages/api/inventory.js
// GET  → list the caller's tenant inventory (eBay-synced + manual products)
// POST → publish a generated listing into the caller's tenant inventory
//        body: { sku, title, description, price, quantity, imageUrl, condition }
//
// Auth: Bearer session required. tenant_id always comes from the session —
// a client-supplied tenant_id in the body is ignored.

const { requireSession } = require("../../lib/requireSession");
const { listInventory, publishToInventory } = require("../../lib/supabaseInventory");

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const session = await requireSession(req, res);
  if (!session) return;

  try {
    if (req.method === "GET") {
      const products = await listInventory(session.tenantId);
      return res.status(200).json({ ok: true, products });
    }
    const rows = await publishToInventory(req.body || {}, session.tenantId);
    return res.status(200).json({ ok: true, product: rows && rows[0] });
  } catch (err) {
    const status = err.statusCode || 500;
    console.error("[api/inventory]", err.message);
    return res.status(status).json({ ok: false, error: status >= 500 ? "Inventory request failed" : err.message });
  }
}
