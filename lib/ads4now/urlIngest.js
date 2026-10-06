/**
 * lib/ads4now/urlIngest.js — Product URL & Social Proof Ingest Engine
 * The ads4now move: paste any product URL, extract OpenGraph metadata,
 * product images, and harvest JSON-LD review stars & quotes.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { safeFetch } = require("../safeFetch");

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
// SVG is deliberately excluded: it can carry script when served from /uploads.
const IMAGE_EXT_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const UPLOADS_SUBDIR = path.join("public", "uploads");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * Harvest reviews & social proof from JSON-LD on the page
 */
function harvestReviews(html) {
  const reviews = {};
  const jsonLdMatches = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  for (const match of jsonLdMatches) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items) {
        if (!item || typeof item !== "object") continue;

        // Check Product schema or nested aggregateRating
        const agg =
          item.aggregateRating ||
          (item["@type"] === "Product" && item.aggregateRating) ||
          null;

        if (agg && agg.ratingValue) {
          reviews.rating = String(agg.ratingValue);
          reviews.count = String(agg.reviewCount || agg.ratingCount || "");
        }

        // Check for review quotes
        if (Array.isArray(item.review) && item.review.length > 0) {
          const firstReview = item.review[0];
          const quote = firstReview.reviewBody || firstReview.description;
          if (quote) {
            reviews.quote = quote.substring(0, 160).trim();
          }
        }
      }
    } catch {
      // Continue searching
    }
  }

  return reviews;
}

/**
 * Extract OpenGraph & Standard Meta Tags from HTML
 */
function extractMeta(html) {
  const meta = {};

  // Extract <meta property="..." content="..."> or <meta name="..." content="...">
  const metaMatches = html.matchAll(
    /<meta\s+[^>]*?(?:property|name)=["']([^"']+)["'][^>]*?content=["']([^"']*)["'][^>]*?>/gi
  );
  for (const match of metaMatches) {
    const key = match[1].toLowerCase();
    const val = match[2].trim();
    if (key && val && !meta[key]) {
      meta[key] = val;
    }
  }

  // Also check reverse attribute order: content="..." property="..."
  const reverseMetaMatches = html.matchAll(
    /<meta\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']([^"']+)["'][^>]*?>/gi
  );
  for (const match of reverseMetaMatches) {
    const val = match[1].trim();
    const key = match[2].toLowerCase();
    if (key && val && !meta[key]) {
      meta[key] = val;
    }
  }

  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].trim() : "";

  return { meta, pageTitle };
}

/**
 * Clean and normalize extracted price
 */
function parsePrice(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Download a remote image into public/uploads. Nothing is written unless the
 * response is a 2xx image/* (non-SVG) under the size cap. The filename is fully
 * server-generated; no part of the remote URL or headers reaches the disk path.
 * Returns the public web path (e.g. /uploads/import-....jpg).
 */
async function downloadImageSafely(imageUrl) {
  const imgRes = await safeFetch(imageUrl, {
    headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
    maxBytes: MAX_IMAGE_BYTES,
    timeoutMs: 25_000,
  });
  if (imgRes.status < 200 || imgRes.status >= 300) {
    throw new Error(`Image fetch failed (HTTP ${imgRes.status})`);
  }
  const contentType = String(imgRes.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  const ext = IMAGE_EXT_BY_TYPE[contentType];
  if (!ext) throw new Error(`Refusing non-image content-type: ${contentType || "none"}`);
  if (imgRes.body.length === 0) throw new Error("Empty image response");

  const filename = `import-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  const uploadsDir = path.resolve(process.cwd(), UPLOADS_SUBDIR);
  const diskPath = path.join(uploadsDir, path.basename(filename));
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(diskPath, imgRes.body);
  return `/uploads/${filename}`;
}

/**
 * Ingest product details and social proof from any store URL
 */
async function ingestProductUrl(url, options = {}) {
  const { downloadImage = false } = options; // destDir is no longer caller-controlled

  let targetUrl = url.trim();
  // https only (SSRF policy): upgrade plain http:// and bare hostnames.
  if (/^http:\/\//i.test(targetUrl)) {
    targetUrl = targetUrl.replace(/^http:\/\//i, "https://");
  } else if (!/^https:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  const res = await safeFetch(targetUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    maxBytes: MAX_HTML_BYTES,
    timeoutMs: 20_000,
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Failed to fetch product URL (HTTP ${res.status})`);
  }

  const html = res.body.toString("utf8");
  const { meta, pageTitle } = extractMeta(html);
  const reviews = harvestReviews(html);

  // Extract Title
  const title =
    meta["og:title"] ||
    meta["twitter:title"] ||
    pageTitle.split("|")[0].split("-")[0].trim() ||
    "Imported Product";

  // Extract Description
  const description =
    meta["og:description"] ||
    meta["twitter:description"] ||
    meta["description"] ||
    "";

  // Extract Price
  const rawPrice =
    meta["og:price:amount"] ||
    meta["product:price:amount"] ||
    meta["price"] ||
    null;
  const price = parsePrice(rawPrice) || 19.99;

  // Extract Product Image
  let imageUrl =
    meta["og:image:secure_url"] ||
    meta["og:image"] ||
    meta["twitter:image"] ||
    null;

  if (imageUrl && !imageUrl.startsWith("http")) {
    try {
      imageUrl = new URL(imageUrl, targetUrl).toString();
    } catch {}
  }

  // Optionally download image locally (SSRF-guarded, image/* only, size-capped)
  let localImagePath = null;
  if (downloadImage && imageUrl) {
    try {
      localImagePath = await downloadImageSafely(imageUrl);
    } catch (err) {
      console.warn("[urlIngest] Local image download failed:", err.message);
    }
  }

  // Extract Brand / Vendor
  const brand =
    meta["og:site_name"] ||
    meta["product:brand"] ||
    meta["brand"] ||
    new URL(targetUrl).hostname.replace(/^www\./, "").split(".")[0];

  return {
    title,
    description,
    price,
    brand: brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : "Store",
    image_url: localImagePath || imageUrl,
    source_url: targetUrl,
    reviews,
  };
}

module.exports = {
  ingestProductUrl,
  harvestReviews,
  extractMeta,
};
