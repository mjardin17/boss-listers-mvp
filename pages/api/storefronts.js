// pages/api/storefronts.js
// GET → one overview of every storefront the owner runs.
//   eBay: active and draft offers from the eBay API; sold orders need the order-read permission.
//   Facebook Page and Instagram: connection check plus the most recent posts.
//   Shopify, website, Etsy, Amazon: link or status only (not checked here).
// Auth: owner session required. Read-only; nothing is published or changed here.

const fs = require("fs");
const path = require("path");
const { requireOwnerSession } = require("../../lib/requireSession");
const { EbayConnector } = require("../../lib/channels/apiConnectors");

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
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

async function ebayStorefront(tenantId) {
  const c = new EbayConnector();
  const tok = await c._getAccessToken(tenantId);
  const base = EbayConnector.apiBase();
  const h = { Authorization: `Bearer ${tok}`, Accept: "application/json", "Accept-Language": "en-US", "Content-Language": "en-US" };
  const inv = await (await fetch(base + "/sell/inventory/v1/inventory_item?limit=100", { headers: h })).json();
  const skus = (inv.inventoryItems || []).map((i) => i.sku);
  const offers = [];
  for (const sku of skus) {
    const r = await (await fetch(base + "/sell/inventory/v1/offer?sku=" + encodeURIComponent(sku) + "&marketplace_id=EBAY_US", { headers: h })).json();
    for (const o of r.offers || []) offers.push(toListing(o));
  }
  const active = offers.filter((o) => o.status === "PUBLISHED");
  const drafts = offers.filter((o) => o.status === "UNPUBLISHED");
  const sold = await ebaySold(base, h);
  return { connected: true, active, drafts, sold };
}

// Sold orders need the sell.fulfillment scope. Until the eBay login grants it, report the reason.
async function ebaySold(base, h) {
  const r = await (await fetch(base + "/sell/fulfillment/v1/order?limit=50", { headers: h })).json();
  if (r.errors) return { available: false, note: "eBay login needs order-read permission before sold items can show here", orders: [] };
  const orders = (r.orders || []).map((o) => ({
    orderId: o.orderId,
    total: o.pricingSummary?.total?.value ?? null,
    status: o.orderFulfillmentStatus,
    items: (o.lineItems || []).map((l) => l.title),
  }));
  return { available: true, orders };
}

async function facebookStatus() {
  const page = process.env.FB_PAGE_ID;
  const token = process.env.FB_ACCESS_TOKEN;
  if (!page || !token) return { connected: false };
  const pg = await (await fetch(`https://graph.facebook.com/v25.0/${page}?fields=name,link,access_token&access_token=${token}`)).json();
  if (pg.error || !pg.access_token) return { connected: false, error: "Facebook Page check failed" };
  const feed = await (await fetch(`https://graph.facebook.com/v25.0/${page}/posts?fields=message,created_time,permalink_url,full_picture&limit=12&access_token=${pg.access_token}`)).json();
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

async function instagramStatus() {
  const token = process.env.IG_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return { connected: false };
  const me = await (await fetch(`https://graph.instagram.com/v25.0/me?fields=username&access_token=${token}`)).json();
  if (me.error) return { connected: false, error: "Instagram check failed" };
  const media = await (await fetch(`https://graph.instagram.com/v25.0/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=12&access_token=${token}`)).json();
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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const session = await requireOwnerSession(req, res);
  if (!session) return;
  loadEnvLocal();

  const [ebay, facebook, instagram] = await Promise.all([
    ebayStorefront(process.env.PLATFORM_OWNER_TENANT_ID).catch((e) => ({ connected: false, error: e.message })),
    facebookStatus().catch(() => ({ connected: false })),
    instagramStatus().catch(() => ({ connected: false })),
  ]);

  return res.status(200).json({
    ok: true,
    storefronts: {
      ebay,
      facebook,
      instagram,
      shopify: { connected: false, linkOnly: true, url: "https://jardinsoutpost.com", note: "Not checked by BossListers. Store closes Nov 15 2026 unless you change it" },
      site: { connected: false, linkOnly: true, url: "https://jardins-outpost.pages.dev", note: "Not checked by BossListers. Its shop section syncs from eBay" },
      etsy: { connected: false, note: "No shop yet" },
      amazon: { connected: false, note: "Account not connected (plan decision pending)" },
    },
  });
}
