// POST /empire/stock/add { title, quantity?, price?, condition?, location?, description?, dryRun? }
// Adds an item to the owner's in-house stock list as an UNLISTED draft, the same as the Stock
// page's Add form. Needs X-Empire-Key. Nothing is posted to any selling site; "dryRun": true only checks.
const { loadEnvConfig } = require("@next/env");
const { requireEmpireKey } = require("../../../../lib/requireEmpireKey");
const { addStockItem, ownerTenantId } = require("../../../../lib/empireContract");
const { insertStockItem } = require("../../../../lib/supabaseInventory");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!requireEmpireKey(req, res)) return;
  loadEnvConfig(process.cwd());
  const tenantId = ownerTenantId();
  if (!tenantId) return res.status(503).json({ ok: false, error: "PLATFORM_OWNER_TENANT_ID is not set" });
  try {
    const out = await addStockItem({ tenantId, input: req.body, insertStockItem });
    return res.status(out.status).json(out.body);
  } catch (err) {
    console.error("[empire/stock/add]", err.message);
    return res.status(502).json({ ok: false, error: "That could not be saved right now" });
  }
}
