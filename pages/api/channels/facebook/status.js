// GET /api/channels/facebook/status
// Returns Facebook Marketplace connection status: whether the Page token
// (FB_ACCESS_TOKEN) is currently valid and authorized for the configured
// FB_PAGE_ID.

const { FacebookConnector } = require("../../../../lib/channels/apiConnectors");

const connector = new FacebookConnector();

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const status = await connector.getConnectionStatus();
    return res.status(200).json({ ok: true, ...status });
  } catch (err) {
    console.error("[api/channels/facebook/status]", err.message);
    return res.status(err.statusCode || 500).json({
      ok: false,
      error: err.message,
    });
  }
}
