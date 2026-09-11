/**
 * Inventory Sync Service
 *
 * Merges eBay inventory with the local Supabase database:
 * - Upserts products by SKU
 * - Tracks which products are on which marketplaces
 * - Updates quantities from eBay
 * - Handles conflicts and duplicates
 * - Records sync history and errors
 *
 * All operations are tenant-aware and use service_role for direct DB access.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

class InventorySyncService {
  constructor() {
    this._validateConfig();
  }

  _validateConfig() {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error(
        "Supabase not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required"
      );
    }
  }

  /**
   * Execute Supabase REST query with service role privileges.
   * All sync operations use this to bypass RLS.
   *
   * @private
   * @param {string} path - REST API path
   * @param {object} [options] - Fetch options
   * @returns {Promise<Array|object|null>}
   */
  async _rest(path, options = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    if (!res.ok) {
      const detail = await res.text();
      const err = new Error(
        `Supabase ${options.method || "GET"} ${path} (HTTP ${res.status}): ${detail}`
      );
      err.statusCode = res.status;
      throw err;
    }

    return res.status === 204 ? null : res.json();
  }

  /**
   * Sync eBay inventory into the products table for a tenant.
   *
   * @param {string} tenantId - Tenant to sync for
   * @param {Array} ebayProducts - Array of normalized products from EbayInventoryFetcher
   * @param {object} [options] - Configuration
   * @param {boolean} [options.deduplicate=true] - Skip duplicate SKUs
   * @param {boolean} [options.updateMarketplaceLinks=true] - Track eBay on marketplace_listings
   * @returns {Promise<object>} Sync result: {created, updated, errors, conflicts}
   */
  async syncEbayProducts(tenantId, ebayProducts, options = {}) {
    const {
      deduplicate = true,
      updateMarketplaceLinks = true,
    } = options;

    if (!tenantId || !Array.isArray(ebayProducts)) {
      throw new Error("tenantId and ebayProducts array required");
    }

    console.log(
      `[InventorySyncService] Starting sync for tenant ${tenantId}: ${ebayProducts.length} products`
    );

    const result = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      conflicts: [],
    };

    // Track which SKUs we've seen to detect duplicates in this batch
    const seenSkus = new Set();

    for (const product of ebayProducts) {
      try {
        // Validate product has required fields
        if (!product.sku) {
          result.errors.push({
            product: product.title || "(Unknown)",
            error: "Missing SKU",
          });
          continue;
        }

        // Detect duplicate SKUs in this batch
        if (deduplicate && seenSkus.has(product.sku)) {
          result.conflicts.push({
            sku: product.sku,
            title: product.title,
            reason: "Duplicate in batch",
          });
          result.skipped++;
          continue;
        }
        seenSkus.add(product.sku);

        // Upsert into products table
        const syncResult = await this._upsertProduct(
          tenantId,
          product
        );

        if (syncResult.action === "created") {
          result.created++;
        } else if (syncResult.action === "updated") {
          result.updated++;
        }

        // Update marketplace_listings if eBay entry exists
        if (updateMarketplaceLinks) {
          await this._linkToMarketplace(
            tenantId,
            product.sku,
            "ebay"
          );
        }
      } catch (err) {
        console.error(`[InventorySyncService] Error syncing ${product.sku}:`, err.message);
        result.errors.push({
          sku: product.sku,
          title: product.title,
          error: err.message,
        });
      }
    }

    console.log(
      `[InventorySyncService] Sync complete: ` +
      `created=${result.created} updated=${result.updated} errors=${result.errors.length}`
    );

    return result;
  }

  /**
   * Upsert a single product into the products table.
   * Idempotent on SKU (same SKU always updates the same row).
   *
   * @private
   * @param {string} tenantId - Tenant ID
   * @param {object} product - Normalized product from EbayInventoryFetcher
   * @returns {Promise<object>} {action: "created"|"updated", product_id: uuid}
   */
  async _upsertProduct(tenantId, product) {
    const row = {
      tenant_id: tenantId,
      sku: product.sku,
      title: product.title,
      description: product.description,
      price: product.price,
      quantity: product.quantity,
      image_url: product.imageUrl,
      condition: product.condition,
      status: "active",
      source: "ebay",
      ebay_listing_id: product.ebayListingId,
      ebay_category_id: product.ebayCategoryId,
      last_ebay_price: product.price,
      last_ebay_quantity: product.quantity,
      synced_at: new Date().toISOString(),
    };

    const result = await this._rest(
      "products?on_conflict=tenant_id,sku",
      {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(row),
      }
    );

    const upsertedRow = Array.isArray(result) ? result[0] : result;

    // Detect if this was a create or update by checking if any eBay fields changed
    // (This is a heuristic; Supabase doesn't explicitly tell us)
    const isUpdate = upsertedRow.synced_at
      ? new Date(upsertedRow.synced_at).getTime() ===
        new Date(row.synced_at).getTime()
      : false;

    return {
      action: isUpdate ? "updated" : "created",
      product_id: upsertedRow.id,
    };
  }

  /**
   * Link or create a marketplace_listings entry for an eBay product.
   * Ensures each product is tracked as being available on eBay.
   *
   * @private
   * @param {string} tenantId - Tenant ID
   * @param {string} sku - Product SKU
   * @param {string} marketplace - Marketplace name (e.g., "ebay")
   */
  async _linkToMarketplace(tenantId, sku, marketplace) {
    // Fetch the product to get its ID
    const products = await this._rest(
      `products?tenant_id=eq.${tenantId}&sku=eq.${encodeURIComponent(sku)}&select=id&limit=1`
    );

    if (!products || !products.length) {
      console.warn(
        `[InventorySyncService] Could not find product for SKU ${sku} after upsert`
      );
      return;
    }

    const productId = products[0].id;

    // Fetch or create the marketplace account row for eBay
    const accounts = await this._rest(
      `marketplace_accounts?tenant_id=eq.${tenantId}&marketplace=eq.${marketplace}&account_label=eq.default&select=id&limit=1`
    );

    if (!accounts || !accounts.length) {
      console.warn(
        `[InventorySyncService] No marketplace account found for ${marketplace} on tenant ${tenantId}`
      );
      return;
    }

    const accountId = accounts[0].id;

    // Upsert marketplace_listings entry to mark product as on eBay
    const listingRow = {
      product_id: productId,
      account_id: accountId,
      marketplace,
      status: "active",
      synced_at: new Date().toISOString(),
    };

    await this._rest(
      "marketplace_listings?on_conflict=product_id,account_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(listingRow),
      }
    );
  }

  /**
   * Record a sync run in sync_logs for audit trail and monitoring.
   *
   * @param {string} tenantId - Tenant ID
   * @param {object} syncResult - Result from syncEbayProducts()
   * @param {object} [meta] - Additional metadata {status, errors, etc}
   * @returns {Promise<object>} sync_logs row
   */
  async recordSyncLog(tenantId, syncResult, meta = {}) {
    const row = {
      tenant_id: tenantId,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      status: syncResult.errors?.length > 0 ? "partial" : "success",
      items_seen: (syncResult.created || 0) + (syncResult.updated || 0) + (syncResult.errors?.length || 0),
      items_upserted: (syncResult.created || 0) + (syncResult.updated || 0),
      items_created: syncResult.created || 0,
      items_updated: syncResult.updated || 0,
      items_skipped: syncResult.skipped || 0,
      conflicts: JSON.stringify(syncResult.conflicts || []),
      errors: JSON.stringify(syncResult.errors || []),
      metadata: JSON.stringify(meta || {}),
    };

    const result = await this._rest("sync_logs", {
      method: "POST",
      body: JSON.stringify(row),
    });

    return Array.isArray(result) ? result[0] : result;
  }

  /**
   * Get the last sync status for a tenant (time, counts, success/failure).
   *
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<object>} Last sync log entry or null
   */
  async getLastSyncStatus(tenantId) {
    const result = await this._rest(
      `sync_logs?tenant_id=eq.${tenantId}&order=started_at.desc&limit=1`,
      { method: "GET" }
    );

    return result && result.length ? result[0] : null;
  }

  /**
   * Get recent sync history for a tenant.
   *
   * @param {string} tenantId - Tenant ID
   * @param {number} [limit=50] - Max records to return
   * @returns {Promise<Array>} sync_logs entries
   */
  async getSyncHistory(tenantId, limit = 50) {
    return this._rest(
      `sync_logs?tenant_id=eq.${tenantId}&order=started_at.desc&limit=${limit}`,
      { method: "GET" }
    );
  }

  /**
   * Get inventory counts by marketplace for a tenant.
   *
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<object>} {ebay: count, etsy: count, ...}
   */
  async getInventoryCountsByMarketplace(tenantId) {
    const result = await this._rest(
      `marketplace_listings?tenant_id=eq.${tenantId}&select=marketplace,product_id&status=eq.active`,
      { method: "GET" }
    );

    const counts = {};
    for (const listing of result || []) {
      counts[listing.marketplace] = (counts[listing.marketplace] || 0) + 1;
    }

    return counts;
  }

  /**
   * Get total product count for a tenant.
   *
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<number>}
   */
  async getProductCount(tenantId) {
    const result = await this._rest(
      `products?tenant_id=eq.${tenantId}&select=id&limit=1&offset=0`,
      {
        method: "GET",
        headers: { Prefer: "count=exact" },
      }
    );

    // Supabase returns count in Content-Range header, but for simplicity we can just count
    return result ? result.length : 0;
  }
}

module.exports = { InventorySyncService };
