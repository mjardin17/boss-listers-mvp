// GET /api/channels/facebook/status?live=true
// Returns Facebook Marketplace connection status: whether the Page token
// (FB_ACCESS_TOKEN) is currently valid and authorized for the configured
// FB_PAGE_ID.
//
// ?live=true calls testConnection() — a real Graph API call — instead of
// the cheap getConnectionStatus() (env-presence only). Facebook has no
// per-tenant OAuth flow (shared static FB_ACCESS_TOKEN, manually minted
// via Graph API Explorer, not a Connect button), so unlike the 5
// marketplace connectors there's no tenant to scope this to — the shared
// credential IS the only credential.

const { FacebookConnector } = require("../../../../lib/channels/apiConnectors");

const connector = new FacebookConnector();

const { requireOwnerSession } = require("../../../../lib/requireSession");

export default async function handler(req, res) {
  const session = await requireOwnerSession(req, res);
  if (!session) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const status = req.query.live === "true"
      ? await connector.testConnection()
      : await connector.getConnectionStatus();
    return res.status(200).json({ ok: true, ...status });
  } catch (err) {
    console.error("[api/channels/facebook/status]", err.message);
    return res.status(err.statusCode || 500).json({
      ok: false,
      error: err.message,
    });
  }
}
