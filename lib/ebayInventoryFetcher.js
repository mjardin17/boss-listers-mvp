/**
 * eBay Inventory Fetcher
 *
 * Pulls all active listings from the eBay Inventory API, handling:
 * - OAuth token management (via EbayConnector)
 * - Pagination for large inventories (1000+ items)
 * - SKU extraction and deduplication
 * - Detailed product data (price, quantity, condition, images)
 *
 * Uses the tenant's own eBay account (via _getTenantRefreshToken),
 * not the shared app-owner credentials.
 */

const { EbayConnector } = require("./channels/apiConnectors");

class EbayInventoryFetcher {
  constructor() {
    this.connector = new EbayConnector();
    this.baseUrl =
      process.env.EBAY_ENVIRONMENT === "sandbox"
        ? "https://api.sandbox.ebay.com"
        : "https://api.ebay.com";
  }

  /**
   * Fetch all active listings from eBay Inventory API.
   *
   * @param {string} tenantId - Tenant ID to fetch inventory for
   * @param {object} [options] - Configuration options
   * @param {number} [options.limit=100] - Items per page (max 1000)
   * @param {boolean} [options.details=true] - Include full product details
   * @returns {Promise<Array>} Array of normalized products with eBay data
   * @throws {Error} On eBay API failure, token refresh failure, or configuration error
   */
  async fetchAllListings(tenantId, options = {}) {
    const { limit = 100, details = true } = options;

    if (!tenantId) {
      throw new Error("tenantId is required to fetch eBay inventory");
    }

    if (limit < 1 || limit > 1000) {
      throw new Error("limit must be between 1 and 1000");
    }

    let allItems = [];
    let offset = 0;
    let hasMore = true;

    console.log(
      `[eBayInventoryFetcher] Starting inventory fetch for tenant ${tenantId}`
    );

    while (hasMore) {
      try {
        const result = await this._fetchPage(tenantId, offset, limit, details);
        allItems = allItems.concat(result.items || []);

        hasMore = result.hasMore;
        offset += limit;

        console.log(
          `[eBayInventoryFetcher] Fetched ${result.items?.length || 0} items ` +
          `(total: ${allItems.length}, hasMore: ${hasMore})`
        );
      } catch (err) {
        console.error(
          `[eBayInventoryFetcher] Page fetch failed at offset ${offset}:`,
          err.message
        );
        throw err;
      }
    }

    console.log(
      `[eBayInventoryFetcher] Completed fetch: ${allItems.length} total items`
    );

    return allItems;
  }

  /**
   * Fetch a single page of eBay inventory (internal).
   *
   * @private
   * @param {string} tenantId - Tenant ID
   * @param {number} offset - Pagination offset
   * @param {number} limit - Items per page
   * @param {boolean} details - Include detailed info
   * @returns {Promise<object>} {items: [], hasMore: boolean}
   */
  async _fetchPage(tenantId, offset, limit, details) {
    const accessToken = await this.connector._getAccessToken(tenantId);

    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
    });

    if (details) {
      params.append("fieldgroups", "INVENTORY,PRODUCT_WITH_SINGLE_VARIATION");
    }

    const url = `${this.baseUrl}/sell/inventory/v1/inventory?${params.toString()}`;

    let res;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new Error(
        `eBay API request failed: ${
          err.name === "TimeoutError"
            ? "Timeout (30s)"
            : err.message
        }`
      );
    }

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(
        `eBay Inventory API returned HTTP ${res.status}: ${detail}`
      );
    }

    const data = await res.json();

    // eBay returns total, but we must also check if we got a full page
    // to detect if there's more.
    const items = data.inventories || [];
    const total = data.total || 0;
    const hasMore = offset + limit < total;

    return {
      items: items.map((inv) => this._normalizeInventoryItem(inv)),
      hasMore,
      total,
      offset,
    };
  }

  /**
   * Transform eBay inventory item to internal product format.
   *
   * @private
   * @param {object} item - eBay inventory item
   * @returns {object} Normalized product data
   */
  _normalizeInventoryItem(item) {
    const sku = item.sku || null;
    const title =
      item.product?.title ||
      item.listing?.title ||
      "(No title provided)";
    const quantity = item.quantity || 0;
    const price =
      item.price?.value ||
      item.listing?.price?.value ||
      null;
    const condition = item.condition || item.product?.condition || "UNKNOWN";
    const images =
      item.product?.imageUrls ||
      item.listing?.images ||
      [];
    const categoryId =
      item.listing?.categoryId ||
      item.product?.categoryId ||
      null;
    const listingId = item.listingId || null;

    const description =
      item.product?.description ||
      item.listing?.description ||
      null;

    // Extract condition to standard inventory format
    const normalizedCondition = this._normalizeCondition(condition);

    return {
      sku,
      title: title.substring(0, 255), // Enforce DB column limit
      description,
      quantity: Math.max(0, quantity),
      price: price ? parseFloat(price) : null,
      condition: normalizedCondition,
      imageUrl: images?.[0] || null,
      imageUrls: images,
      ebayListingId: listingId,
      ebayCategoryId: categoryId,
      lastUpdated: new Date().toISOString(),
      source: "ebay",
      // Preserve original eBay fields for troubleshooting
      ebayRaw: {
        listing_id: listingId,
        category_id: categoryId,
        sku,
        quantity,
        price: item.price,
        condition,
      },
    };
  }

  /**
   * Normalize eBay condition codes to inventory condition values.
   *
   * @private
   * @param {string} ebayCondition - eBay condition code
   * @returns {string} Normalized condition
   */
  _normalizeCondition(ebayCondition) {
    const conditionMap = {
      NEW: "New",
      REFURBISHED: "Refurbished",
      USED: "Used",
      "VERY_GOOD": "Very Good",
      "LIKE_NEW": "Like New",
      UNKNOWN: "Unknown",
    };
    return conditionMap[ebayCondition] || "Unknown";
  }

  /**
   * Fetch a single product's details from eBay Inventory API.
   * Used for sync status checks and individual product updates.
   *
   * @param {string} tenantId - Tenant ID
   * @param {string} sku - Product SKU
   * @returns {Promise<object>} Normalized product data
   */
  async fetchProductBySku(tenantId, sku) {
    if (!sku || !tenantId) {
      throw new Error("tenantId and sku are required");
    }

    const accessToken = await this.connector._getAccessToken(tenantId);

    const url =
      `${this.baseUrl}/sell/inventory/v1/inventory/${encodeURIComponent(sku)}` +
      `?fieldgroups=INVENTORY,PRODUCT_WITH_SINGLE_VARIATION`;

    let res;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new Error(
        `eBay API request failed: ${
          err.name === "TimeoutError"
            ? "Timeout (15s)"
            : err.message
        }`
      );
    }

    if (res.status === 404) {
      return null; // SKU not found on eBay
    }

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(
        `eBay Inventory API returned HTTP ${res.status}: ${detail}`
      );
    }

    const item = await res.json();
    return this._normalizeInventoryItem(item);
  }
}

module.exports = { EbayInventoryFetcher };
