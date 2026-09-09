// lib/syncEngine.js
// Complete inventory sync engine for eBay + Etsy
// Polls both platforms, compares quantities, updates as needed

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertConfigured() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Supabase not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
}

class SyncEngine {
  constructor() {
    this.runId = null;
    this.details = [];
  }

  /**
   * Execute a full cross-platform inventory sync
   * Returns: { ok: boolean, summary: object, details: array }
   */
  async execute({ targetSku = null } = {}) {
    assertConfigured();
    this.runId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.details = [];

    try {
      // Start the sync run
      await this._createSyncRun("running", { sync_type: targetSku ? "single_sku" : "full", target_sku: targetSku });

      // Fetch all listings from both platforms
      console.log(`[Sync ${this.runId}] Fetching eBay listings...`);
      const ebayListings = await this._fetchEbayListings();
      console.log(`[Sync ${this.runId}] Found ${ebayListings.length} eBay listings`);

      console.log(`[Sync ${this.runId}] Fetching Etsy listings...`);
      const etsyListings = await this._fetchEtsyListings();
      console.log(`[Sync ${this.runId}] Found ${etsyListings.length} Etsy listings`);

      // Build lookup maps by SKU
      const ebayBySku = this._buildLookup(ebayListings, "sku");
      const etsyBySku = this._buildLookup(etsyListings, "sku");

      // Get all unique SKUs that need syncing
      let skusToSync = new Set([...Object.keys(ebayBySku), ...Object.keys(etsyBySku)]);

      // Filter to target SKU if specified
      if (targetSku) {
        skusToSync = new Set([...skusToSync].filter((sku) => sku === targetSku));
        if (skusToSync.size === 0) {
          console.log(`[Sync ${this.runId}] Target SKU ${targetSku} not found on any platform`);
        }
      }

      // Sync each SKU across platforms
      let synced = 0;
      let updated = 0;
      let delistings = 0;

      for (const sku of skusToSync) {
        const ebayListing = ebayBySku[sku];
        const etsyListing = etsyBySku[sku];

        const result = await this._syncSku(sku, ebayListing, etsyListing);
        synced++;
        if (result.action === "updated") updated++;
        if (result.action === "delisted") delistings++;

        this.details.push({
          sku,
          ebay_qty_before: ebayListing?.quantity,
          etsy_qty_before: etsyListing?.quantity,
          ebay_qty_after: result.ebayQtyAfter,
          etsy_qty_after: result.etsyQtyAfter,
          action: result.action,
          action_details: result.details,
        });
      }

      // Mark sync run as complete
      await this._updateSyncRun("success", {
        finished_at: new Date().toISOString(),
        total_skus_checked: skusToSync.size,
        skus_synced: synced,
        quantity_updates: updated,
        delistings,
      });

      console.log(`[Sync ${this.runId}] Complete: ${synced} SKUs synced, ${updated} quantity updates, ${delistings} delistings`);

      return {
        ok: true,
        summary: {
          runId: this.runId,
          totalSkus: skusToSync.size,
          synced,
          updated,
          delistings,
          finishedAt: new Date().toISOString(),
        },
        details: this.details,
      };
    } catch (err) {
      console.error(`[Sync ${this.runId}] Error:`, err.message);
      await this._updateSyncRun("failed", {
        finished_at: new Date().toISOString(),
        error_message: err.message,
      });
      throw err;
    }
  }

  /**
   * Sync a single SKU across platforms
   */
  async _syncSku(sku, ebayListing, etsyListing) {
    const ebayQty = ebayListing?.quantity ?? 0;
    const etsyQty = etsyListing?.quantity ?? 0;

    // Decide the sync strategy: use the higher quantity
    const maxQty = Math.max(ebayQty, etsyQty);

    // If max is 0, delist both
    if (maxQty === 0) {
      await this._delistSku(sku, ebayListing, etsyListing);
      return {
        action: "delisted",
        ebayQtyAfter: 0,
        etsyQtyAfter: 0,
        details: {
          reason: "sold_out",
          delistPlatforms: [ebayListing ? "ebay" : null, etsyListing ? "etsy" : null].filter(Boolean),
        },
      };
    }

    // If they match, no action needed
    if (ebayQty === etsyQty) {
      return {
        action: "none",
        ebayQtyAfter: ebayQty,
        etsyQtyAfter: etsyQty,
        details: { reason: "quantities_match" },
      };
    }

    // Quantities differ: update the lower one to match the higher
    const updates = [];
    if (ebayQty !== maxQty && ebayListing) {
      console.log(`[Sync ${this.runId}] Updating eBay ${sku}: ${ebayQty} -> ${maxQty}`);
      try {
        await this._updateEbayQuantity(sku, ebayListing, maxQty);
        updates.push({ platform: "ebay", oldQty: ebayQty, newQty: maxQty });
      } catch (err) {
        console.error(`[Sync ${this.runId}] Failed to update eBay ${sku}:`, err.message);
        updates.push({ platform: "ebay", oldQty: ebayQty, error: err.message });
      }
    }

    if (etsyQty !== maxQty && etsyListing) {
      console.log(`[Sync ${this.runId}] Updating Etsy ${sku}: ${etsyQty} -> ${maxQty}`);
      try {
        await this._updateEtsyQuantity(sku, etsyListing, maxQty);
        updates.push({ platform: "etsy", oldQty: etsyQty, newQty: maxQty });
      } catch (err) {
        console.error(`[Sync ${this.runId}] Failed to update Etsy ${sku}:`, err.message);
        updates.push({ platform: "etsy", oldQty: etsyQty, error: err.message });
      }
    }

    return {
      action: updates.some((u) => !u.error) ? "updated" : "none",
      ebayQtyAfter: updates.find((u) => u.platform === "ebay")?.newQty ?? ebayQty,
      etsyQtyAfter: updates.find((u) => u.platform === "etsy")?.newQty ?? etsyQty,
      details: { updates },
    };
  }

