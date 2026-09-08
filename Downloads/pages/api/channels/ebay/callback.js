// POST /api/channels/ebay/callback   body: { code }
//
// Exchanges an eBay OAuth authorization code for a refresh token, then
// stores it encrypted for the CALLING USER'S tenant via the
// store_marketplace_connection RPC (SECURITY DEFINER, resolves tenant from
// the caller's own auth.uid() — see migration 0014).
//
// This route is deliberately dumb about "which tenant" — it never receives
// or trusts a tenant_id from the client. The bearer token IS the identity;
// the RPC resolves the tenant server-side from that token. A forged or
// stolen state parameter can't attach a connection to the wrong tenant,
// because tenant identity never flows through the OAuth state at all.

const RUNAME = process.env.EBAY_RUNAME; // registered redirect_uri name, not a secret

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

  // 1. Exchange the code for a refresh token using the APP's shared eBay
  // credentials (never per-tenant — one app registration serves every
  // customer, per the actual product design).
  let tokenBody;
  try {
    const auth = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: RUNAME,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    tokenBody = await tokenRes.json();
    if (!tokenRes.ok || !tokenBody.refresh_token) {
      return res.status(502).json({
        ok: false,
        error: tokenBody.error_description || `eBay token exchange failed (HTTP ${tokenRes.status})`,
      });
    }
  } catch (err) {
    return res.status(504).json({ ok: false, error: `eBay token exchange timed out: ${err.message}` });
  }

  // 2. Look up the connecting eBay account's username for display —
  // best-effort only; a failure here must not block storing the token.
  let accountIdentifier = null;
  try {
    const meRes = await fetch("https://apiz.ebay.com/commerce/identity/v1/user/", {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (meRes.ok) {
      const me = await meRes.json();
      accountIdentifier = me.username || null;
    }
  } catch {
    // Non-fatal — proceed without a display name.
  }

  // 3. Store it — the RPC resolves the tenant from userAccessToken's
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
        p_marketplace: "ebay",
        p_environment: "production",
        p_refresh_token: tokenBody.refresh_token,
        p_account_identifier: accountIdentifier,
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
