// POST /api/channels/tiktok-shop/callback   body: { code }
//
// Exchanges a TikTok Shop Partner Center authorization code for a refresh
// token, then stores it encrypted for the CALLING USER'S tenant via the
// store_marketplace_connection RPC — same tenant-resolution-from-auth.uid()
// pattern as pages/api/channels/ebay/callback.js. Never accepts or trusts a
// tenant_id from the client.
//
// TikTok Shop's auth API (auth.tiktok-shops.com, NOT the general TikTok
// Login Kit domain used by an earlier, never-tested draft of this route) is
// a GET request with app_key/app_secret/auth_code in the query string, and
// signals success via a JSON body with code === 0 — NOT via HTTP status,
// which is 200 for most auth failures too. grant_type must be exactly
// "authorized_code" (TikTok's own non-standard spelling), not the usual
// OAuth "authorization_code". Token host is shared for US and ROW and
// resolves from TIKTOK_SHOP_REGION / TIKTOK_SHOP_AUTH_HOST (default US).
// See lib/tiktokShopHosts.js.

const { TikTokShopConnector } = require("../../../../lib/channels/TikTokShopConnector");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const userAccessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!userAccessToken) {
    return res.status(401).json({ ok: false, error: "Missing session" });
  }

  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ ok: false, error: "Missing authorization code" });
  }

  const appKey = process.env.TIKTOK_SHOP_APP_KEY;
  const appSecret = process.env.TIKTOK_SHOP_APP_SECRET;
  if (!appKey || !appSecret) {
    return res.status(503).json({ ok: false, error: "TikTok Shop credentials not configured on server" });
  }

  // 1. Exchange the auth code for access + refresh tokens, then read the
  // authorized shop so its shop_cipher is saved with the connection.
  let tokenData;
  let shop = null;
  try {
    tokenData = await TikTokShopConnector.exchangeAuthCode(code);
  } catch (err) {
    return res.status(err.statusCode || 502).json({ ok: false, error: err.message });
  }
  try {
    const shops = await TikTokShopConnector.getAuthorizedShopsWithToken(tokenData.access_token);
    shop = shops.find((s) => String(s.region).toUpperCase() === "US") || shops[0] || null;
  } catch (err) {
    // Non-fatal: the connector looks the cipher up again when it lists.
  }
  const tokenBody = { data: tokenData };

  const shopName = shop?.name || tokenBody.data.seller_name || null;

  // 2. Store it — the RPC resolves the tenant from userAccessToken's
  // auth.uid(), not from anything in this request body.
  try {
    const rpcRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/store_marketplace_connection`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${userAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_marketplace: "tiktok-shop",
        p_environment: "production",
        p_refresh_token: tokenBody.data.refresh_token,
        p_account_identifier: shopName,
        p_metadata: shop ? { shop_id: shop.id, shop_cipher: shop.cipher, shop_region: shop.region, seller_type: shop.seller_type } : {},
      }),
    });
    if (!rpcRes.ok) {
      const errBody = await rpcRes.text();
      return res.status(502).json({ ok: false, error: `Failed to save connection: ${errBody}` });
    }
  } catch (err) {
    return res.status(502).json({ ok: false, error: `Failed to save connection: ${err.message}` });
  }

  return res.status(200).json({ ok: true, accountIdentifier: shopName });
}
