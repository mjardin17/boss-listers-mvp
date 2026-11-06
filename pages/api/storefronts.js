// pages/api/storefronts.js
// GET → one overview of every storefront the owner runs, grouped as active, draft and sold.
//   eBay: active and draft offers from the eBay API; sold orders need the order-read permission.
//   Facebook, Instagram: connection check. Shopify, site, Etsy, Amazon: status and links.
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
  const page = process.env.FB_PAGE_ID, token = process.env.FB_ACCESS_TOKEN;
  if (!page || !token) return { connected: false };
  const pg = await (await fetch(`https://graph.facebook.com/v25.0/${page}?fields=name,link&access_token=${token}`)).json();
  return pg.error ? { connected: false, error: "Facebook Page check failed" } : { connected: true, name: pg.name, url: pg.link || null };
}

async function instagramStatus() {
  const token = process.env.IG_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return { connected: false };
  const me = await (await fetch(`https://graph.instagram.com/v25.0/me?fields=username&access_token=${token}`)).json();
  return me.error ? { connected: false, error: "Instagram check failed" } : { connected: true, username: me.username };
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
      shopify: { connected: false, linkOnly: true, url: "https://jardinsoutpost.com", note: "Not checked by BossListers. Store closes Nov 15 2026 unless you change it", active: [], drafts: [] },
      site: { connected: false, linkOnly: true, url: "https://jardins-outpost.pages.dev", note: "Not checked by BossListers. Its shop section syncs from eBay" },
      etsy: { connected: false, note: "No shop yet" },
      amazon: { connected: false, note: "Account not connected (plan decision pending)" },
    },
  });
}
