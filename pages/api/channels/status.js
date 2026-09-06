// GET /api/channels/status
// Real marketplace connection status for the shared Empire OS inventory
// backend (marketplace_accounts table). No user auth required — this app
// is currently single-tenant, and the service-role key already scopes to
// the one shared dataset (same trust boundary as /api/inventory).
const { listChannelAccounts } = require("../../../lib/supabaseInventory");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  try {
    const accounts = await listChannelAccounts();
    return res.status(200).json({ ok: true, accounts });
  } catch (err) {
    const status = err.statusCode || 500;
    console.error("[api/channels/status]", err.message);
    return res.status(status).json({ ok: false, error: err.message, accounts: [] });
  }
}
