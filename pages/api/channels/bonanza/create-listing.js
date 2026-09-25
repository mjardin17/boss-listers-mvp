// POST /api/channels/bonanza/create-listing
// body: { product (or listing), dryRun?, confirm? }
//
// Proxies to BonanzaConnector.createListing().
// dryRun defaults to true.

const { BonanzaConnector } = require("../../../../lib/channels/apiConnectors");
const { resolveSession } = require("../../../../lib/supabaseAuth");
const { ensurePublicUrl } = require("../../../../lib/supabaseStorage");

const connector = new BonanzaConnector();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const userAccessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const session = userAccessToken
    ? await resolveSession(process.env, userAccessToken)
    : null;

  const { product, listing, dryRun = true, confirm } = req.body || {};
  const listingData = product || listing;

  if (!listingData) {
    return res.status(400).json({
      ok: false,
      code: "missing_fields",
      error: "`product` or `listing` object is required in the request body.",
    });
  }

  if (Array.isArray(listingData.image_urls)) {
    listingData.image_urls = await Promise.all(listingData.image_urls.map(ensurePublicUrl));
  }

  try {
    const result = await connector.createListing(listingData, {
      dryRun, confirm, tenantId: session?.tenantId,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error("[api/channels/bonanza/create-listing]", err.code || "error", err.message);
    return res.status(err.statusCode || 500).json({
      ok: false,
      code: err.code || "internal_error",
      error: err.message,
    });
  }
}
