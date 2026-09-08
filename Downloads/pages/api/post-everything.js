// POST /api/post-everything
// Final orchestration: Post commercial to all socials + item to all marketplaces
// body: { commercialVideoPath, productData, socialTokens }

const fs = require("fs");
const { EbayConnector } = require("../../lib/channels/apiConnectors");
const { EtsyConnector } = require("../../lib/channels/apiConnectors");
const { buildManualPackage } = require("../../lib/channels/manualPackage");
const { buildCaption } = require("../../lib/channels/socialMediaConnector");
const { postToSocialMedia } = require("../../lib/socialMediaPosters");

const ebayConnector = new EbayConnector();
const etsyConnector = new EtsyConnector();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { commercialVideoPath, productData, socialTokens } = req.body || {};

    if (!commercialVideoPath || !productData) {
      return res.status(400).json({
        ok: false,
        error: "commercialVideoPath and productData required",
      });
    }

    // Load commercial video
    const videoBuffer = fs.readFileSync(commercialVideoPath);

    const results = {
      ok: true,
      product: productData.sku,
      marketplaces: [],
      social: [],
      errors: [],
    };

    // Step 1: Post to all 27 marketplaces (as before)
    const marketplaces = [
      "facebook", "poshmark", "craigslist", "mercari", "pinterest",
      "amazon", "woocommerce", "abeBooks", "alibris", "reverb",
      "discogs", "depop", "vinted", "grailed", "vestiaire", "realreal",
      "stockx", "goat", "shopify", "mercadoLibre", "fiveM", "tiktokShop",
    ];

    for (const platform of marketplaces) {
      try {
        const pkg = buildManualPackage(productData, platform);
        results.marketplaces.push({
          platform,
          title: pkg.fields.title,
          postUrl: pkg.postUrl,
          status: "package_ready",
        });
      } catch (err) {
        results.errors.push({ platform, type: "marketplace", error: err.message });
      }
    }

    // API platforms (post directly)
    try {
      await ebayConnector.createListing(productData, {}, {
        dryRun: false,
        confirm: true,
      });
      results.marketplaces.push({ platform: "ebay", status: "posted" });
    } catch (err) {
      results.errors.push({ platform: "ebay", type: "api", error: err.message });
    }

    try {
      await etsyConnector.createListing(productData, { targetState: "draft" });
      results.marketplaces.push({ platform: "etsy", status: "posted" });
    } catch (err) {
      results.errors.push({ platform: "etsy", type: "api", error: err.message });
    }

    // Step 2: Post commercial to all social platforms
    const socialPlatforms = [
      "instagram", "tiktok", "youtube", "facebook", "twitter",
      "linkedin", "snapchat", "pinterest"
    ];

    for (const platform of socialPlatforms) {
      if (!socialTokens || !socialTokens[platform]) {
        results.errors.push({
          platform,
          type: "social",
          error: `No access token for ${platform}`,
        });
        continue;
      }

      try {
        const caption = buildCaption(productData, platform);
        const postResult = await postToSocialMedia(
          platform,
          videoBuffer,
          caption,
          socialTokens[platform]
        );

        if (postResult.error) {
          results.errors.push({
            platform,
            type: "social",
            error: postResult.error,
          });
        } else {
          results.social.push({
            platform,
            url: postResult.url,
            status: "posted",
          });
        }
      } catch (err) {
        results.errors.push({
          platform,
          type: "social",
          error: err.message,
        });
      }
    }

    return res.status(200).json({
      ...results,
      summary: {
        marketplacesReady: results.marketplaces.filter(m => m.status === "posted" || m.status === "package_ready").length,
        socialPosted: results.social.filter(s => s.status === "posted").length,
        totalErrors: results.errors.length,
      },
    });
  } catch (err) {
    console.error("[api/post-everything]", err.message);
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
}
