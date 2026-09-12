// GET or POST /api/channels/ebay/sync
//
// The REAL eBay inventory sync — replaces the "ebay-sync Edge Function"
// referenced throughout this codebase (supabase/migrations/0002_schedule_
// ebay_sync.sql, apiConnectors.js comments) that was scheduled to run every
// 15 minutes but was never actually built (no such function exists under
// supabase/functions/, only "setup-perms" does). That schedule has been
// firing at a URL that 404s the whole time, if it was ever turned on.
//
// This uses the Sell Inventory API (the same OAuth connection already
// proven live via /api/channels/test) rather than the legacy Trading API —
// there are no Auth'n'Auth / EBAY_DEV_ID-style legacy credentials
// configured in this project, and eBay itself steers new integrations
// toward the Sell APIs. Practical effect: this syncs and keeps up to date
// any listing created going forward through this app's own publish flow.
// The ~128 existing rows with source="ebay" already in the products table
// came from a one-time import done some other way in the past (unknown to
// this route) and are NOT touched unless their SKU also exists in the Sell
// Inventory API response — a separate legacy-API integration would be
// needed to keep those specific rows live, which is out of scope here.
//
// IMPORTANT: this now authenticates to eBay using THIS TENANT's own
// connected refresh token (via the get_my_marketplace_token RPC, resolved
// from the caller's Supabase session), not the shared app-level
// EBAY_REFRESH_TOKEN. The shared token only ever had sell.inventory scope
// and belongs to no particular tenant — using it here was the same bug
// that broke /api/channels/ebay/policies. Call this route with the user's
// Supabase bearer token, same as every other per-tenant channel route.
//
// What it does, per SKU returned by getInventoryItems:
//   1. Look up its offer(s) via getOffers to get price + publish status.
//   2. Upsert into Supabase `products` (source="ebay", ebay_listing_id set
//      to the real published listingId when the offer is PUBLISHED).
//
// Safe to call repeatedly — upserts on SKU, never duplicates rows.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getTenantRefreshToken(userAccessToken, environment) {
  const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_marketplace_token`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${userAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_marketplace: "ebay", p_environment: environment }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!rpcRes.ok) {
    const detail = await rpcRes.text();
    throw new Error(`Failed to look up eBay connection: ${detail}`);
  }
  const token = await rpcRes.json();
  if (!token) throw new Error("No eBay connection found for your account. Connect eBay on the Channels page first.");
  return token;
}

async function getAccessToken(userAccessToken) {
  const { EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_ENVIRONMENT } = process.env;
  const isSandbox = EBAY_ENVIRONMENT === "sandbox";
  const environment = isSandbox ? "sandbox" : "production";
  const authUrl = isSandbox
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
    : "https://api.ebay.com/identity/v1/oauth2/token";

  const refreshToken = await getTenantRefreshToken(userAccessToken, environment);

  const auth = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "https://api.ebay.com/oauth/api_scope/sell.inventory",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`eBay token refresh failed (HTTP ${res.status})`);
  const body = await res.json();
  return { accessToken: body.access_token, apiBase: isSandbox ? "https://api.sandbox.ebay.com" : "https://api.ebay.com" };
}

async function fetchAllInventoryItems(apiBase, headers) {
  const items = [];
  let href = `${apiBase}/sell/inventory/v1/inventory_item?limit=100`;
  while (href) {
    const res = await fetch(href, { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`getInventoryItems failed (HTTP ${res.status}): ${detail.slice(0, 500)}`);
    }
    const body = await res.json();
    items.push(...(body.inventoryItems || []));
    href = body.next || null;
  }
  return items;
}

async function fetchOffersForSku(apiBase, headers, sku) {
  const res = await fetch(
    `${apiBase}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`,
    { headers, signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) return [];
  const body = await res.json();
  return body.offers || [];
}

async function upsertProduct(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?on_conflict=sku`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase upsert failed for sku ${row.sku}: ${await res.text()}`);
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    return res.status(503).json({ ok: false, error: "Supabase not configured" });
  }

  const authHeader = req.headers.authorization || "";
  const userAccessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!userAccessToken) {
    return res.status(401).json({ ok: false, error: "Missing session" });
  }

  try {
    const { accessToken, apiBase } = await getAccessToken(userAccessToken);
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Accept-Language": "en-US",
      "Content-Language": "en-US",
    };

    const inventoryItems = await fetchAllInventoryItems(apiBase, headers);

    let synced = 0;
    const errors = [];
    for (const item of inventoryItems) {
      const sku = item.sku;
      try {
        const offers = await fetchOffersForSku(apiBase, headers, sku);
        const published = offers.find((o) => o.status === "PUBLISHED") || offers[0] || null;
        const row = {
          sku,
          title: item.product?.title || sku,
          description: item.product?.description || null,
          price: published?.pricingSummary?.price?.value != null ? Number(published.pricingSummary.price.value) : null,
          quantity: Number(item.availability?.shipToLocationAvailability?.quantity) || 0,
          image_url: item.product?.imageUrls?.[0] || null,
          condition: item.condition || null,
          status: published?.status === "PUBLISHED" ? "active" : "draft",
          source: "ebay",
          ebay_listing_id: published?.listing?.listingId || null,
          published: published?.status === "PUBLISHED",
        };
        await upsertProduct(row);
        synced += 1;
      } catch (err) {
        errors.push({ sku, error: err.message });
      }
    }

    return res.status(200).json({
      ok: true,
      totalInventoryItems: inventoryItems.length,
      synced,
      errors,
    });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
}
