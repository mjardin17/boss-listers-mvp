// POST /api/channels/facebook/create-listing
// body: { product, dryRun?, confirm? }
//
// Proxies to FacebookConnector.createListing(), which itself proxies to the
// internal Python bridge service (scripts/listing_service.py) wrapping the
// canonical lib/facebook_marketplace_listing.py client.
//
// dryRun defaults to true — a missing/omitted flag must never accidentally
// reach a live publish.

const { FacebookConnector } = require("../../../../lib/channels/apiConnectors");
const { resolveSession } = require("../../../../lib/supabaseAuth");

const connector = new FacebookConnector();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Note: Facebook integration is currently single-tenant (shared Page token
  // from .env). Future: extend to per-tenant like eBay/Etsy.
  const authHeader = req.headers.authorization || "";
  const userAccessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const session = userAccessToken
    ? await resolveSession(process.env, userAccessToken)
    : null;

  const { product, dryRun = true, confirm, listingServiceToken } = req.body || {};

  if (!product) {
    return res.status(400).json({
      ok: false,
      code: "missing_fields",
      error: "Product object is required in the request body.",
    });
  }

  try {
    const result = await connector.createListing(product, {
      dryRun, confirm, tenantId: session?.tenantId, serviceToken: listingServiceToken,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error("[api/channels/facebook/create-listing]", err.code || "error", err.message);
    return res.status(err.statusCode || 500).json({
      ok: false,
      code: err.code || "internal_error",
      error: err.message,
      step: err.step,
      listingId: err.listingId,
    });
  }
}
