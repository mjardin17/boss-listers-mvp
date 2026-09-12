// GET /api/channels
// Returns every channel (API + manual) with live-ish status, from the
// single source of truth in lib/channels/registry.js. This route never
// existed before — the Channels page called it, got a 404, and the
// "Marketplace connections" section silently rendered empty.
const { getChannelStatuses } = require("../../../lib/channels/registry");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  try {
    const channels = await getChannelStatuses({ probe: false });
    return res.status(200).json({ ok: true, channels });
  } catch (err) {
    console.error("[api/channels]", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