  /**
   * Fetch all active eBay listings for the authenticated seller
   */
  async _fetchEbayListings() {
    if (!process.env.EBAY_REFRESH_TOKEN) {
      console.warn("[SyncEngine] eBay credentials not configured, skipping eBay sync");
      return [];
    }

    const accessToken = await this._getEbayAccessToken();
    if (!accessToken) return [];

    const environment = process.env.EBAY_ENVIRONMENT || "production";
    const baseUrl = environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";

    try {
      // Use GetMyEBaySellingAPI to get active listings
      const response = await fetch(`${baseUrl}/sell/inventory/v1/inventory_items`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.error(`[SyncEngine] eBay API error: HTTP ${response.status}`);
        return [];
      }

      const data = await response.json();
      if (!data.inventoryItems) return [];

      // Transform eBay response to standard format
      return data.inventoryItems
        .filter((item) => item.sku) // Must have SKU
        .map((item) => ({
          sku: item.sku,
          quantity: item.availability?.quantity ?? 0,
          listingId: item.listingId,
          title: item.title || "Unknown",
        }));
    } catch (err) {
      console.error("[SyncEngine] Error fetching eBay listings:", err.message);
      return [];
    }
  }

  /**
   * Fetch all active Etsy listings for the authenticated shop
   */
  async _fetchEtsyListings() {
    if (!process.env.ETSY_API_KEY || !process.env.ETSY_SHOP_ID) {
      console.warn("[SyncEngine] Etsy credentials not configured, skipping Etsy sync");
      return [];
    }

    try {
      // Etsy API: get all active listings for shop
      const response = await fetch(
        `https://openapi.etsy.com/v3/application/shops/${process.env.ETSY_SHOP_ID}/listings/active`,
        {
          method: "GET",
          headers: {
            "x-api-key": process.env.ETSY_API_KEY,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(15000),
        },
      );

      if (!response.ok) {
        console.error(`[SyncEngine] Etsy API error: HTTP ${response.status}`);
        return [];
      }

      const data = await response.json();
      if (!data.results) return [];

      // Transform Etsy response to standard format
      // Etsy uses SKU in the sku field
      return data.results
        .filter((item) => item.sku) // Must have SKU
        .map((item) => ({
          sku: item.sku,
          quantity: item.quantity ?? 0,
          listingId: item.listing_id,
          title: item.title || "Unknown",
        }));
    } catch (err) {
      console.error("[SyncEngine] Error fetching Etsy listings:", err.message);
      return [];
    }
  }

  /**
   * Get eBay access token using refresh token
   */
  async _getEbayAccessToken() {
    const refreshToken = process.env.EBAY_REFRESH_TOKEN;
    if (!refreshToken) return null;

    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    const environment = process.env.EBAY_ENVIRONMENT || "production";
    const tokenUrl =
      environment === "sandbox" ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token" : "https://api.ebay.com/identity/v1/oauth2/token";

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    try {
      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${auth}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          scope: "https://api.ebay.com/oauth/api_scope/sell.inventory",
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.error(`[SyncEngine] eBay token refresh failed: HTTP ${response.status}`);
        return null;
      }

      const data = await response.json();
      return data.access_token || null;
    } catch (err) {
      console.error("[SyncEngine] Error refreshing eBay token:", err.message);
      return null;
    }
  }

