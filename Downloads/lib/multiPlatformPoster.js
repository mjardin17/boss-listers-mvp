// lib/multiPlatformPoster.js
// Core multi-platform product posting orchestrator.
// Takes a product and posts it to selected platforms (eBay, Etsy, Amazon, TikTok)
// with platform-specific field mapping and error handling.

const { EbayConnector, EtsyConnector, AmazonConnector, TikTokShopConnector } = require('./channels/apiConnectors');

/**
 * Maps product fields to each platform's required schema.
 * Each platform has different field names and requirements.
 */
const PLATFORM_MAPPERS = {
  ebay: (product) => ({
    sku: product.sku,
    title: product.title,
    description: product.description || product.title,
    price: parseFloat(product.price) || 0,
    quantity: parseInt(product.quantity) || 1,
    category_id: product.category_id || "15687", // Default: General category
    condition: product.condition || "New",
    image_urls: product.image_urls || [],
    marketplace_id: product.marketplace_id || "EBAY_US",
    currency: product.currency || "USD",
    aspects: product.aspects || {},
  }),

  etsy: (product) => ({
    sku: product.sku,
    title: product.title,
    description: product.description || product.title,
    price: parseFloat(product.price) || 0,
    quantity: parseInt(product.quantity) || 1,
    taxonomy_id: product.taxonomy_id || 1,
    who_made: product.who_made || "i_did",
    when_made: product.when_made || "2020_2023",
    is_supply: product.is_supply || false,
    shipping_profile_id: product.shipping_profile_id || null,
    images: (product.image_urls || []).map((url) => ({ url })),
    tags: product.tags || [],
    materials: product.materials || [],
  }),

  amazon: (product) => ({
    sku: product.sku,
    title: product.title,
    description: product.description || product.title,
    price: parseFloat(product.price) || 0,
    quantity: parseInt(product.quantity) || 1,
    category: product.category || "Books",
    brand: product.brand || "Generic",
    condition: product.condition === "new" ? "New" : "Used",
    bullet_points: product.bullet_points || [
      product.description || product.title,
    ],
    image_urls: product.image_urls || [],
  }),

  "tiktok-shop": (product) => ({
    title: product.title,
    description: product.description || product.title,
    price: parseFloat(product.price) || 0,
    quantity: parseInt(product.quantity) || 1,
    sku: product.sku,
    category: product.category || "Unclassified",
    tags: product.tags || [],
    image_paths: product.image_urls || [],
    condition: product.condition || "New",
  }),
};

/**
 * Posts a product to multiple platforms simultaneously.
 *
 * @param {object} product - Product object with sku, title, description, price, quantity, etc.
 * @param {string[]} platforms - Array of platform IDs: ['ebay', 'etsy', 'amazon', 'tiktok-shop']
 * @param {object} options
 * @param {boolean} [options.dryRun=true] - If false, makes real API calls (requires confirmation)
 * @param {string} [options.confirm] - Must be "PUBLISH_LIVE" for live publishing
 * @param {string} [options.tenantId] - Tenant ID for per-tenant credentials
 * @param {object} [options.policies] - eBay-specific policies (fulfillment, payment, return)
 * @returns {Promise<object>} Results object: { eBay: {...}, etsy: {...}, etc. }
 * @throws {Error} If product validation fails or critical error occurs
 */
async function postProductToAllPlatforms(product, platforms = [], options = {}) {
  const { dryRun = true, confirm, tenantId, policies = {} } = options;

  // Validate product
  if (!product || !product.sku || !product.title) {
    throw new Error("Product must have sku and title");
  }

  if (!Array.isArray(platforms) || platforms.length === 0) {
    throw new Error("At least one platform must be selected");
  }

  const results = {};
  const connectors = {
    ebay: new EbayConnector(),
    etsy: new EtsyConnector(),
    amazon: new AmazonConnector(),
    "tiktok-shop": new TikTokShopConnector(),
  };

  // Post to each platform in parallel
  const promises = platforms.map(async (platform) => {
    const connector = connectors[platform];
    if (!connector) {
      results[platform] = {
        success: false,
        error: `Unknown platform: ${platform}`,
      };
      return;
    }

    try {
      // Map product fields to platform schema
      const mapper = PLATFORM_MAPPERS[platform];
      if (!mapper) {
        throw new Error(`No field mapper for platform: ${platform}`);
      }

      const mappedProduct = mapper(product);

      // Call appropriate connector method
      let listing;
      if (platform === "ebay") {
        listing = await connector.createListing(mappedProduct, policies, {
          dryRun,
          confirm,
          tenantId,
        });
      } else {
        listing = await connector.createListing(mappedProduct, {
          dryRun,
          confirm,
          tenantId,
        });
      }

      // Extract listing ID based on platform response format
      const listingId =
        listing.listing_id ||
        listing.offer_id ||
        listing.feedId ||
        listing.productId ||
        `${platform}-${Date.now()}`;

      results[platform] = {
        success: true,
        listingId,
        url: listing.url || null,
        publishedAt: new Date().toISOString(),
        response: listing,
      };
    } catch (err) {
      results[platform] = {
        success: false,
        error: err.message,
        code: err.code || "unknown_error",
        statusCode: err.statusCode || 500,
        details: {
          step: err.step || null,
          offerId: err.offerId || null,
          listingId: err.listingId || null,
        },
      };
    }
  });

  await Promise.all(promises);

  // Determine overall success: at least one platform succeeded
  const anySuccess = Object.values(results).some((r) => r.success);
  if (!anySuccess) {
    const errors = Object.entries(results)
      .filter(([, r]) => !r.success)
      .map(([p, r]) => `${p}: ${r.error}`)
      .join("; ");
    throw new Error(`All platforms failed: ${errors}`);
  }

  return results;
}

/**
 * Retry a failed posting attempt for specific platforms.
 *
 * @param {object} product - Product object
 * @param {string[]} platformsToRetry - Platforms that failed
 * @param {object} priorResults - Results from first attempt (to skip successful ones)
 * @param {object} options - Same as postProductToAllPlatforms
 * @returns {Promise<object>} Updated results object
 */
async function retryFailedPlatforms(
  product,
  platformsToRetry = [],
  priorResults = {},
  options = {}
) {
  // Filter to only failed platforms
  const failedPlatforms = platformsToRetry.filter(
    (p) => priorResults[p] && !priorResults[p].success
  );

  if (failedPlatforms.length === 0) {
    return priorResults;
  }

  // Retry with exponential backoff (simple: 1 second wait)
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const retryResults = await postProductToAllPlatforms(
    product,
    failedPlatforms,
    options
  );

  // Merge results: keep successful ones from first attempt, add retried ones
  return {
    ...priorResults,
    ...retryResults,
  };
}

module.exports = {
  postProductToAllPlatforms,
  retryFailedPlatforms,
  PLATFORM_MAPPERS,
};
