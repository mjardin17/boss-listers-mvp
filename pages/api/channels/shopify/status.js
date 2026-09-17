// GET /api/channels/shopify/status
// Thin proxy to get_marketplace_connection_status — returns whether THIS
// caller's tenant has connected their own Shopify store. Mirrors
// pages/api/channels/{ebay,etsy,amazon,tiktok-shop}/status.js exactly.
//
// Previously called via the service-role client with an explicit
// p_tenant_id — but the function takes ONLY p_marketplace and resolves the
// tenant from the caller's own auth.uid() JWT context (confirmed live via
// Supabase's PostgREST OpenAPI schema). That old call's extra p_tenant_id
// param doesn't match any overload, and the service-role client has no
// user JWT context anyway — same class of bug already fixed in
// pages/api/channels/shopify/callback.js.

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

  try {
    const rpcRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/get_marketplace_connection_status`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${userAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_marketplace: "shopify" }),
    });
    if (!rpcRes.ok) {
      return res.status(502).json({ ok: false, error: `Status check failed (HTTP ${rpcRes.status})` });
    }
    const rows = await rpcRes.json();
    const row = rows[0] || { connected: false, account_identifier: null, connected_at: null, metadata: null };
    return res.status(200).json({ ok: true, ...row });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
}
