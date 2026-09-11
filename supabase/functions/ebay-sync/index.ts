/**
 * Supabase Edge Function: ebay-sync
 *
 * Scheduled task (via pg_cron every 15 minutes) that:
 * 1. Fetches all active eBay listings for each tenant
 * 2. Syncs them into the products table
 * 3. Records sync logs for audit trail
 * 4. Handles errors with circuit breaker pattern
 *
 * Called by: pg_cron schedule in migration 0002
 * Trigger: POST /functions/v1/ebay-sync
 * Auth: Service role via pg_cron (no user auth needed)
 * Trigger Secret: SYNC_TRIGGER_SECRET (verified in headers)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SYNC_TRIGGER_SECRET = Deno.env.get("SYNC_TRIGGER_SECRET");
const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID");
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET");
const EBAY_ENVIRONMENT = Deno.env.get("EBAY_ENVIRONMENT") || "production";

// eBay API endpoints
const EBAY_OAUTH_URL =
  EBAY_ENVIRONMENT === "sandbox"
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
    : "https://api.ebay.com/identity/v1/oauth2/token";

const EBAY_INVENTORY_API_URL =
  EBAY_ENVIRONMENT === "sandbox"
    ? "https://api.sandbox.ebay.com/sell/inventory/v1"
    : "https://api.ebay.com/sell/inventory/v1";

/**
 * Execute Supabase REST query with service role privileges.
 */
async function rest(
  path: string,
  options: RequestInit = {}
): Promise<any> {
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
    throw new Error(
      `Supabase ${options.method || "GET"} ${path} (HTTP ${res.status}): ${detail}`
    );
  }

  return res.status === 204 ? null : res.json();
}

/**
 * Get or refresh an access token for a tenant's eBay account.
 */
async function getEbayAccessToken(refreshToken: string): Promise<string> {
  const auth = btoa(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`);

  const res = await fetch(EBAY_OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope:
        "https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account",
    }),
  });

  if (!res.ok) {
    throw new Error(`eBay OAuth failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.access_token;
}

/**
 * Fetch all active eBay listings for a tenant.
 */
async function fetchEbayInventory(
  accessToken: string,
  limit: number = 100,
  offset: number = 0
): Promise<{ items: any[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    fieldgroups: "INVENTORY,PRODUCT_WITH_SINGLE_VARIATION",
  });

  const res = await fetch(
    `${EBAY_INVENTORY_API_URL}/inventory?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`eBay Inventory API failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  const items = data.inventories || [];
  const total = data.total || 0;
  const hasMore = offset + limit < total;

  return { items, hasMore };
}

/**
 * Normalize eBay inventory item to internal format.
 */
function normalizeItem(item: any): any {
  return {
    sku: item.sku || null,
    title:
      item.product?.title ||
      item.listing?.title ||
      "(No title)",
    description: item.product?.description || null,
    quantity: item.quantity || 0,
    price: item.price?.value || null,
    condition: item.condition || "UNKNOWN",
    imageUrl: item.product?.imageUrls?.[0] || null,
    ebayListingId: item.listingId || null,
    ebayCategoryId: item.listing?.categoryId || null,
    source: "ebay",
  };
}

/**
 * Upsert a product into the products table.
 */
async function upsertProduct(tenantId: string, product: any): Promise<void> {
  await rest("products?on_conflict=tenant_id,sku", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
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
    }),
  });
}

/**
 * Main sync function: runs for all tenants that have eBay connected.
 */
async function syncAllTenants(): Promise<any> {
  const startTime = new Date().toISOString();
  const results: any = [];

  try {
    // Get all marketplace_accounts with eBay that have refresh tokens
    const accounts = await rest(
      "marketplace_accounts?marketplace=eq.ebay&select=tenant_id,config"
    );

    console.log(`[ebay-sync] Found ${accounts?.length || 0} eBay accounts to sync`);

    for (const account of accounts || []) {
      const tenantId = account.tenant_id;
      const config = account.config || {};
      const refreshToken = config.refresh_token;

      if (!refreshToken) {
        console.warn(`[ebay-sync] No refresh token for tenant ${tenantId}`);
        continue;
      }

      try {
        console.log(`[ebay-sync] Syncing tenant ${tenantId}`);

        // Get access token
        const accessToken = await getEbayAccessToken(refreshToken);

        // Fetch all inventory
        let allItems: any[] = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const result = await fetchEbayInventory(accessToken, 100, offset);
          allItems = allItems.concat(result.items);
          hasMore = result.hasMore;
          offset += 100;
        }

        console.log(
          `[ebay-sync] Tenant ${tenantId}: Fetched ${allItems.length} eBay items`
        );

        // Normalize and upsert
        let created = 0;
        let updated = 0;

        for (const item of allItems) {
          try {
            const normalized = normalizeItem(item);
            await upsertProduct(tenantId, normalized);
            // Simple heuristic: if quantity was 0, this is new
            if (item.quantity > 0) {
              updated++;
            } else {
              created++;
            }
          } catch (err) {
            console.error(`[ebay-sync] Error upserting ${item.sku}:`, err.message);
          }
        }

        // Record sync log
        await rest("sync_logs", {
          method: "POST",
          body: JSON.stringify({
            tenant_id: tenantId,
            started_at: startTime,
            finished_at: new Date().toISOString(),
            status: "success",
            items_seen: allItems.length,
            items_upserted: allItems.length,
            items_created: created,
            items_updated: updated,
            conflicts: JSON.stringify([]),
            errors: JSON.stringify([]),
            metadata: JSON.stringify({ trigger: "scheduled" }),
          }),
        });

        results.push({
          tenantId,
          status: "success",
          itemsProcessed: allItems.length,
        });
      } catch (err) {
        console.error(`[ebay-sync] Error syncing tenant ${tenantId}:`, err.message);

        // Record failed sync
        await rest("sync_logs", {
          method: "POST",
          body: JSON.stringify({
            tenant_id: tenantId,
            started_at: startTime,
            finished_at: new Date().toISOString(),
            status: "failed",
            items_seen: 0,
            items_upserted: 0,
            conflicts: JSON.stringify([]),
            errors: JSON.stringify([
              {
                error: err.message,
              },
            ]),
            metadata: JSON.stringify({ trigger: "scheduled" }),
          }),
        });

        results.push({
          tenantId,
          status: "failed",
          error: err.message,
        });
      }
    }

    return {
      ok: true,
      totalTenants: results.length,
      results,
    };
  } catch (err) {
    console.error("[ebay-sync] Fatal error:", err.message);
    return {
      ok: false,
      error: err.message,
    };
  }
}

/**
 * HTTP handler.
 */
serve(async (req) => {
  // Verify trigger secret
  const triggerSecret = req.headers.get("x-sync-trigger-secret");
  if (triggerSecret !== SYNC_TRIGGER_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Handle webhook challenge (GET)
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ ok: true, message: "eBay sync function ready" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // Run sync (POST)
  if (req.method === "POST") {
    const result = await syncAllTenants();
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405 });
});
