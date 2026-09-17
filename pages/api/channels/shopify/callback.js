import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SHOPIFY_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ ok: false, error: "No bearer token" });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.id) throw new Error("Invalid token");
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid authentication" });
  }

  const { code, shop, state } = req.body;
  if (typeof code !== "string" || typeof shop !== "string" || typeof state !== "string") {
    return res.status(400).json({ ok: false, error: "Invalid request parameters" });
  }

  if (!SHOPIFY_DOMAIN_RE.test(shop)) {
    return res.status(400).json({ ok: false, error: "Invalid shop domain format" });
  }

  try {
    // Validate CSRF state server-side. In production, this should check against
    // a server-stored token or session, not just format. For now, verify basic
    // format to catch obvious tampering.
    if (!state || state.length < 16) {
      return res.status(400).json({ ok: false, error: "Invalid or missing state" });
    }

    // Exchange the authorization code for an access token.
    // shop is now validated to be *.myshopify.com format only.
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!tokenRes.ok) {
      // Log the full error server-side but don't leak it to the client
      console.error(`Shopify token exchange failed for ${shop}: ${await tokenRes.text()}`);
      throw new Error("Shopify token exchange failed");
    }

    const tokenBody = await tokenRes.json();
    if (!tokenBody.access_token) {
      throw new Error("Invalid response from Shopify");
    }

    // Store the connection (token is encrypted server-side).
    //
    // store_marketplace_connection's real signature is (p_marketplace,
    // p_environment, p_refresh_token, p_account_identifier, p_metadata) —
    // it resolves tenant_id from the CALLER'S OWN auth.uid(), not from a
    // p_tenant_id argument (there isn't one, nor p_access_token/p_expires_in
    // — no overload matches those names, so the old call guaranteed a
    // PGRST202 "function not found" on every attempt). Shopify tokens don't
    // expire, so the (non-expiring) access token is stored in the
    // p_refresh_token slot — the only token field the schema has, same as
    // every other connector here.
    //
    // This must be called with the USER's bearer token, not the service-role
    // client above (that client is only for validating the token via
    // auth.getUser) — a service-role call has no auth.uid() context, so the
    // function would resolve the wrong tenant (or none). Same REST+fetch
    // pattern as pages/api/channels/{etsy,amazon,tiktok-shop,ebay}/callback.js.
    const rpcRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/store_marketplace_connection`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_marketplace: "shopify",
        p_environment: "production",
        p_refresh_token: tokenBody.access_token,
        p_account_identifier: shop,
        p_metadata: {},
      }),
    });

    if (!rpcRes.ok) {
      const errBody = await rpcRes.text();
      console.error(`Shopify store_marketplace_connection failed: ${errBody}`);
      throw new Error("Failed to save connection");
    }

    return res.status(200).json({
      ok: true,
      accountIdentifier: shop,
    });
  } catch (err) {
    console.error(`Shopify callback error: ${err.message}`);
    return res.status(500).json({ ok: false, error: "Connection failed" });
  }
}
