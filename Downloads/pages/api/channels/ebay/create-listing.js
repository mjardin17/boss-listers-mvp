// POST /api/channels/ebay/create-listing
// body: { product, policies, dryRun?, confirm?, sandbox? }
//
// Proxies to EbayConnector.createListing(), which itself proxies to the
// internal Python bridge service (scripts/ebay_listing_service.py in the
// video-bot-pipeline repo) wrapping the canonical lib/ebay_listing.py
// client. This route holds no eBay listing logic of its own.
//
// dryRun defaults to true here too, matching every layer below it — a
// missing/omitted flag must never accidentally reach a live publish.

const { EbayConnector } = require("../../../../lib/channels/apiConnectors");
const { resolveSession } = require("../../../../lib/supabaseAuth");

const connector = new EbayConnector();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Resolve the tenant from the caller's OWN session token — never from
  // anything the client sends in the body. This is what makes it safe:
  // a customer can only ever create listings under their own connected
  // eBay account, because tenantId is derived server-side from who they
  // are, not asserted by the request.
  const authHeader = req.headers.authorization || "";
  const userAccessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const session = userAccessToken
    ? await resolveSession(process.env, userAccessToken)
    : null;

  const { product, policies, dryRun = true, confirm, sandbox = false } = req.body || {};

  if (!product || !policies) {
    return res.status(400).json({
      ok: false,
      code: "missing_fields",
      error: "Both `product` and `policies` are required in the request body.",
    });
  }

  try {
    const result = await connector.createListing(product, policies, {
      dryRun, confirm, sandbox, tenantId: session?.tenantId,
    });
    return res.status(200).json(result);
  } catch (err) {
    // Only .message is logged — never the token, never ebayBody (which
    // could echo request context back), matching the existing convention
    // in pages/api/channels/test.js.
    console.error("[api/channels/ebay/create-listing]", err.code || "error", err.message);
    return res.status(err.statusCode || 500).json({
      ok: false,
      code: err.code || "internal_error",
      error: err.message,
      step: err.step,
      offerId: err.offerId,
    });
  }
}
