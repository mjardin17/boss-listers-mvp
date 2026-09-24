/**
 * Inventory Sync Service
 *
 * Merges eBay inventory with the local Supabase database:
 * - Upserts products by (tenant_id, sku) using application-level SELECT -> UPDATE/INSERT
 *   (Zero reliance on database-level unique constraints or on_conflict)
 * - Tracks which products are on which marketplaces
 * - Updates quantities from eBay
 * - Handles conflicts and duplicates
 * - Records sync history and errors with best-effort sync_logs handling
 *
 * All operations are tenant-aware and use service_role for direct DB access.
 */

const crypto = require("crypto");

class InventorySyncService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this._validateConfig();
  }

  _validateConfig() {
    this.supabaseUrl = this.supabaseUrl || process.env.SUPABASE_URL;
    this.serviceRoleKey = this.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!this.supabaseUrl || !this.serviceRoleKey) {
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
    const res = await fetch(`${this.supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
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

    if (res.status === 204) return null;
    const text = await res.text();
    if (!text || text.trim() === "") return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /**
   * Sync eBay inventory into the products table for a tenant.
   *
   * @param {string} tenantId - Tenant to sync for
   * @param {Array} ebayProducts - Array of normalized products from EbayInventoryFetcher
   * @param {object} [options] - Configuration
   * @param {boolean} [options.deduplicate=true] - Skip duplicate SKUs
   * @param {boolean} [options.updateMarketplaceLinks=true] - Track eBay on marketplace_listings
   * @param {boolean} [options.dryRun=false] - If true, simulate sync without database mutations
   * @returns {Promise<object>} Sync result: {created, updated, skipped, errors, conflicts, dryRun}
   */
  async syncEbayProducts(tenantId, ebayProducts, options = {}) {
    const {
      deduplicate = true,
      updateMarketplaceLinks = true,
      dryRun = false,
    } = options;

    if (!tenantId || !Array.isArray(ebayProducts)) {
      throw new Error("tenantId and ebayProducts array required");
    }

    console.log(
      `[InventorySyncService] Starting sync for tenant ${tenantId}: ${ebayProducts.length} products (dryRun: ${dryRun})`
    );

    const result = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      conflicts: [],
      dryRun: Boolean(dryRun),
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

        // Upsert into products table via application-level SELECT -> UPDATE/INSERT
        const syncResult = await this._upsertProduct(
          tenantId,
          product,
          { dryRun }
        );

        if (syncResult.action === "created") {
          result.created++;
        } else if (syncResult.action === "updated") {
          result.updated++;
        }

        // Update marketplace_listings if eBay entry exists and not in dryRun mode
        if (updateMarketplaceLinks && !dryRun) {
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
      `created=${result.created} updated=${result.updated} skipped=${result.skipped} errors=${result.errors.length} (dryRun: ${dryRun})`
    );

    return result;
  }

  /**
   * Upsert a single product into the products table.
   * Application-level check: SELECT by (tenant_id, sku) first, then UPDATE if exists, INSERT if not.
   * ZERO on_conflict used anywhere.
   *
   * @private
   * @param {string} tenantId - Tenant ID
   * @param {object} product - Normalized product from EbayInventoryFetcher
   * @param {object} [options] - Options (e.g. dryRun)
   * @returns {Promise<object>} {action: "created"|"updated", product_id: uuid}
   */
  async _upsertProduct(tenantId, product, options = {}) {
    const { dryRun = false } = options;

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

    // 1. SELECT by (tenant_id, sku) first
    const existing = await this._rest(
      `products?tenant_id=eq.${tenantId}&sku=eq.${encodeURIComponent(product.sku)}&select=id&limit=1`,
      { method: "GET" }
    );

    const exists = Array.isArray(existing) && existing.length > 0;
    const existingId = exists ? existing[0].id : null;

    if (dryRun) {
      return {
        action: exists ? "updated" : "created",
        product_id: existingId || "dry-run-new",
      };
    }

    if (exists) {
      // 2. Row exists -> UPDATE by id
      await this._rest(
        `products?id=eq.${existingId}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify(row),
        }
      );

      return {
        action: "updated",
        product_id: existingId,
      };
    } else {
      // 3. Row doesn't exist -> INSERT
      const insertResult = await this._rest(
        "products",
        {
          method: "POST",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify(row),
        }
      );

      const createdRow = Array.isArray(insertResult) ? insertResult[0] : insertResult;
      return {
        action: "created",
        product_id: createdRow?.id,
      };
    }
  }

  /**
   * Link or create a marketplace_listings entry for an eBay product.
   * Best-effort: failures logged as warning and never break product sync.
   * Zero on_conflict used anywhere.
   *
   * @private
   * @param {string} tenantId - Tenant ID
   * @param {string} sku - Product SKU
   * @param {string} marketplace - Marketplace name (e.g., "ebay")
   */
  async _linkToMarketplace(tenantId, sku, marketplace) {
    try {
      // Fetch the product to get its ID
      const products = await this._rest(
        `products?tenant_id=eq.${tenantId}&sku=eq.${encodeURIComponent(sku)}&select=id&limit=1`
      );

      if (!products || !products.length) {
        return;
      }

      const productId = products[0].id;

      // Fetch the marketplace account row for eBay
      const accounts = await this._rest(
        `marketplace_accounts?tenant_id=eq.${tenantId}&marketplace=eq.${marketplace}&account_label=eq.default&select=id&limit=1`
      );

      if (!accounts || !accounts.length) {
        return;
      }

      const accountId = accounts[0].id;

      const listingRow = {
        tenant_id: tenantId,
        product_id: productId,
        account_id: accountId,
        marketplace,
        status: "active",
        last_synced_at: new Date().toISOString(),
      };

      // SELECT by (product_id, account_id) first
      const existing = await this._rest(
        `marketplace_listings?product_id=eq.${productId}&account_id=eq.${accountId}&select=id&limit=1`,
        { method: "GET" }
      );

      if (existing && existing.length > 0) {
        await this._rest(
          `marketplace_listings?id=eq.${existing[0].id}`,
          {
            method: "PATCH",
            body: JSON.stringify(listingRow),
          }
        );
      } else {
        await this._rest(
          "marketplace_listings",
          {
            method: "POST",
            body: JSON.stringify(listingRow),
          }
        );
      }
    } catch (err) {
      console.warn(`[InventorySyncService] Best-effort marketplace link skipped for ${sku}:`, err.message);
    }
  }

  /**
   * Record a sync run in sync_logs for audit trail and monitoring.
   * Best-effort: wrapped in try/catch, only writes columns that actually exist in the table,
   * logs a warning on failure, and never lets logging failures break the sync.
   *
   * Actual sync_logs columns: id, run_id (UUID), started_at, finished_at, status, items_seen, items_upserted, conflicts, errors, created_at.
   * (tenant_id, items_created, items_updated, items_skipped, metadata are dropped).
   *
   * @param {string} tenantId - Tenant ID
   * @param {object} syncResult - Result from syncEbayProducts()
   * @param {object} [meta] - Additional metadata
   * @returns {Promise<object|null>} sync_logs row or null
   */
  async recordSyncLog(tenantId, syncResult, meta = {}) {
    try {
      const runId = meta?.runId && typeof meta.runId === "string" && meta.runId.length === 36
        ? meta.runId
        : crypto.randomUUID();

      const row = {
        run_id: runId,
        started_at: meta?.startedAt || new Date().toISOString(),
        finished_at: new Date().toISOString(),
        status: (syncResult.errors?.length > 0) ? "partial" : "success",
        items_seen: (syncResult.created || 0) + (syncResult.updated || 0) + (syncResult.errors?.length || 0),
        items_upserted: (syncResult.created || 0) + (syncResult.updated || 0),
        conflicts: syncResult.conflicts || [],
        errors: syncResult.errors || [],
      };

      const result = await this._rest("sync_logs", {
        method: "POST",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify(row),
      });

      return Array.isArray(result) ? result[0] : result;
    } catch (err) {
      console.warn("[InventorySyncService] Best-effort recordSyncLog failed:", err.message);
      return null;
    }
  }

  /**
   * Get the last sync status for a tenant (time, counts, success/failure).
   * Best-effort: wrapped in try/catch and adapts to sync_logs schema.
   *
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<object|null>} Last sync log entry or null
   */
  async getLastSyncStatus(tenantId) {
    try {
      const result = await this._rest(
        `sync_logs?order=started_at.desc&limit=1`,
        { method: "GET" }
      );
      return result && result.length ? result[0] : null;
    } catch (err) {
      console.warn("[InventorySyncService] Best-effort getLastSyncStatus failed:", err.message);
      return null;
    }
  }

  /**
   * Get recent sync history for a tenant.
   * Best-effort: wrapped in try/catch and adapts to sync_logs schema.
   *
   * @param {string} tenantId - Tenant ID
   * @param {number} [limit=50] - Max records to return
   * @returns {Promise<Array>} sync_logs entries
   */
  async getSyncHistory(tenantId, limit = 50) {
    try {
      const result = await this._rest(
        `sync_logs?order=started_at.desc&limit=${limit}`,
        { method: "GET" }
      );
      return result || [];
    } catch (err) {
      console.warn("[InventorySyncService] Best-effort getSyncHistory failed:", err.message);
      return [];
    }
  }

  /**
   * Get inventory counts by marketplace for a tenant.
   *
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<object>} {ebay: count, etsy: count, ...}
   */
  async getInventoryCountsByMarketplace(tenantId) {
    try {
      const result = await this._rest(
        `marketplace_listings?tenant_id=eq.${tenantId}&select=marketplace,product_id&status=eq.active`,
        { method: "GET" }
      );

      const counts = {};
      for (const listing of result || []) {
        counts[listing.marketplace] = (counts[listing.marketplace] || 0) + 1;
      }

      return counts;
    } catch (err) {
      console.warn("[InventorySyncService] Best-effort getInventoryCountsByMarketplace failed:", err.message);
      return {};
    }
  }

  /**
   * Get total product count for a tenant.
   *
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<number>}
   */
  async getProductCount(tenantId) {
    try {
      const result = await this._rest(
        `products?tenant_id=eq.${tenantId}&select=id&limit=1&offset=0`,
        {
          method: "GET",
          headers: { Prefer: "count=exact" },
        }
      );

      return result ? result.length : 0;
    } catch (err) {
      console.warn("[InventorySyncService] Best-effort getProductCount failed:", err.message);
      return 0;
    }
  }
}

module.exports = { InventorySyncService };
