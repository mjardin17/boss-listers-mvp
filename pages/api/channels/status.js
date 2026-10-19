// GET /api/channels/status
// Real marketplace connection status for the caller's tenant
// (marketplace_accounts table). Bearer session required; rows are filtered
// by session.tenantId.
const { requireSession } = require("../../../lib/requireSession");
const { listChannelAccounts } = require("../../../lib/supabaseInventory");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    const accounts = await listChannelAccounts(session.tenantId);
    return res.status(200).json({ ok: true, accounts });
  } catch (err) {
    const status = err.statusCode || 500;
    console.error("[api/channels/status]", err.message);
    return res.status(status).json({ ok: false, error: status >= 500 ? "Channel status request failed" : err.message, accounts: [] });
  }
}
