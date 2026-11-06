// pages/api/storefronts/action.js
// POST → change one eBay offer. Owner session only (spends the shared eBay account).
//   body: { action: "publish" | "end", offerId, confirm }
//   publish: confirm must be "PUBLISH_LIVE"   end: confirm must be "END_LISTING"
// Returns the eBay result. Never runs without the matching confirm phrase.

const fs = require("fs");
const path = require("path");
const { requireOwnerSession } = require("../../../lib/requireSession");
const { EbayConnector } = require("../../../lib/channels/apiConnectors");

const PHRASES = { publish: "PUBLISH_LIVE", end: "END_LISTING" };

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const session = await requireOwnerSession(req, res);
  if (!session) return;
  loadEnvLocal();

  const { action, offerId, confirm } = req.body || {};
  if (!PHRASES[action]) return res.status(400).json({ ok: false, error: "Unknown action" });
  if (!/^\d{6,20}$/.test(String(offerId || ""))) return res.status(400).json({ ok: false, error: "Bad offer id" });
  if (confirm !== PHRASES[action]) return res.status(400).json({ ok: false, error: `Type ${PHRASES[action]} to confirm` });

  try {
    const c = new EbayConnector();
    const tok = await c._getAccessToken(process.env.PLATFORM_OWNER_TENANT_ID);
    const base = EbayConnector.apiBase();
    const h = { Authorization: `Bearer ${tok}`, Accept: "application/json", "Content-Type": "application/json", "Accept-Language": "en-US", "Content-Language": "en-US" };
    const url = `${base}/sell/inventory/v1/offer/${offerId}/${action === "publish" ? "publish" : "withdraw"}`;
    const r = await fetch(url, { method: "POST", headers: h });
    const body = await r.json().catch(() => ({}));
    if (r.status >= 300) {
      return res.status(502).json({ ok: false, error: body.errors?.[0]?.message || `eBay returned ${r.status}` });
    }
    return res.status(200).json({ ok: true, action, offerId, listingId: body.listingId || null });
  } catch (err) {
    console.error("[api/storefronts/action]", err.message);
    return res.status(500).json({ ok: false, error: "eBay action failed" });
  }
}
