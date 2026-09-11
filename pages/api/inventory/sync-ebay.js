/**
 * POST /api/inventory/sync-ebay
 * Manually trigger an eBay inventory sync for the authenticated user's tenant.
 * Returns the result of the sync operation.
 *
 * Query params:
 *   - tenantId: Override tenant (admin only)
 *
 * Body (optional, for webhook):
 *   - trigger: "webhook" | "manual" | "scheduled"
 *   - webhookCode?: Webhook verification code
 */

const { EbayInventoryFetcher } = require("../../../lib/ebayInventoryFetcher");
const { InventorySyncService } = require("../../../lib/inventorySyncService");
const { resolveSession } = require("../../../lib/supabaseAuth");

export default async function handler(req, res) {
  // Only POST allowed
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    // Authenticate user and get tenant
    const session = await resolveSession(req);
    if (!session) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const { tenantId: overrideTenantId } = req.query;
    const { trigger = "manual", webhookCode } = req.body || {};

    // Get user's tenant
    let tenantId = session.tenantId;
    if (overrideTenantId && session.isAdmin) {
      // Admin can override tenant
      tenantId = overrideTenantId;
    }

    if (!tenantId) {
      return res.status(400).json({
        ok: false,
        error: "No tenant found. User must be part of a tenant.",
      });
    }

    console.log(
      `[api/inventory/sync-ebay] Syncing tenant ${tenantId} (trigger: ${trigger})`
    );

    // Start the sync
    const fetcher = new EbayInventoryFetcher();
    const syncService = new InventorySyncService();

    let ebayProducts;
    try {
      ebayProducts = await fetcher.fetchAllListings(tenantId, {
        limit: 100,
        details: true,
      });
    } catch (err) {
      console.error("[api/inventory/sync-ebay] Failed to fetch eBay inventory:", err.message);
      return res.status(502).json({
        ok: false,
        error: "Failed to fetch eBay inventory",
        detail: err.message,
        trigger,
      });
    }

    // Merge with local database
    let syncResult;
    try {
      syncResult = await syncService.syncEbayProducts(tenantId, ebayProducts);
    } catch (err) {
      console.error(
        "[api/inventory/sync-ebay] Failed to sync products to database:",
        err.message
      );
      return res.status(502).json({
        ok: false,
        error: "Failed to sync products to database",
        detail: err.message,
        trigger,
      });
    }

    // Record sync in audit log
    try {
      await syncService.recordSyncLog(tenantId, syncResult, {
        trigger,
        authenticatedUser: session.userId,
      });
    } catch (err) {
      console.error("[api/inventory/sync-ebay] Failed to record sync log:", err.message);
      // Don't fail the entire request if logging fails
    }

    return res.status(200).json({
      ok: true,
      trigger,
      itemsSeen: (syncResult.created || 0) + (syncResult.updated || 0),
      created: syncResult.created,
      updated: syncResult.updated,
      skipped: syncResult.skipped,
      errors: syncResult.errors,
      conflicts: syncResult.conflicts,
      message: `Synced ${syncResult.created} new and updated ${syncResult.updated} existing products`,
    });
  } catch (err) {
    console.error("[api/inventory/sync-ebay] Unhandled error:", err.message);
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      detail: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}
