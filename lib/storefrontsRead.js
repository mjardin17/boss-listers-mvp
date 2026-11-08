// lib/storefrontsRead.js
// Read-only storefront checks used by pages/api/storefronts.js.
// Every function takes its inputs and a fetch implementation, so tests can run without
// calling eBay or Meta. Tokens travel in Authorization headers, never in URLs.

const INVENTORY_PAGE_SIZE = 100;
const MAX_INVENTORY_PAGES = 50; // up to 5,000 SKUs
const OFFER_BATCH_SIZE = 10; // eBay offers are per SKU; ask in small parallel batches
const ORDER_PERMISSION_NOTE = "eBay login needs order-read permission before sold items can show here";
const SOLD_UNAVAILABLE_NOTE = "Sold orders could not be read right now";

async function getJson(fetchImpl, url, headers) {
  const r = await fetchImpl(url, { headers });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.errors || body.error) {
    const detail = body.errors?.[0]?.message || body.error?.message || `HTTP ${r.status}`;
    throw new Error(detail);
  }
  return body;
}

function toListing(offer) {
  return {
    offerId: offer.offerId,
    sku: offer.sku,
    price: offer.pricingSummary?.price?.value ?? null,
    quantity: offer.availableQuantity ?? null,
    status: offer.status,
    listingId: offer.listing?.listingId || null,
    url: offer.listing?.listingId ? `https://www.ebay.com/itm/${offer.listing.listingId}` : null,
  };
}

// Reads every page of inventory SKUs. Reports `truncated` if the safety cap was hit.
async function listInventorySkus(base, headers, fetchImpl) {
  const skus = [];
  for (let page = 0; page < MAX_INVENTORY_PAGES; page++) {
    const offset = page * INVENTORY_PAGE_SIZE;
    const url = `${base}/sell/inventory/v1/inventory_item?limit=${INVENTORY_PAGE_SIZE}&offset=${offset}`;
    const body = await getJson(fetchImpl, url, headers);
    const items = body.inventoryItems || [];
    for (const item of items) if (item.sku) skus.push(item.sku);
    const total = Number(body.total);
    const reachedEnd = items.length < INVENTORY_PAGE_SIZE || (Number.isFinite(total) && skus.length >= total);
    if (reachedEnd) return { skus, truncated: false };
  }
  return { skus, truncated: true };
}

async function fetchOffersForSku(sku, base, headers, fetchImpl) {
  const url = `${base}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=EBAY_US`;
  const body = await getJson(fetchImpl, url, headers);
  return (body.offers || []).map(toListing);
}

// Returns the offers that could be read, plus how many SKUs failed. One bad SKU no longer hides the rest.
async function readOffers(skus, base, headers, fetchImpl) {
  const offers = [];
  let unreadable = 0;
  for (let i = 0; i < skus.length; i += OFFER_BATCH_SIZE) {
    const batch = skus.slice(i, i + OFFER_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((sku) => fetchOffersForSku(sku, base, headers, fetchImpl)));
    for (const result of results) {
      if (result.status === "fulfilled") offers.push(...result.value);
      else unreadable += 1;
    }
  }
  return { offers, unreadable };
}

async function readSold(base, headers, fetchImpl) {
  try {
    const body = await getJson(fetchImpl, `${base}/sell/fulfillment/v1/order?limit=50`, headers);
    const orders = (body.orders || []).map((o) => ({
      orderId: o.orderId,
      total: o.pricingSummary?.total?.value ?? null,
      status: o.orderFulfillmentStatus,
      items: (o.lineItems || []).map((l) => l.title),
    }));
    return { available: true, orders };
  } catch (err) {
    const permission = /scope|permission|unauthori[sz]ed|forbidden|403|401/i.test(err.message);
    return { available: false, note: permission ? ORDER_PERMISSION_NOTE : SOLD_UNAVAILABLE_NOTE, orders: [] };
  }
}

// Full eBay read. Throws only if the token or the inventory list itself fails.
async function readEbayStorefront({ accessToken, base, fetchImpl }) {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Accept-Language": "en-US", "Content-Language": "en-US" };
  const { skus, truncated } = await listInventorySkus(base, headers, fetchImpl);
  const { offers, unreadable } = await readOffers(skus, base, headers, fetchImpl);
  const sold = await readSold(base, headers, fetchImpl);
  return {
    connected: true,
    active: offers.filter((o) => o.status === "PUBLISHED"),
    drafts: offers.filter((o) => o.status === "UNPUBLISHED"),
    sold,
    unreadable,
    truncated,
  };
}

async function readFacebook({ pageId, token, fetchImpl }) {
  if (!pageId || !token) return { connected: false };
  const headers = { Authorization: `Bearer ${token}` };
  const pg = await getJson(fetchImpl, `https://graph.facebook.com/v25.0/${pageId}?fields=name,link,access_token`, headers).catch(() => null);
  if (!pg || !pg.access_token) return { connected: false, error: "Facebook Page check failed" };
  const pageHeaders = { Authorization: `Bearer ${pg.access_token}` };
  const feed = await getJson(fetchImpl, `https://graph.facebook.com/v25.0/${pageId}/posts?fields=message,created_time,permalink_url,full_picture&limit=12`, pageHeaders).catch(() => ({ data: [] }));
  return {
    connected: true,
    name: pg.name,
    url: pg.link || null,
    posts: (feed.data || []).map((p) => ({
      id: p.id,
      text: p.message || "",
      time: p.created_time,
      url: p.permalink_url || null,
      image: p.full_picture || null,
    })),
  };
}

async function readInstagram({ token, fetchImpl }) {
  if (!token) return { connected: false };
  const headers = { Authorization: `Bearer ${token}` };
  const me = await getJson(fetchImpl, "https://graph.instagram.com/v25.0/me?fields=username", headers).catch(() => null);
  if (!me) return { connected: false, error: "Instagram check failed" };
  const media = await getJson(fetchImpl, "https://graph.instagram.com/v25.0/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=12", headers).catch(() => ({ data: [] }));
  return {
    connected: true,
    username: me.username,
    posts: (media.data || []).map((m) => ({
      id: m.id,
      text: m.caption || "",
      time: m.timestamp,
      url: m.permalink || null,
      image: m.media_type === "VIDEO" ? (m.thumbnail_url || null) : (m.media_url || null),
    })),
  };
}

module.exports = { readEbayStorefront, readFacebook, readInstagram, listInventorySkus, readOffers, readSold, toListing };
