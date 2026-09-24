// GET /api/status
// Aggregate status for the Empire Dashboard tile: listing totals,
// per-platform connector health, and the 10 most recent listings.
// Read-only — makes no writes, creates nothing, never live-lists.

const {
  EbayConnector,
  EtsyConnector,
  FacebookConnector,
  InstagramConnector,
  BonanzaConnector,
  ShopifyConnector,
  WooCommerceConnector,
  AmazonConnector,
  TikTokShopConnector,
} = require("../../lib/channels/apiConnectors");

const CONNECTORS = [
  { label: "ebay", Cls: EbayConnector },
  { label: "etsy", Cls: EtsyConnector },
  { label: "facebook", Cls: FacebookConnector },
  { label: "instagram", Cls: InstagramConnector },
  { label: "bonanza", Cls: BonanzaConnector },
  { label: "shopify", Cls: ShopifyConnector },
  { label: "woocommerce", Cls: WooCommerceConnector },
  { label: "amazon", Cls: AmazonConnector },
  { label: "tiktok_shop", Cls: TikTokShopConnector },
];

// Per-connector cap so one slow/hanging marketplace API can't stall the
// whole dashboard tile — matches scripts/check-connections.js's own
// timeout, applied per connector rather than summed across all nine.
const CONNECTOR_TIMEOUT_MS = 10_000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function getPlatformHealth() {
  // Calls testConnection() directly (not the more conservative
  // getConnectionStatus(), which several connectors — e.g. Facebook —
  // deliberately skip live-testing on to stay cheap for UI reads) so this
  // tile reports the same real, live-probed health as
  // scripts/check-connections.js, never an assumed status.
  const results = await Promise.allSettled(
    CONNECTORS.map(async ({ label, Cls }) => {
      const envNames = Cls.ENV || [];
      const credsPresent = envNames.length > 0 && envNames.every((n) => !!process.env[n]);
      try {
        const connector = new Cls();
        const probe = await withTimeout(connector.testConnection(), CONNECTOR_TIMEOUT_MS);
        return { marketplace: label, credsPresent, status: probe.status, detail: probe.detail };
      } catch (err) {
        return { marketplace: label, credsPresent, status: "error", detail: err.message };
      }
    })
  );
  return results.map((r, i) =>
    r.status === "fulfilled" ? r.value : { marketplace: CONNECTORS[i].label, credsPresent: false, status: "error", detail: r.reason?.message || "Unknown error" }
  );
}

async function supabaseRest(path) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const err = new Error("Supabase not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    err.statusCode = 503;
    throw err;
  }
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const detail = await res.text();
    const err = new Error(`Supabase GET ${path} failed (${res.status}): ${detail}`);
    err.statusCode = 502;
    throw err;
  }
  return res;
}

async function getListingTotals() {
  // exact count via Prefer: count=exact, HEAD-style (no body needed for the count itself)
  const countFor = async (filter) => {
    const res = await supabaseRest(`products?select=id${filter ? `&${filter}` : ""}`);
    const range = res.headers.get("content-range"); // "0-9/123"
    const total = range ? parseInt(range.split("/")[1], 10) : null;
    return Number.isFinite(total) ? total : (await res.json()).length;
  };

  const [total, published, active] = await Promise.all([
    countFor(""),
    countFor("published=eq.true"),
    countFor("status=eq.active"),
  ]);

  return { total, published, active };
}

async function getRecentListings(limit = 10) {
  const res = await supabaseRest(
    `products?select=id,sku,title,price,quantity,status,source,published,image_url,updated_at&order=updated_at.desc&limit=${limit}`
  );
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const [totals, recentListings, platforms] = await Promise.all([
      getListingTotals(),
      getRecentListings(10),
      getPlatformHealth(),
    ]);

    return res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      totals,
      platforms,
      recentListings,
    });
  } catch (err) {
    console.error("[api/status]", err.message);
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
}
