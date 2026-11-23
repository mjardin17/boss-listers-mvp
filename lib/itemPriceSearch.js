// Extra searches for an item after a photo scan, all through official APIs (no scraping):
//   - eBay Browse API: what the same item is LISTED for right now (asking prices, not sales).
//     eBay gives no free sold-price API (see lib/cardPricingEbay.js for the checked facts).
//   - Google Programmable Search: web results, only when GOOGLE_CSE_KEY and GOOGLE_CSE_ID are set.
// Every function returns null / [] when off or failing; nothing here invents a number.

const EBAY_BASE = "https://api.ebay.com";
const TIMEOUT_MS = 12000;
const EBAY_LIMIT = 30;
const TOKEN_MARGIN_MS = 60_000;

let ebayToken = null; // { value, expiresAt }

const round2 = (n) => Math.round(n * 100) / 100;

/** Short search words: long AI titles find nothing, so keep the first few words. */
function shortQuery(text, words = 7) {
  return String(text || "").replace(/[^\p{L}\p{N}\s/#.-]/gu, " ").split(/\s+/).filter(Boolean).slice(0, words).join(" ");
}

async function getEbayAppToken(fetchImpl = fetch, now = Date.now()) {
  if (ebayToken && ebayToken.expiresAt - TOKEN_MARGIN_MS > now) return ebayToken.value;
  const { EBAY_CLIENT_ID, EBAY_CLIENT_SECRET } = process.env;
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET || process.env.EBAY_ENVIRONMENT === "sandbox") return null;
  const basic = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64");
  const r = await fetchImpl(`${EBAY_BASE}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) return null;
  const j = await r.json();
  if (!j.access_token) return null;
  ebayToken = { value: j.access_token, expiresAt: now + (Number(j.expires_in) || 7200) * 1000 };
  return ebayToken.value;
}

/** Fixed-price asking prices from an eBay search reply, as a summary, or null. */
function summarizeEbayListings(data) {
  const items = Array.isArray(data?.itemSummaries) ? data.itemSummaries : [];
  const priced = items
    .filter((it) => {
      const opts = (it.buyingOptions || []).map((o) => String(o).toUpperCase());
      return opts.includes("FIXED_PRICE") && it.price?.currency === "USD";
    })
    .map((it) => ({ price: Number(it.price.value), url: String(it.itemWebUrl || "").split("?")[0] }))
    .filter((it) => Number.isFinite(it.price) && it.price > 0);
  if (!priced.length) return null;
  const prices = priced.map((p) => p.price).sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  return {
    low: round2(prices[0]),
    median: round2(median),
    high: round2(prices[prices.length - 1]),
    count: prices.length,
    sourceUrls: priced.map((p) => p.url).filter((u) => /^https:\/\/www\.ebay\.com\//.test(u)).slice(0, 5),
  };
}

/** What the item is listed for on eBay right now, or null. */
async function ebayListedPrices(query, fetchImpl = fetch) {
  const q = shortQuery(query);
  if (q.length < 3) return null;
  try {
    const token = await getEbayAppToken(fetchImpl);
    if (!token) return null;
    const r = await fetchImpl(`${EBAY_BASE}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=${EBAY_LIMIT}`, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const out = summarizeEbayListings(await r.json());
    return out && { ...out, query: q };
  } catch {
    return null;
  }
}

/** Google web results for the item, or [] when no key is set or it fails. */
async function googleSearch(query, fetchImpl = fetch) {
  const { GOOGLE_CSE_KEY, GOOGLE_CSE_ID } = process.env;
  const q = shortQuery(query, 10);
  if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_ID || q.length < 3) return [];
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(GOOGLE_CSE_KEY)}&cx=${encodeURIComponent(GOOGLE_CSE_ID)}&num=5&q=${encodeURIComponent(q)}`;
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return [];
    const j = await r.json();
    return (Array.isArray(j.items) ? j.items : []).slice(0, 5).map((it) => ({
      title: String(it.title || "").slice(0, 200),
      url: String(it.link || ""),
      text: String(it.snippet || "").slice(0, 600),
    }));
  } catch {
    return [];
  }
}

module.exports = { ebayListedPrices, googleSearch, summarizeEbayListings, shortQuery };
