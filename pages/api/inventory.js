// pages/api/inventory.js
// GET  → list shared Empire OS inventory (eBay-synced + manual products)
// POST → publish a generated listing into the shared inventory
//        body: { sku, title, description, price, quantity, imageUrl, condition }

const { listInventory, publishToInventory } = require("../../lib/supabaseInventory");

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const products = await listInventory();
      return res.status(200).json({ ok: true, products });
    }
    if (req.method === "POST") {
      const rows = await publishToInventory(req.body || {});
      return res.status(200).json({ ok: true, product: rows && rows[0] });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    const status = err.statusCode || 500;
    console.error("[api/inventory]", err.message);
    return res.status(status).json({ ok: false, error: err.message });
  }
}
