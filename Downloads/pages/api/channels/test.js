// POST /api/channels/test   body: { channel: "etsy" }
// Runs a REAL authenticated API test for one channel. This is the only
// path that can ever produce status "connected".

const { API_CONNECTORS } = require("../../../lib/channels/registry");

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }
    const { channel } = req.body || {};
    const connector = API_CONNECTORS[channel];
    if (!connector) {
      return res.status(400).json({ ok: false, error: `Unknown or non-API channel: ${channel}` });
    }
    const result = await connector.getConnectionStatus();
    return res.status(200).json({ ok: true, channel, ...result });
  } catch (err) {
    console.error("[api/channels/test]", err.message);
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
}
