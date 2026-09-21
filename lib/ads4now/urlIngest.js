/**
 * lib/ads4now/urlIngest.js — Product URL & Social Proof Ingest Engine
 * The ads4now move: paste any product URL, extract OpenGraph metadata,
 * product images, and harvest JSON-LD review stars & quotes.
 */

const fs = require("fs");
const path = require("path");

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
 * Ingest product details and social proof from any store URL
 */
async function ingestProductUrl(url, options = {}) {
  const { downloadImage = false, destDir = "public/uploads" } = options;

  let targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  const res = await fetch(targetUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch product URL (HTTP ${res.status}): ${targetUrl}`);
  }

  const html = await res.text();
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

  // Optionally download image locally
  let localImagePath = null;
  if (downloadImage && imageUrl) {
    try {
      const imgRes = await fetch(imageUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(25_000),
      });
      if (imgRes.ok) {
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        const filename = `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const diskPath = path.join(process.cwd(), destDir, filename);
        fs.mkdirSync(path.dirname(diskPath), { recursive: true });
        fs.writeFileSync(diskPath, buffer);
        localImagePath = `/${destDir.replace(/^public\//, "")}/${filename}`;
      }
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
