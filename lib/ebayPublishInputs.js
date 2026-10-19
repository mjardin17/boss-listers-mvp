// lib/ebayPublishInputs.js
// What eBay needs before an offer can be created, resolved server-side from the
// seller's own account: a category id for the title and the first business
// policy of each kind plus the inventory location. Mirrors what pages/capture.js
// does in the browser (category-suggest + policies routes) so that the
// multi-platform poster can publish to eBay without a browser round trip.
// Never guesses: anything it cannot read throws with a message naming it.

function apiBase() {
  return process.env.EBAY_ENVIRONMENT === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
}

async function getJson(url, headers, label) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`eBay ${label} failed (HTTP ${res.status})`);
  return body;
}

// The Taxonomy API is public reference data and wants eBay's application
// (client_credentials) token, not the seller's user token.
async function suggestCategoryId(title, fetchImpl = fetch) {
  const { EBAY_CLIENT_ID, EBAY_CLIENT_SECRET } = process.env;
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) throw new Error("eBay app credentials are not configured");
  const base = apiBase();
  const basic = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64");
  const tokenRes = await fetchImpl(`${base}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) throw new Error(`eBay application token failed (HTTP ${tokenRes.status})`);
  const { access_token: appToken } = await tokenRes.json();
  const headers = { Authorization: `Bearer ${appToken}` };

  const { categoryTreeId } = await getJson(`${base}/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_US`, headers, "category tree lookup");
  const suggestions = await getJson(
    `${base}/commerce/taxonomy/v1/category_tree/${categoryTreeId}/get_category_suggestions?q=${encodeURIComponent(title)}`,
    headers,
    "category suggestion"
  );
  const best = suggestions?.categorySuggestions?.[0]?.category;
  if (!best?.categoryId) throw new Error("eBay could not suggest a category for this title");
  return { categoryId: String(best.categoryId), categoryName: best.categoryName };
}

// userAccessToken: the seller's own eBay access token (EbayConnector._getAccessToken(tenantId)).
async function resolvePolicies(userAccessToken) {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${userAccessToken}`, "Content-Language": "en-US" };
  const [fulfillment, payment, ret, locations] = await Promise.all([
    getJson(`${base}/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US`, headers, "shipping policies"),
    getJson(`${base}/sell/account/v1/payment_policy?marketplace_id=EBAY_US`, headers, "payment policies"),
    getJson(`${base}/sell/account/v1/return_policy?marketplace_id=EBAY_US`, headers, "return policies"),
    getJson(`${base}/sell/inventory/v1/location`, headers, "inventory locations"),
  ]);
  const policies = {
    fulfillment_policy_id: fulfillment?.fulfillmentPolicies?.[0]?.fulfillmentPolicyId,
    payment_policy_id: payment?.paymentPolicies?.[0]?.paymentPolicyId,
    return_policy_id: ret?.returnPolicies?.[0]?.returnPolicyId,
    merchant_location_key: locations?.locations?.[0]?.merchantLocationKey,
  };
  const missing = Object.entries(policies).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`eBay account is missing: ${missing.join(", ")}`);
  return policies;
}

module.exports = { suggestCategoryId, resolvePolicies };
