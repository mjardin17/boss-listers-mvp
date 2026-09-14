// Amazon Selling Partner OAuth authorization start
// Redirects to Amazon's OAuth consent screen

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientId = process.env.AMAZON_CLIENT_ID;
  const redirectUri = process.env.AMAZON_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res.status(400).json({
      error: "Amazon credentials not configured",
      required: ["AMAZON_CLIENT_ID", "AMAZON_REDIRECT_URI"],
    });
  }

  const state = Math.random().toString(36).substring(7);
  res.setHeader("Set-Cookie", `amazon_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);

  const scope = encodeURIComponent("sellingpartnerapi::migration");
  const authUrl = `https://sellercentral.amazon.com/apps/authorize/consent?application_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  return res.redirect(authUrl);
}
