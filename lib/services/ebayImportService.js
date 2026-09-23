// lib/services/ebayImportService.js
// Fetches all active eBay listings for the seller and returns structured inventory data.
// Uses eBay's Browse API (getItemsByLegacyId via Search API for inventory listing).
// Falls back to inventory API if available.

const EBAY_API_BASE = process.env.EBAY_ENVIRONMENT === "sandbox"
  ? "https://api.sandbox.ebay.com"
  : "https://api.ebay.com";

/**
 * Gets an access token for eBay API calls.
 * Uses the EBAY_REFRESH_TOKEN from environment.
 */
async function getEbayAccessToken() {
  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET || !process.env.EBAY_REFRESH_TOKEN) {
    throw new Error("eBay credentials missing: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_REFRESH_TOKEN required");
  }

  const tokenUrl = process.env.EBAY_ENVIRONMENT === "sandbox"
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
    : "https://api.ebay.com/identity/v1/oauth2/token";

  const auth = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.EBAY_REFRESH_TOKEN,
      scope: "https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "unknown error");
    throw new Error(`eBay token refresh failed (HTTP ${res.status}): ${detail}`);
  }

  const body = await res.json();
  if (!body.access_token) {
    throw new Error("eBay token refresh succeeded but returned no access_token");
  }

  return body.access_token;
}

/**
 * Fetches all active inventory items from eBay.
 * Uses the Inventory API endpoint which returns all SKU-based listings.
 * @returns {Promise<Array>} Array of inventory items with basic fields
 */
async function fetchEbayInventoryItems(accessToken) {
  const items = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = new URL(`${EBAY_API_BASE}/sell/inventory/v1/inventory`);
    url.searchParams.set("limit", limit);
    url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Language": "en-US",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "unknown error");
      throw new Error(`eBay inventory API failed (HTTP ${res.status}): ${detail}`);
    }

    const body = await res.json();
    const inventories = body.inventories || [];

    if (inventories.length === 0) break;

    items.push(...inventories);
    offset += limit;

    if (inventories.length < limit) break;
  }

  return items;
}

/**
 * Fetches detailed listing information for a single eBay listing via the Sell API.
 * Attempts to get the actual listing details including images.
 */
async function fetchEbayListingDetails(accessToken, listingId) {
  const url = `${EBAY_API_BASE}/sell/inventory/v1/inventory/${encodeURIComponent(listingId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Language": "en-US",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    const detail = await res.text().catch(() => "unknown error");
    throw new Error(`eBay listing details API failed (HTTP ${res.status}): ${detail}`);
  }

  return res.json();
}

/**
 * Converts an eBay inventory item to a standardized product format for BossLister.
 */
function mapEbayItemToProduct(ebayItem) {
  const sku = ebayItem.sku || `EBY-${ebayItem.id || Math.random().toString(36).slice(2, 9)}`;
  const title = ebayItem.title || ebayItem.name || "Untitled Item";
  const description = ebayItem.description || "";
  const price = ebayItem.price || 0;
  const quantity = ebayItem.quantity || ebayItem.available || 0;
  const condition = ebayItem.condition || "New";

  // Extract image URLs
  const images = [];
  if (ebayItem.pictureUrls && Array.isArray(ebayItem.pictureUrls)) {
    images.push(...ebayItem.pictureUrls.slice(0, 4));
  } else if (ebayItem.pictures && Array.isArray(ebayItem.pictures)) {
    images.push(
      ...ebayItem.pictures.slice(0, 4).map((pic) => pic.imageUrl || pic.url).filter(Boolean)
    );
  } else if (ebayItem.image || ebayItem.imageUrl) {
    images.push(ebayItem.image || ebayItem.imageUrl);
  }

  return {
    sku,
    title,
    description,
    price: Number(price),
    quantity: Number(quantity),
    images: images.slice(0, 4),
    condition,
    source: "ebay",
    ebay_item_id: ebayItem.id || ebayItem.listing_id,
    external_ids: {
      ebay_id: ebayItem.id || ebayItem.listing_id,
    },
  };
}

/**
 * Main entry point: fetches all active eBay listings and returns them.
 * @param {string} [tenantAccessToken] Optional tenant-specific token; falls back to app credentials
 * @returns {Promise<{items: Array, imported: number, skipped: number, errors: Array}>}
 */
async function importEbayListings(tenantAccessToken) {
  let accessToken;
  const errors = [];

  try {
    accessToken = tenantAccessToken || (await getEbayAccessToken());
  } catch (err) {
    throw new Error(`eBay authentication failed: ${err.message}`);
  }

  let inventoryItems = [];
  try {
    inventoryItems = await fetchEbayInventoryItems(accessToken);
  } catch (err) {
    // If inventory API fails, try a fallback (optional — return empty if unavailable)
    console.warn("[ebayImportService] Inventory API fetch failed, continuing with empty set:", err.message);
    errors.push(`Inventory API unavailable: ${err.message}`);
  }

  const items = [];
  let skipped = 0;

  for (const ebayItem of inventoryItems) {
    try {
      // Filter: only include active, available items
      if (!ebayItem.title || ebayItem.quantity === 0) {
        skipped += 1;
        continue;
      }

      const product = mapEbayItemToProduct(ebayItem);
      items.push(product);
    } catch (err) {
      errors.push(`Failed to process item ${ebayItem.id}: ${err.message}`);
      skipped += 1;
    }
  }

  return {
    items,
    imported: items.length,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  };
}

module.exports = { importEbayListings, getEbayAccessToken };
