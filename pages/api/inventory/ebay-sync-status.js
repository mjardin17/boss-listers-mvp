/**
 * GET /api/inventory/ebay-sync-status
 * Get the status of eBay inventory syncing for a tenant.
 * Returns last sync time, product counts, sync history.
 *
 * Authentication: Requires authenticated Boss Listers user
 */

const { InventorySyncService } = require("../../../lib/inventorySyncService");
const { resolveSession } = require("../../../lib/supabaseAuth");

export default async function handler(req, res) {
  // Only GET allowed
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    // Authenticate user. resolveSession(env, accessToken) needs the
    // Supabase config plus the caller's own bearer token — never the raw
    // req object, which has neither.
    const authHeader = req.headers.authorization || "";
    const userAccessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const session = userAccessToken
      ? await resolveSession(process.env, userAccessToken)
      : null;
    if (!session) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const tenantId = session.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        ok: false,
        error: "No tenant found. User must be part of a tenant.",
      });
    }

    const syncService = new InventorySyncService();

    // Get last sync status
    const lastSync = await syncService.getLastSyncStatus(tenantId);
    const syncHistory = await syncService.getSyncHistory(tenantId, 10);

    // Get inventory counts by marketplace
    const marketplaceCount = await syncService.getInventoryCountsByMarketplace(tenantId);

    // Calculate minutes since last sync
    const minutesSinceLastSync = lastSync
      ? Math.floor((Date.now() - new Date(lastSync.started_at).getTime()) / 60000)
      : null;

    return res.status(200).json({
      ok: true,
      lastSync: lastSync
        ? {
            startedAt: lastSync.started_at,
            finishedAt: lastSync.finished_at,
            status: lastSync.status,
            itemsSeen: lastSync.items_seen,
            itemsUpserted: lastSync.items_upserted,
            itemsCreated: lastSync.items_created,
            itemsUpdated: lastSync.items_updated,
            itemsSkipped: lastSync.items_skipped,
            // sync_logs.errors/.conflicts are JSONB columns — PostgREST
            // already returns them as parsed arrays/objects, not strings.
            // JSON.parse([]) throws ("[].toString()" is "", and
            // JSON.parse("") is "Unexpected end of JSON input"), which was
            // hit on every real row since recordSyncLog() writes these as
            // real arrays. Only parse if it actually came back as a string.
            errors: typeof lastSync.errors === "string" ? JSON.parse(lastSync.errors) : (lastSync.errors || []),
            conflicts: typeof lastSync.conflicts === "string" ? JSON.parse(lastSync.conflicts) : (lastSync.conflicts || []),
            minutesSinceSync: minutesSinceLastSync,
          }
        : null,
      marketplaceInventoryCounts: marketplaceCount,
      syncHistory: syncHistory.map((log) => ({
        startedAt: log.started_at,
        finishedAt: log.finished_at,
        status: log.status,
        itemsUpserted: log.items_upserted,
        itemsCreated: log.items_created,
        itemsUpdated: log.items_updated,
      })),
    });
  } catch (err) {
    console.error("[api/inventory/ebay-sync-status] Error:", err.message);
    return res.status(500).json({
      ok: false,
      error: "Failed to retrieve sync status",
      detail: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}
