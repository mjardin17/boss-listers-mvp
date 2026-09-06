// GET /api/channels/ebay/category-suggest?q=<title>
// Resolves a real eBay category ID from a listing title via the Taxonomy
// API — eBay has no default category, and createOffer() rejects without
// one. Uses the same shared OAuth connection as everything else eBay in
// this app (sell.inventory scope covers Taxonomy reads too).
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.status(400).json({ ok: false, error: "Missing ?q= query (the listing title to categorize)" });

  const { EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_REFRESH_TOKEN, EBAY_ENVIRONMENT } = process.env;
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET || !EBAY_REFRESH_TOKEN) {
    return res.status(503).json({ ok: false, error: "eBay credentials not configured" });
  }
  const isSandbox = EBAY_ENVIRONMENT === "sandbox";
  const apiBase = isSandbox ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
  const authUrl = `${apiBase}/identity/v1/oauth2/token`;

  try {
    // The Taxonomy API is public reference data, not user-specific — it
    // takes eBay's Application (client_credentials) token, not the user
    // token every other route here uses. Using the wrong token type is
    // exactly what returned 403 on the first pass at this route.
    const auth = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64");
    const tokenRes = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "https://api.ebay.com/oauth/api_scope",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenRes.ok) return res.status(502).json({ ok: false, error: `Token refresh failed (HTTP ${tokenRes.status})` });
    const { access_token: accessToken } = await tokenRes.json();
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    // 1. Which category tree does EBAY_US use (nearly always "0", but this
    // reads it live rather than hardcoding a number that could change).
    const treeRes = await fetch(
      `${apiBase}/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_US`,
      { headers }
    );
    if (!treeRes.ok) return res.status(502).json({ ok: false, error: `get_default_category_tree_id failed (HTTP ${treeRes.status})` });
    const { categoryTreeId } = await treeRes.json();

    // 2. Suggest categories for this title.
    const suggestRes = await fetch(
      `${apiBase}/commerce/taxonomy/v1/category_tree/${categoryTreeId}/get_category_suggestions?q=${encodeURIComponent(q)}`,
      { headers }
    );
    if (!suggestRes.ok) {
      const detail = await suggestRes.text();
      return res.status(502).json({ ok: false, error: `get_category_suggestions failed (HTTP ${suggestRes.status})`, detail });
    }
    const suggestBody = await suggestRes.json();
    const suggestions = (suggestBody.categorySuggestions || []).map((s) => ({
      categoryId: s.category?.categoryId,
      categoryName: s.category?.categoryName,
      relevance: s.categoryTreeNodeAncestors?.length,
    }));

    return res.status(200).json({
      ok: true,
      categoryTreeId,
      best: suggestions[0] || null,
      suggestions,
    });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
}
