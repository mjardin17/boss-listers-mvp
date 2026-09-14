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

  let tenantId;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.id) throw new Error("Invalid token");
    tenantId = data.user.id;
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

    // Store the connection (access token is encrypted server-side).
    // Shopify tokens don't expire, so we use a far-future expiry (1 year).
    const { error: storeError } = await supabase.rpc(
      "store_marketplace_connection",
      {
        p_tenant_id: tenantId,
        p_marketplace: "shopify",
        p_access_token: tokenBody.access_token,
        p_refresh_token: null,
        p_expires_in: 365 * 24 * 60 * 60, // 1 year in seconds
        p_account_identifier: shop,
      }
    );

    if (storeError) throw storeError;

    return res.status(200).json({
      ok: true,
      accountIdentifier: shop,
    });
  } catch (err) {
    console.error(`Shopify callback error: ${err.message}`);
    return res.status(500).json({ ok: false, error: "Connection failed" });
  }
}
