// GET /api/channels          → all channels with honest status (no network)
// GET /api/channels?probe=1  → also live-test API channels that have creds
export default async function handler(req, res) {
  const { getChannelStatuses } = require("../../../lib/channels/registry");
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }
    const channels = await getChannelStatuses({ probe: req.query.probe === "1" });
    return res.status(200).json({ ok: true, channels });
  } catch (err) {
    console.error("[api/channels]", err.message);
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
}
