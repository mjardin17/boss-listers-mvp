// GET /empire/listings?limit=10&stage=ready: stock list summary by stage and the newest items,
// for the platform owner. Needs X-Empire-Key. Read-only.
const { loadEnvConfig } = require("@next/env");
const { requireEmpireKey } = require("../../../lib/requireEmpireKey");
const { listingsReport, ownerTenantId } = require("../../../lib/empireContract");
const { listStock } = require("../../../lib/supabaseInventory");
const { digitalSkus = [] } = require("../../../config/inventory-sync.json");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!requireEmpireKey(req, res)) return;
  loadEnvConfig(process.cwd());
  const tenantId = ownerTenantId();
  if (!tenantId) return res.status(503).json({ ok: false, error: "PLATFORM_OWNER_TENANT_ID is not set" });
  try {
    const stage = typeof req.query.stage === "string" ? req.query.stage : null;
    return res.status(200).json(await listingsReport({ tenantId, listStock, digitalSkus, limit: req.query.limit, stage }));
  } catch (err) {
    console.error("[empire/listings]", err.message);
    return res.status(err.statusCode && err.statusCode < 500 ? err.statusCode : 502).json({ ok: false, error: "The stock list could not be loaded right now" });
  }
}
