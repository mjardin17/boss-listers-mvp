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

const { XMLParser } = require("fast-xml-parser");
const { EbayConnector } = require("./channels/apiConnectors");

class EbayInventoryFetcher {
  constructor() {
    this.connector = new EbayConnector();
    this.baseUrl =
      process.env.EBAY_ENVIRONMENT === "sandbox"
        ? "https://api.sandbox.ebay.com"
        : "https://api.ebay.com";
    this.tradingApiUrl =
      process.env.EBAY_ENVIRONMENT === "sandbox"
        ? "https://api.sandbox.ebay.com/ws/api.dll"
        : "https://api.ebay.com/ws/api.dll";
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      isArray: (name) => name === "Item",
    });
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

    console.log(
      `[eBayInventoryFetcher] Starting inventory fetch for tenant ${tenantId}`
    );

    // Modern Inventory API items (created via the Inventory API / SKU-based flow).
    // A 404 on the first page means the seller has zero items there — that's a
    // normal, non-fatal state, not an error (eBay's API design, not a bug).
    let modernItems = [];
    try {
      modernItems = await this._fetchAllModernItems(tenantId, limit, details);
    } catch (err) {
      if (err.statusCode === 404) {
        console.log(
          "[eBayInventoryFetcher] No items in the modern Inventory API (expected for accounts that list via eBay's classic flow)"
        );
      } else {
        throw err;
      }
    }

    // Classic/Trading API listings (created via eBay's own website/seller hub).
    // Most sellers' real listings live here, not in the modern Inventory API.
    let legacyItems = [];
    try {
      legacyItems = await this._fetchAllLegacyItems(tenantId);
    } catch (err) {
      console.error(
        "[eBayInventoryFetcher] Legacy Trading API fetch failed:",
        err.message
      );
      // Only fatal if we also got nothing from the modern API.
      if (modernItems.length === 0) {
        throw err;
      }
    }

    // Merge, de-duplicating by eBay listing ID (prefer the modern entry on overlap).
    const byListingId = new Map();
    for (const item of legacyItems) {
      byListingId.set(item.ebayListingId, item);
    }
    for (const item of modernItems) {
      byListingId.set(item.ebayListingId, item);
    }
    const allItems = Array.from(byListingId.values());

    console.log(
      `[eBayInventoryFetcher] Completed fetch: ${allItems.length} total items ` +
      `(${modernItems.length} modern, ${legacyItems.length} legacy)`
    );

    return allItems;
  }

  /**
   * Paginate through the modern Inventory API.
   * @private
   */
  async _fetchAllModernItems(tenantId, limit, details) {
    let allItems = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await this._fetchPage(tenantId, offset, limit, details);
      allItems = allItems.concat(result.items || []);
      hasMore = result.hasMore;
      offset += limit;

      console.log(
        `[eBayInventoryFetcher] [modern] Fetched ${result.items?.length || 0} items ` +
        `(total: ${allItems.length}, hasMore: ${hasMore})`
      );
    }

    return allItems;
  }

  /**
   * Paginate through eBay's legacy Trading API (GetMyeBaySelling / ActiveList)
   * to pick up listings created through eBay's own website, which the modern
   * Inventory API never sees.
   * @private
   */
  async _fetchAllLegacyItems(tenantId) {
    let allItems = [];
    let pageNumber = 1;
    let totalPages = 1;
    const entriesPerPage = 100;

    do {
      const result = await this._fetchLegacyPage(tenantId, pageNumber, entriesPerPage);
      allItems = allItems.concat(result.items);
      totalPages = result.totalPages || 1;

      console.log(
        `[eBayInventoryFetcher] [legacy] Fetched page ${pageNumber}/${totalPages}, ` +
        `${result.items.length} items (total: ${allItems.length})`
      );

      pageNumber += 1;
    } while (pageNumber <= totalPages);

    return allItems;
  }

  /**
   * Fetch a single page of active listings from eBay's Trading API.
   * Uses the tenant's OAuth token via the IAF token header (Trading API's
   * OAuth-compatible auth path — no separate Auth'n'Auth token needed).
   * @private
   */
  async _fetchLegacyPage(tenantId, pageNumber, entriesPerPage) {
    const accessToken = await this.connector._getAccessToken(tenantId);

    const body =
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<ActiveList>` +
      `<Include>true</Include>` +
      `<Pagination>` +
      `<EntriesPerPage>${entriesPerPage}</EntriesPerPage>` +
      `<PageNumber>${pageNumber}</PageNumber>` +
      `</Pagination>` +
      `</ActiveList>` +
      `</GetMyeBaySellingRequest>`;

    let res;
    try {
      res = await fetch(this.tradingApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml",
          "X-EBAY-API-SITEID": "0",
          "X-EBAY-API-COMPATIBILITY-LEVEL": "1155",
          "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
          "X-EBAY-API-IAF-TOKEN": accessToken,
        },
        body,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new Error(
        `eBay Trading API request failed: ${
          err.name === "TimeoutError" ? "Timeout (30s)" : err.message
        }`
      );
    }

    const xmlText = await res.text();

    if (!res.ok) {
      throw new Error(`eBay Trading API returned HTTP ${res.status}: ${xmlText}`);
    }

    const parsed = this.xmlParser.parse(xmlText);
    const response = parsed.GetMyeBaySellingResponse;

    if (!response) {
      throw new Error(`eBay Trading API returned an unexpected response shape`);
    }

    if (response.Ack === "Failure") {
      const errors = response.Errors
        ? JSON.stringify(response.Errors)
        : "Unknown error";
      throw new Error(`eBay Trading API GetMyeBaySelling failed: ${errors}`);
    }

    const activeList = response.ActiveList;
    const rawItems = activeList?.ItemArray?.Item || [];
    const totalPages = Number(
      activeList?.PaginationResult?.TotalNumberOfPages || 1
    );

    return {
      items: rawItems.map((item) => this._normalizeLegacyItem(item)),
      totalPages,
    };
  }

  /**
   * Transform a legacy Trading API item into the same normalized shape
   * produced by _normalizeInventoryItem, so both sources flow through the
   * same InventorySyncService merge logic unchanged.
   * @private
   */
  _normalizeLegacyItem(item) {
    const listingId = item.ItemID != null ? String(item.ItemID) : null;
    // Classic listings frequently have no SKU set at all — fall back to a
    // synthetic, stable SKU derived from the eBay item ID so the row still
    // upserts instead of being dropped for "Missing SKU".
    const sku = item.SKU || (listingId ? `ebay-${listingId}` : null);

    const title = item.Title || "(No title provided)";

    const currentPrice = item.SellingStatus?.CurrentPrice;
    const price =
      currentPrice && typeof currentPrice === "object"
        ? parseFloat(currentPrice["#text"])
        : currentPrice != null
        ? parseFloat(currentPrice)
        : null;

    const quantitySold = Number(item.SellingStatus?.QuantitySold || 0);
    const quantityListed = Number(item.Quantity || 0);
    const quantity = Math.max(0, quantityListed - quantitySold);

    const conditionDisplayName = item.ConditionDisplayName || "UNKNOWN";
    const condition = this._normalizeCondition(
      conditionDisplayName.toUpperCase().replace(/\s+/g, "_")
    );

    const galleryUrl = item.PictureDetails?.GalleryURL || null;
    const categoryId = item.PrimaryCategory?.CategoryID || null;

    return {
      sku,
      title: String(title).substring(0, 255),
      description: null, // Not returned by GetMyeBaySelling; would need GetItem per-listing
      quantity,
      price: Number.isFinite(price) ? price : null,
      condition,
      imageUrl: galleryUrl,
      imageUrls: galleryUrl ? [galleryUrl] : [],
      ebayListingId: listingId,
      ebayCategoryId: categoryId,
      lastUpdated: new Date().toISOString(),
      source: "ebay",
      ebayRaw: {
        listing_id: listingId,
        category_id: categoryId,
        sku,
        quantity,
        price: currentPrice,
        condition: conditionDisplayName,
        api: "trading",
      },
    };
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
      const err = new Error(
        `eBay Inventory API returned HTTP ${res.status}: ${detail}`
      );
      err.statusCode = res.status;
      throw err;
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
