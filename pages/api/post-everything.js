// POST /api/post-everything
// Backend of the /upload page ("photo -> every marketplace"). Replaces an old
// route that only SIMULATED posting (random delays, a fake 10% failure rate and
// invented example.com listing URLs) while reporting success.
//
// body: { productInfo, marketplaces: string[], photo?: dataURL, confirmLive?: "PUBLISH_LIVE" }
//
// Without confirmLive nothing is posted: every integrated marketplace is
// dry-run and reported as "skipped" with that reason. With confirmLive (sent
// only after the seller confirms in the page) each marketplace is attempted
// for real and reported from what it actually returned: success only with a
// real listing id/url from the platform.

const { requireSession } = require("../../lib/requireSession");
const { enforceTenantRateLimit } = require("../../lib/rateLimit");
const { MultiPlatformPoster } = require("../../lib/multiPlatformPoster");
const { publishToInventory } = require("../../lib/supabaseInventory");
const { ensurePublicBucketExists, uploadPublicImage } = require("../../lib/supabaseStorage");

export const config = { api: { bodyParser: { sizeLimit: "12mb" } } };

const poster = new MultiPlatformPoster();

// Page marketplace id -> poster platform id. Anything else has no integration.
const PLATFORM_FOR = {
  ebay: "ebay",
  etsy: "etsy",
  amazon: "amazon",
  shopify: "shopify",
  facebook_marketplace: "facebook",
  tiktok_shop: "tiktok",
  instagram_shop: "instagram",
  woocommerce: "woocommerce",
};

const MAX_MARKETPLACES = 30;

function displayName(marketplace) {
  return String(marketplace).replace(/_/g, " ");
}

async function hostPhoto(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!match) return null;
  const buffer = Buffer.from(match[2], "base64");
  const ext = match[1].split("/")[1].replace("jpeg", "jpg");
  await ensurePublicBucketExists();
  return uploadPublicImage(buffer, `post-${Date.now()}.${ext}`, match[1]);
}

function toProgressItem(marketplace, result) {
  const base = { id: `${marketplace}-${Date.now()}`, type: "marketplace", name: displayName(marketplace) };
  if (!result) return { ...base, status: "skipped", error: "No direct integration for this marketplace yet. Use its manual listing package." };
  if (result.success) {
    return { ...base, status: "success", result: { listingId: result.listingId, url: result.url, postedAt: new Date().toISOString() } };
  }
  if (result.dryRun) return { ...base, status: "skipped", error: result.note };
  return { ...base, status: "error", error: result.error || result.note || "The platform did not accept the listing." };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  const session = await requireSession(req, res);
  if (!session) return;
  if (!enforceTenantRateLimit(session, res, "post-everything", { max: 10 })) return;

  const { productInfo, marketplaces, photo, confirmLive } = req.body || {};
  if (!productInfo || !productInfo.title || !Array.isArray(marketplaces) || marketplaces.length === 0 || marketplaces.length > MAX_MARKETPLACES) {
    return res.status(400).json({ success: false, error: "productInfo (with a title) and a list of marketplaces are required." });
  }
  const live = confirmLive === "PUBLISH_LIVE";
  const price = Number(productInfo.price);

  try {
    const imageUrl = await hostPhoto(photo).catch((err) => {
      console.error("[api/post-everything] photo hosting failed:", err.message);
      return null;
    });
    const sku = /^[A-Za-z0-9._-]{3,60}$/.test(String(productInfo.id || "")) ? String(productInfo.id) : `BL-${Date.now().toString(36).toUpperCase()}`;
    const product = {
      sku,
      title: String(productInfo.title).slice(0, 200),
      description: String(productInfo.description || ""),
      price: Number.isFinite(price) ? price : 0,
      quantity: 1,
      condition: productInfo.condition || null,
      image_url: imageUrl,
    };

    await publishToInventory({ ...product, imageUrl }, session.tenantId);

    const platforms = [...new Set(marketplaces.map((m) => PLATFORM_FOR[m]).filter(Boolean))];
    const posted = platforms.length ? await poster.postToAllPlatforms(session.tenantId, product, platforms, { live }) : {};

    const results = marketplaces.map((m) => toProgressItem(m, PLATFORM_FOR[m] ? posted[PLATFORM_FOR[m]] : null));
    return res.status(200).json({
      success: results.every((r) => r.status === "success"),
      live,
      sku,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[api/post-everything]", err.message);
    return res.status(err.statusCode && err.statusCode < 500 ? err.statusCode : 500).json({ success: false, error: err.statusCode && err.statusCode < 500 ? err.message : "Posting failed. Please try again." });
  }
}
