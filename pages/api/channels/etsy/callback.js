// POST /api/channels/etsy/callback   body: { code, codeVerifier }
//
// Exchanges an Etsy OAuth 2.0 + PKCE authorization code for a refresh
// token, then stores it encrypted for the CALLING USER'S tenant via the
// same store_marketplace_connection RPC the eBay callback uses (SECURITY
// DEFINER, resolves tenant from the caller's own auth.uid()).
//
// Mirrors pages/api/channels/ebay/callback.js's shape and safety model —
// this route never receives or trusts a tenant_id from the client, and
// never accepts anything as identity except the caller's own bearer token.
//
// One real difference from eBay's exchange: Etsy is a PKCE public client,
// so there's no client_secret in the token request — instead the browser
// that started the flow must supply back the same code_verifier it
// generated before redirecting to Etsy (see startEtsyConnect() in
// pages/channels.js, which stores it in sessionStorage under
// "boss_etsy_code_verifier"). Without the matching verifier, Etsy's token
// endpoint rejects the exchange outright — this route can't work around
// that, and doesn't try to.
//
// Etsy access tokens are shaped "<numeric_user_id>.<opaque>" — the user id
// prefix is used only to fetch a display name for accountIdentifier, never
// as an authorization boundary.
//
// Resolves and stores shop_id in p_metadata (read by
// EtsyConnector._getTenantConnection() as metadata.shopId || metadata.shop_id
// — see lib/channels/apiConnectors.js). If the connecting user has no shop,
// this route refuses to store a connection that createListing() could never
// use anyway (it would just fail later with etsy_shop_id_missing) — instead
// it returns { shopIdMissing: true } so the frontend can say so up front.

const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
const REDIRECT_URI = process.env.ETSY_REDIRECT_URI; // must exactly match what was sent to /oauth/connect

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
  if (!code) {
    return res.status(400).json({ ok: false, error: "Missing authorization code" });
  }
  if (!codeVerifier) {
    return res.status(400).json({ ok: false, error: "Missing code_verifier — this exchange must be completed from the same browser session that started the Etsy connect flow." });
  }

  // 1. Exchange the code for a refresh token. Public-client PKCE exchange —
  // no client_secret in this request, per Etsy's documented OAuth flow.
  let tokenBody;
  try {
    const tokenRes = await fetch(ETSY_TOKEN_URL, {
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
    if (!tokenRes.ok || !tokenBody.refresh_token) {
      return res.status(502).json({
        ok: false,
        error: tokenBody.error_description || tokenBody.error || `Etsy token exchange failed (HTTP ${tokenRes.status})`,
      });
    }
  } catch (err) {
    return res.status(504).json({ ok: false, error: `Etsy token exchange timed out: ${err.message}` });
  }

  // The access token is shaped "<user_id>.<opaque>" — the user_id prefix is
  // used below only to ask Etsy who this is and which shop they own, never
  // as an identity/authorization check.
  const userId = String(tokenBody.access_token || "").split(".")[0];

  // 2. Best-effort: look up the connecting user's login name for display —
  // a failure here must not block storing the token.
  let accountIdentifier = null;
  try {
    if (userId) {
      const meRes = await fetch(`https://openapi.etsy.com/v3/application/users/${userId}`, {
        headers: {
          Authorization: `Bearer ${tokenBody.access_token}`,
          "x-api-key": process.env.ETSY_KEYSTRING,
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (meRes.ok) {
        const me = await meRes.json();
        accountIdentifier = me.login_name || me.primary_email || null;
      }
    }
  } catch {
    // Non-fatal — proceed without a display name.
  }

  // 3. Resolve shop_id — NOT best-effort. createListing() needs a shop_id to
  // do anything, and a connection stored without one just fails later with
  // etsy_shop_id_missing (see EtsyConnector._getTenantConnection() in
  // lib/channels/apiConnectors.js). Better to refuse to store it now and
  // tell the frontend why than to store a connection that can never work.
  let shopId = null;
  try {
    const shopsRes = await fetch(`https://openapi.etsy.com/v3/application/users/${userId}/shops`, {
      headers: {
        Authorization: `Bearer ${tokenBody.access_token}`,
        "x-api-key": process.env.ETSY_KEYSTRING,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (shopsRes.ok) {
      const shops = await shopsRes.json();
      // Etsy's shape here isn't pinned down in any local doc — handle a bare
      // shop object, a { results: [...] } list, or a bare array defensively
      // rather than guessing one and breaking silently on another.
      const first = Array.isArray(shops) ? shops[0] : Array.isArray(shops?.results) ? shops.results[0] : shops;
      shopId = first?.shop_id ?? null;
    }
  } catch {
    // Falls through to the shopIdMissing branch below.
  }

  if (!shopId) {
    return res.status(200).json({ ok: false, shopIdMissing: true, accountIdentifier });
  }

  // 4. Store it — same RPC + shape as the eBay callback. The RPC resolves
  // the tenant from userAccessToken's auth.uid(), not from this body.
  //
  // The DB has TWO overloaded versions of store_marketplace_connection (one
  // with p_metadata, one without) — PostgREST can't pick between them when
  // called with only the 4 shared params, and errors with PGRST203 "Could
  // not choose the best candidate function". Always passing p_metadata pins
  // the call to the 5-arg overload so it's no longer ambiguous (same fix as
  // pages/api/channels/ebay/callback.js).
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
        p_metadata: { shop_id: shopId },
      }),
    });
    if (!rpcRes.ok) {
      const errBody = await rpcRes.text();
      return res.status(502).json({ ok: false, error: `Failed to save connection: ${errBody}` });
    }
  } catch (err) {
    return res.status(502).json({ ok: false, error: `Failed to save connection: ${err.message}` });
  }

  return res.status(200).json({ ok: true, accountIdentifier });
}
