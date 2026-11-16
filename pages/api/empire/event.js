// POST /empire/event: an Empire OS event. Needs X-Empire-Key. Kept in memory only.
const { requireEmpireKey } = require("../../../lib/requireEmpireKey");
const { acceptEvent, recentEvents } = require("../../../lib/empireContract");

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!requireEmpireKey(req, res)) return;
  if (req.method === "GET") return res.status(200).json({ ok: true, events: recentEvents() });
  const out = acceptEvent(req.body);
  return res.status(out.status).json(out.body);
}
