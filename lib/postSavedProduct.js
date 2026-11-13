// Core of POST /api/inventory/post-to-platforms: posts one saved `products`
// row through the canonical MultiPlatformPoster. Kept out of the route so the
// live/dry-run decision is testable without Next or Supabase.
//
// Dry run is the default. It goes live ONLY when the body carries
// confirmLive: "PUBLISH_LIVE", which the Post and Add Product pages send after
// the seller confirms. Retired storefronts (Shopify) are reported, never posted.

const { isLiveConfirmed, splitRetiredPlatforms, RETIRED_PLATFORMS } = require("./multiPlatformPoster");

/**
 * @param {{ tenantId: string, body: object, loadProduct: (sku: string) => Promise<object|null>, poster: { postToAllPlatforms: Function } }} args
 * @returns {Promise<{ status: number, json: object }>}
 */
async function postSavedProduct({ tenantId, body, loadProduct, poster }) {
  const { productSKU, platforms = ["ebay"] } = body || {};
  if (!productSKU) return { status: 400, json: { ok: false, error: "productSKU is required" } };

  const { active, retired } = splitRetiredPlatforms(platforms);
  if (!active.length && !retired.length) {
    return { status: 400, json: { ok: false, error: "Pick at least one platform" } };
  }

  const product = await loadProduct(productSKU);
  if (!product) return { status: 404, json: { ok: false, error: "Product not found" } };

  const live = isLiveConfirmed(body);
  const results = active.length ? await poster.postToAllPlatforms(tenantId, product, active, { live }) : {};
  for (const platform of retired) results[platform] = { success: false, retired: true, error: RETIRED_PLATFORMS[platform] };

  const successCount = Object.values(results).filter((r) => r && r.success).length;
  return {
    status: 200,
    json: { ok: true, live, results, successCount, totalPlatforms: active.length + retired.length },
  };
}

module.exports = { postSavedProduct };
