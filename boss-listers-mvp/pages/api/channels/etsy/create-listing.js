// POST /api/channels/etsy/create-listing
// body: { product, dryRun?, targetState?, confirm? }
//
// Proxies to EtsyConnector.createListing(), which proxies to the internal
// Python bridge service (scripts/listing_service.py in video-bot-pipeline)
// wrapping the canonical lib/etsy_listing.py client. This route holds no
// Etsy listing logic of its own — mirrors
// pages/api/channels/ebay/create-listing.js.
//
// dryRun defaults to true here too. Unlike eBay, dryRun:false alone does
// NOT mean "really publish" for Etsy — creating a draft is free and
// buyer-invisible, so only targetState:"active" is the money/live boundary
// (enforced inside the bridge service, per-platform armed).

const { EtsyConnector } = require("../../../../lib/channels/apiConnectors");
const { resolveSession } = require("../../../../lib/supabaseAuth");

const connector = new EtsyConnector();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Resolve the tenant from the caller's OWN session token — same safety
  // property as the eBay route: a customer can only ever create listings
  // under their own connected Etsy shop, never one asserted in the body.
  const authHeader = req.headers.authorization || "";
  const userAccessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const session = userAccessToken
    ? await resolveSession(process.env, userAccessToken)
    : null;

  const { product, dryRun = true, targetState = "draft", confirm } = req.body || {};

  if (!product) {
    return res.status(400).json({
      ok: false,
      code: "missing_fields",
      error: "`product` is required in the request body.",
    });
  }

  try {
    const result = await connector.createListing(product, {
      dryRun, targetState, confirm, tenantId: session?.tenantId,
    });
    return res.status(200).json(result);
  } catch (err) {
    // Only .message is logged — never the token, never etsyBody, matching
    // the existing convention for the eBay route.
    console.error("[api/channels/etsy/create-listing]", err.code || "error", err.message);
    return res.status(err.statusCode || 500).json({
      ok: false,
      code: err.code || "internal_error",
      error: err.message,
      step: err.step,
      listingId: err.listingId,
    });
  }
}
