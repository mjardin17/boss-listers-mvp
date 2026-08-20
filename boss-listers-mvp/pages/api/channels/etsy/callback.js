// POST /api/channels/etsy/callback   body: { code, codeVerifier }
//
// Exchanges an Etsy OAuth authorization code for a refresh token, then
// stores it encrypted for the CALLING USER'S tenant via the
// store_marketplace_connection RPC (SECURITY DEFINER, resolves tenant from
// the caller's own auth.uid() — see migrations 0013-0015). Same tenant-
// resolution pattern as pages/api/channels/ebay/callback.js: the bearer
// token IS the identity, never anything the client asserts in the body.
//
// Etsy differs from eBay here in one real way: it's OAuth 2.0 + PKCE
// (public-client style) — the token exchange has no client_secret in the
// request, so `codeVerifier` (generated client-side, stashed in
// sessionStorage, see pages/channels.js's startEtsyConnect()) has to be
// sent to this route instead. [Likely, not yet exercised against a live
// token as of 2026-08-20 — Etsy app registration was pending review.
// Re-verify the exact token/shops response shape the first time this runs.]

const REDIRECT_URI = process.env.ETSY_REDIRECT_URI;

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

  const { code, codeVerifier } = req.body || {};
  if (!code || !codeVerifier) {
    return res.status(400).json({ ok: false, error: "Missing authorization code or PKCE verifier" });
  }

  // 1. Exchange the code for a refresh token using the app's shared Etsy
  // Keystring (one app registration serves every tenant). No client_secret
  // in this call — PKCE's code_verifier is the proof instead.
  let tokenBody;
  try {
    const tokenRes = await fetch("https://api.etsy.com/v3/public/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.ETSY_KEYSTRING,
        redirect_uri: REDIRECT_URI,
        code,
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    tokenBody = await tokenRes.json();
    if (!tokenRes.ok || !tokenBody.refresh_token || !tokenBody.access_token) {
      return res.status(502).json({
        ok: false,
        error: tokenBody.error_description || tokenBody.error || `Etsy token exchange failed (HTTP ${tokenRes.status})`,
      });
    }
  } catch (err) {
    return res.status(504).json({ ok: false, error: `Etsy token exchange timed out: ${err.message}` });
  }

  // 2. Etsy access tokens are formatted "{user_id}.{opaque_token}" — the
  // user id is needed to look up which shop this seller owns. A failure
  // here must not block storing the connection; it just means shop_id
  // isn't on record yet and createListing() will refuse with a clear
  // "reconnect" error rather than guessing a shop.
  let accountIdentifier = null;
  let shopId = null;
  try {
    const userId = tokenBody.access_token.split(".")[0];
    const shopsRes = await fetch(`https://openapi.etsy.com/v3/application/users/${userId}/shops`, {
      headers: {
        Authorization: `Bearer ${tokenBody.access_token}`,
        "x-api-key": process.env.ETSY_KEYSTRING,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (shopsRes.ok) {
      const shop = await shopsRes.json();
      if (shop && shop.shop_id) {
        shopId = String(shop.shop_id);
        accountIdentifier = shop.shop_name || null;
      }
    }
  } catch {
    // Non-fatal — proceed without shop_id; connection still stores the
    // refresh token, just flagged as needing a shop_id fix later.
  }

  // 3. Store it — the RPC resolves the tenant from userAccessToken's
  // auth.uid(), never from anything in this request body. shop_id goes in
  // `metadata` (added in migration 0015 specifically because Etsy, unlike
  // eBay, needs a per-tenant value beyond the token itself for every
  // listing call).
  try {
    const rpcRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/store_marketplace_connection`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${userAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_marketplace: "etsy",
        p_environment: "production",
        p_refresh_token: tokenBody.refresh_token,
        p_account_identifier: accountIdentifier,
        p_metadata: shopId ? { shopId } : null,
      }),
    });
    if (!rpcRes.ok) {
      const errBody = await rpcRes.text();
      return res.status(502).json({ ok: false, error: `Failed to save connection: ${errBody}` });
    }
  } catch (err) {
    return res.status(502).json({ ok: false, error: `Failed to save connection: ${err.message}` });
  }

  return res.status(200).json({
    ok: true,
    accountIdentifier,
    shopIdMissing: !shopId, // lets the callback page warn the user if the shop lookup failed
  });
}
