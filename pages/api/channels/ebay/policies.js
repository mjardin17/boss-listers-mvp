// GET /api/channels/ebay/policies
// Diagnostic/setup endpoint: fetches Josh's REAL eBay business policy IDs
// and inventory location key via the Account API, using THIS TENANT's own
// connected eBay refresh token (fetched via the get_my_marketplace_token
// RPC, resolved server-side from the caller's Supabase session) rather
// than the shared app-level EBAY_REFRESH_TOKEN. The shared token was only
// ever granted sell.inventory scope, so calling the Account API with it
// failed with invalid_scope — this tenant's own token has both
// sell.inventory and sell.account (see startEbayConnect() in
// pages/channels.js) because that's what it was connected with.
//
// These IDs (fulfillment_policy_id, payment_policy_id, return_policy_id,
// merchant_location_key) are required by createListing() and are specific
// to Josh's account; there is no valid default. This route exists so the
// UI (or Josh, reading this response once) can pick real values instead
// of the app guessing and eBay rejecting the offer at publish time.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const userAccessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!userAccessToken) {
    return res.status(401).json({ ok: false, error: "Missing session" });
  }

  const { EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_ENVIRONMENT, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    return res.status(503).json({ ok: false, error: "eBay credentials not configured" });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(503).json({ ok: false, error: "Supabase not configured" });
  }

  const isSandbox = EBAY_ENVIRONMENT === "sandbox";
  const apiBase = isSandbox ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
  const authBase = isSandbox
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
    : "https://api.ebay.com/identity/v1/oauth2/token";

  // 1. Get this tenant's own eBay refresh token via the self-resolving RPC
  //    (it reads auth.uid() from the bearer token, no tenant_id needed here).
  let tenantRefreshToken;
  try {
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_marketplace_token`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${userAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_marketplace: "ebay", p_environment: isSandbox ? "sandbox" : "production" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!rpcRes.ok) {
      const detail = await rpcRes.text();
      return res.status(502).json({ ok: false, error: `Failed to look up eBay connection: ${detail}` });
    }
    tenantRefreshToken = await rpcRes.json();
    if (!tenantRefreshToken) {
      return res.status(409).json({ ok: false, error: "No eBay connection found for your account. Connect eBay on the Channels page first." });
    }
  } catch (err) {
    return res.status(502).json({ ok: false, error: `Failed to look up eBay connection: ${err.message}` });
  }

  try {
    const auth = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64");
    const tokenRes = await fetch(authBase, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tenantRefreshToken,
        scope: [
          "https://api.ebay.com/oauth/api_scope/sell.inventory",
          "https://api.ebay.com/oauth/api_scope/sell.account",
        ].join(" "),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      return res.status(502).json({ ok: false, error: `Token refresh failed (HTTP ${tokenRes.status})`, detail });
    }
    const { access_token: accessToken } = await tokenRes.json();

    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
    const [fulfillment, payment, ret, locations] = await Promise.all([
      fetch(`${apiBase}/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US`, { headers }),
      fetch(`${apiBase}/sell/account/v1/payment_policy?marketplace_id=EBAY_US`, { headers }),
      fetch(`${apiBase}/sell/account/v1/return_policy?marketplace_id=EBAY_US`, { headers }),
      fetch(`${apiBase}/sell/inventory/v1/location`, { headers }),
    ]);

    const [fulfillmentBody, paymentBody, returnBody, locationsBody] = await Promise.all([
      fulfillment.json().catch(() => null),
      payment.json().catch(() => null),
      ret.json().catch(() => null),
      locations.json().catch(() => null),
    ]);

    return res.status(200).json({
      ok: true,
      fulfillmentPolicies: fulfillmentBody?.fulfillmentPolicies?.map((p) => ({ id: p.fulfillmentPolicyId, name: p.name })) || [],
      paymentPolicies: paymentBody?.paymentPolicies?.map((p) => ({ id: p.paymentPolicyId, name: p.name })) || [],
      returnPolicies: returnBody?.returnPolicies?.map((p) => ({ id: p.returnPolicyId, name: p.name })) || [],
      merchantLocations: locationsBody?.locations?.map((l) => ({ key: l.merchantLocationKey, name: l.name })) || [],
      raw: { fulfillmentStatus: fulfillment.status, paymentStatus: payment.status, returnStatus: ret.status, locationsStatus: locations.status },
    });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
}
