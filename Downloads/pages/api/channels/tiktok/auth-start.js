// TikTok Shop OAuth authorization start
// Redirects to TikTok's OAuth consent screen

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientId = process.env.TIKTOK_CLIENT_ID;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;
  const scope = "shop.fulfillment.write,shop.product.write,shop.order.read";

  if (!clientId || !redirectUri) {
    return res.status(400).json({
      error: "TikTok Shop credentials not configured",
      required: ["TIKTOK_CLIENT_ID", "TIKTOK_REDIRECT_URI"],
    });
  }

  const state = Math.random().toString(36).substring(7);
  res.setHeader("Set-Cookie", `tiktok_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);

  const authUrl = `https://auth.tiktok.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code&state=${state}`;

  return res.redirect(authUrl);
}
