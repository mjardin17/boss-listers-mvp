// POST /api/post-everywhere
// body: { sku, autoSubmit?: true }
// → Posts to all supported platforms. API platforms (eBay, Etsy) post
//   directly. Browser platforms return packages for extension auto-fill.

const { EbayConnector } = require("../lib/channels/apiConnectors");
const { EtsyConnector } = require("../lib/channels/apiConnectors");
const { buildManualPackage, MANUAL_PLATFORMS } = require("../lib/channels/manualPackage");
const { listInventory } = require("../lib/supabaseInventory");
const { resolveSession } = require("../lib/supabaseAuth");

const ebayConnector = new EbayConnector();
const etsyConnector = new EtsyConnector();

const API_PLATFORMS = ["ebay", "etsy"];
const BROWSER_PLATFORMS = Object.keys(MANUAL_PLATFORMS).filter(p => !API_PLATFORMS.includes(p));

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { sku, autoSubmit } = req.body || {};
  if (!sku) {
    return res.status(400).json({ ok: false, error: "SKU required" });
  }

  // Resolve user session for API posts (eBay, Etsy need tenantId)
  const authHeader = req.headers.authorization || "";
  const userAccessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const session = userAccessToken
    ? await resolveSession(process.env, userAccessToken)
    : null;

  try {
    // Load product from inventory
    const rows = await listInventory();
    const product = rows.find((r) => r.sku === sku);
    if (!product) {
      return res.status(404).json({ ok: false, error: `SKU not found: ${sku}` });
    }

    const results = {
      ok: true,
      sku,
      postedTo: [],
      manualPackages: [],
      errors: [],
    };

    // Post to API platforms
    if (API_PLATFORMS.includes("ebay")) {
      try {
        const ebayResult = await ebayConnector.createListing(product, {}, {
          dryRun: false,
          confirm: true,
          tenantId: session?.tenantId,
        });
        results.postedTo.push({ platform: "ebay", listingId: ebayResult.listingId });
      } catch (err) {
        results.errors.push({ platform: "ebay", error: err.message });
      }
    }

    if (API_PLATFORMS.includes("etsy")) {
      try {
        const etsyResult = await etsyConnector.createListing(product, {
          targetState: "draft", // Start as draft for review
          tenantId: session?.tenantId,
        });
        results.postedTo.push({ platform: "etsy", listingId: etsyResult.listingId });
      } catch (err) {
        results.errors.push({ platform: "etsy", error: err.message });
      }
    }

    // Generate packages for browser platforms
    BROWSER_PLATFORMS.forEach((platform) => {
      const pkg = buildManualPackage(product, platform);
      results.manualPackages.push(pkg);
    });

    return res.status(200).json(results);
  } catch (err) {
    console.error("[api/post-everywhere]", err.message);
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
}
