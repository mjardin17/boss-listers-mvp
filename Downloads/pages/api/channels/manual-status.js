// POST /api/channels/manual-status
// body: { sku, marketplace, status, listingUrl?, listingId?, notes? }
// status: draft | ready_to_post | posted | sold | ended
// Persists the manual-listing lifecycle to marketplace_listings
// (idempotent per product+channel — "mark as posted" twice updates,
// never duplicates).

const { upsertManualListing } = require("../../../lib/supabaseInventory");
const { MANUAL_PLATFORMS } = require("../../../lib/channels/manualPackage");

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }
    const { sku, marketplace, status, listingUrl, listingId, notes } = req.body || {};
    if (!sku || !marketplace || !status) {
      return res.status(400).json({ ok: false, error: "sku, marketplace, and status are required" });
    }
    if (!MANUAL_PLATFORMS[marketplace]) {
      return res.status(400).json({ ok: false, error: `Not a manual channel: ${marketplace}` });
    }
    const rows = await upsertManualListing({ sku, marketplace, status, listingUrl, listingId, notes });
    return res.status(200).json({ ok: true, listing: rows && rows[0] });
  } catch (err) {
    console.error("[api/channels/manual-status]", err.message);
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
}
