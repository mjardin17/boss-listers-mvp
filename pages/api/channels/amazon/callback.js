// POST /api/channels/amazon/callback   body: { code }
//
// Exchanges an Amazon Login-with-Amazon (LWA) authorization code for a
// refresh token, then stores it encrypted for the CALLING USER'S tenant via
// the store_marketplace_connection RPC — same tenant-resolution-from-
// auth.uid() pattern as pages/api/channels/ebay/callback.js. Never accepts
// or trusts a tenant_id from the client.

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

  const clientId = process.env.AMAZON_CLIENT_ID;
  const clientSecret = process.env.AMAZON_CLIENT_SECRET;
  const redirectUri = process.env.AMAZON_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(503).json({ ok: false, error: "Amazon credentials not configured on server" });
  }

  // 1. Exchange the code for a refresh token via Amazon's LWA token
  // endpoint (the same endpoint used later to refresh the access token —
  // see AmazonConnector._getAccessToken in lib/channels/apiConnectors.js).
  let tokenBody;
  try {
    const tokenRes = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    tokenBody = await tokenRes.json();
    if (!tokenRes.ok || !tokenBody.refresh_token) {
      return res.status(502).json({
        ok: false,
        error: tokenBody.error_description || `Amazon token exchange failed (HTTP ${tokenRes.status})`,
      });
    }
  } catch (err) {
    return res.status(504).json({ ok: false, error: `Amazon token exchange timed out: ${err.message}` });
  }

  // 2. Store it — the RPC resolves the tenant from userAccessToken's
  // auth.uid(), not from anything in this request body. Amazon's LWA
  // response has no seller-facing "username" like eBay/Etsy do, so there's
  // no accountIdentifier to look up here.
  try {
    const rpcRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/store_marketplace_connection`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${userAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_marketplace: "amazon",
        p_environment: "production",
        p_refresh_token: tokenBody.refresh_token,
        p_account_identifier: null,
        p_metadata: {},
      }),
    });
    if (!rpcRes.ok) {
      const errBody = await rpcRes.text();
      return res.status(502).json({ ok: false, error: `Failed to save connection: ${errBody}` });
    }
  } catch (err) {
    return res.status(502).json({ ok: false, error: `Failed to save connection: ${err.message}` });
  }

  return res.status(200).json({ ok: true });
}
