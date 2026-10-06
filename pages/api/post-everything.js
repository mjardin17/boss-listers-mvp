// POST /api/post-everything
// Final orchestration: Post commercial to all socials + item to all marketplaces
// body: { commercialVideoPath, productData, socialTokens }

const fs = require("fs");
const path = require("path");
const { EbayConnector } = require("../../lib/channels/apiConnectors");
const { EtsyConnector } = require("../../lib/channels/apiConnectors");
const { buildManualPackage } = require("../../lib/channels/manualPackage");
const { buildCaption } = require("../../lib/channels/socialMediaConnector");
const { postToSocialMedia } = require("../../lib/socialMediaPosters");
const { resolveSession } = require("../../lib/supabaseAuth");

const ebayConnector = new EbayConnector();
const etsyConnector = new EtsyConnector();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // This route is excluded from middleware.js's site-wide gate on the
  // documented assumption that "every API route already enforces its own
  // real auth" — it didn't. Unlike every other createListing() caller in
  // this codebase (all default dryRun to true; see create-listing.js),
  // this one hardcoded dryRun:false with no session check at all, so
  // anyone who could reach this server could trigger a real eBay publish.
  // Same resolveSession pattern as pages/api/channels/ebay/create-listing.js.
  const authHeader = req.headers.authorization || "";
  const userAccessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const session = userAccessToken ? await resolveSession(process.env, userAccessToken) : null;
  if (!session) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const { commercialVideoPath, productData, socialTokens, dryRun = true, confirm } = req.body || {};

    if (!commercialVideoPath || !productData) {
      return res.status(400).json({
        ok: false,
        error: "commercialVideoPath and productData required",
      });
    }

    // Confine to the project's public/ folder and to video files: this path
    // comes from the client and is read from disk, then posted to social.
    const publicRoot = path.resolve(process.cwd(), "public") + path.sep;
    const videoFile = path.resolve(process.cwd(), String(commercialVideoPath));
    const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v"]);
    if (!videoFile.startsWith(publicRoot) || !VIDEO_EXTENSIONS.has(path.extname(videoFile).toLowerCase())) {
      return res.status(400).json({ ok: false, error: "commercialVideoPath must be a video file inside public/" });
    }
    const videoBuffer = fs.readFileSync(videoFile);

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

    // API platforms (post directly). dryRun/confirm come from the caller's
    // request body (default dryRun:true, matching every connector's own
    // default) instead of being hardcoded live — a missing/omitted flag
    // must never accidentally reach a live publish.
    try {
      await ebayConnector.createListing(productData, {}, {
        dryRun,
        confirm,
        tenantId: session.tenantId,
      });
      results.marketplaces.push({ platform: "ebay", status: dryRun ? "dry_run" : "posted" });
    } catch (err) {
      results.errors.push({ platform: "ebay", type: "api", error: err.message });
    }

    try {
      await etsyConnector.createListing(productData, {
        targetState: "draft",
        dryRun,
        confirm,
        tenantId: session.tenantId,
      });
      results.marketplaces.push({ platform: "etsy", status: dryRun ? "dry_run" : "posted" });
    } catch (err) {
      results.errors.push({ platform: "etsy", type: "api", error: err.message });
    }

    // Step 2: Post commercial to all social platforms
    const socialPlatforms = [
      "instagram", "tiktok", "youtube", "facebook", "twitter",
      "linkedin", "snapchat", "pinterest"
    ];

    // Social posts have no dry-run mode in postToSocialMedia, so a dry run
    // must not reach them at all.
    for (const platform of dryRun ? [] : socialPlatforms) {
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
