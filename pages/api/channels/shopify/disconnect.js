// POST /api/channels/shopify/disconnect
// Removes THIS caller's tenant's stored Shopify OAuth connection via the
// disconnect_marketplace_connection RPC (migration 0020). Only removes the
// per-tenant OAuth row — never touches the shared, single-store
// SHOPIFY_ADMIN_TOKEN fallback in .env.local, which is a separate,
// env-level connection this endpoint has no authority over.

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

  try {
    const rpcRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/disconnect_marketplace_connection`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${userAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_marketplace: "shopify" }),
    });
    if (!rpcRes.ok) {
      const detail = await rpcRes.text();
      return res.status(502).json({ ok: false, error: `Disconnect failed (HTTP ${rpcRes.status}): ${detail}` });
    }
    const disconnected = await rpcRes.json();
    return res.status(200).json({ ok: true, disconnected });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
}