  /**
   * Update eBay listing quantity
   */
  async _updateEbayQuantity(sku, listing, newQuantity) {
    const accessToken = await this._getEbayAccessToken();
    if (!accessToken) throw new Error("No eBay access token");

    const environment = process.env.EBAY_ENVIRONMENT || "production";
    const baseUrl = environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";

    const response = await fetch(`${baseUrl}/sell/inventory/v1/inventory_items/${sku}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        availability: {
          quantity: newQuantity,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`eBay quantity update failed: HTTP ${response.status} - ${errorData.message || "Unknown error"}`);
    }
  }

  /**
   * Update Etsy listing quantity
   */
  async _updateEtsyQuantity(sku, listing, newQuantity) {
    const shopId = process.env.ETSY_SHOP_ID;
    const apiKey = process.env.ETSY_API_KEY;
    if (!shopId || !apiKey) throw new Error("Etsy credentials not configured");

    const listingId = listing.listingId;
    const response = await fetch(`https://openapi.etsy.com/v3/application/shops/${shopId}/listings/${listingId}`, {
      method: "PATCH",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        quantity: newQuantity,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Etsy quantity update failed: HTTP ${response.status} - ${errorData.message || "Unknown error"}`);
    }
  }

  /**
   * Delist a SKU from one or both platforms (mark as inactive)
   */
  async _delistSku(sku, ebayListing, etsyListing) {
    try {
      if (ebayListing) {
        await this._delistEbay(sku);
      }
    } catch (err) {
      console.error(`[Sync ${this.runId}] Failed to delist from eBay:`, err.message);
    }

    try {
      if (etsyListing) {
        await this._delistEtsy(sku, etsyListing);
      }
    } catch (err) {
      console.error(`[Sync ${this.runId}] Failed to delist from Etsy:`, err.message);
    }
  }

  async _delistEbay(sku) {
    const accessToken = await this._getEbayAccessToken();
    if (!accessToken) throw new Error("No eBay access token");

    const environment = process.env.EBAY_ENVIRONMENT || "production";
    const baseUrl = environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";

    // Set quantity to 0 to delist
    const response = await fetch(`${baseUrl}/sell/inventory/v1/inventory_items/${sku}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        availability: {
          quantity: 0,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`eBay delisting failed: HTTP ${response.status}`);
    }
  }

  async _delistEtsy(sku, listing) {
    const shopId = process.env.ETSY_SHOP_ID;
    const apiKey = process.env.ETSY_API_KEY;
    if (!shopId || !apiKey) throw new Error("Etsy credentials not configured");

    // Etsy: set quantity to 0 or delete listing
    const response = await fetch(
      `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/${listing.listingId}`,
      {
        method: "PATCH",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quantity: 0,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Etsy delisting failed: HTTP ${response.status}`);
    }
  }

  /**
   * Build a lookup map from listings by a key field
   */
  _buildLookup(listings, key) {
    const map = {};
    for (const listing of listings) {
      if (listing[key]) {
        map[listing[key]] = listing;
      }
    }
    return map;
  }

  /**
   * Create a sync run record in the database
   */
  async _createSyncRun(status, fields = {}) {
    const row = {
      run_id: this.runId,
      status,
      ...fields,
    };

    const response = await fetch(`${SUPABASE_URL}/rest/v1/sync_runs`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "Unknown error");
      console.error(`[SyncEngine] Failed to create sync run: ${detail}`);
    }

    return response.ok;
  }

  /**
   * Update sync run record
   */
  async _updateSyncRun(status, fields = {}) {
    const row = {
      status,
      ...fields,
    };

    const response = await fetch(`${SUPABASE_URL}/rest/v1/sync_runs?run_id=eq.${this.runId}`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(row),
    });

    if (!response.ok) {
      console.error(`[SyncEngine] Failed to update sync run: HTTP ${response.status}`);
    }

    return response.ok;
  }

  /**
   * Write sync details to the database
   */
  async _writeSyncDetails() {
    if (!this.details.length) return;

    // Get the sync run ID from the database
    const runsResponse = await fetch(`${SUPABASE_URL}/rest/v1/sync_runs?run_id=eq.${this.runId}&select=id`, {
      method: "GET",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!runsResponse.ok) {
      console.error("[SyncEngine] Failed to fetch sync run ID");
      return;
    }

    const runs = await runsResponse.json();
    if (!runs.length) {
      console.error("[SyncEngine] Sync run not found");
      return;
    }

    const syncRunId = runs[0].id;

    // Write all details
    const rows = this.details.map((d) => ({
      sync_run_id: syncRunId,
      sku: d.sku,
      ebay_qty_before: d.ebay_qty_before,
      etsy_qty_before: d.etsy_qty_before,
      ebay_qty_after: d.ebay_qty_after,
      etsy_qty_after: d.etsy_qty_after,
      action: d.action,
      action_details: d.action_details,
    }));

    const detailsResponse = await fetch(`${SUPABASE_URL}/rest/v1/sync_details`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(rows),
    });

    if (!detailsResponse.ok) {
      console.error(`[SyncEngine] Failed to write sync details: HTTP ${detailsResponse.status}`);
    }
  }
}

module.exports = { SyncEngine };
