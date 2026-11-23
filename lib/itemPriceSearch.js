// Extra searches for an item after a photo scan, all through official APIs (no scraping):
//   - eBay Browse API: what the same item is LISTED for right now (asking prices, not sales).
//     eBay gives no free sold-price API (see lib/cardPricingEbay.js for the checked facts).
//   - Google Search through the Gemini API (GEMINI_API_KEY): a short summary plus source links.
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


const GEMINI_SEARCH_MODEL = process.env.GEMINI_SEARCH_MODEL || "gemini-2.5-flash";
const GEMINI_TIMEOUT_MS = 20000;

/** Turns a Gemini reply that used Google Search into { summary, sources }, or null. */
function readGrounded(j) {
  const c = j?.candidates?.[0];
  const summary = (c?.content?.parts || []).map((p) => p.text || "").join("").trim().slice(0, 600);
  const sources = (c?.groundingMetadata?.groundingChunks || [])
    .map((g) => ({ title: String(g.web?.title || "").slice(0, 120), url: String(g.web?.uri || "") }))
    .filter((s) => /^https:\/\//.test(s.url))
    .slice(0, 5);
  return summary && sources.length ? { summary, sources } : null;
}

/**
 * Google Search through the Gemini API (Google's own Custom Search API is closed to new users
 * and ends 2027-01-01). Returns { summary, sources } or null when GEMINI_API_KEY is missing or the call fails.
 */
async function googleSearch(query, fetchImpl = fetch) {
  const key = process.env.GEMINI_API_KEY;
  const q = shortQuery(query, 12);
  if (!key || q.length < 3) return null;
  try {
    const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_SEARCH_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Search Google for this resale item: ${q}. In 2 or 3 short plain sentences say exactly what it is and what it usually sells for used. Give prices only if your sources show them.` }] }],
        tools: [{ google_search: {} }],
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    if (!r.ok) return null;
    return readGrounded(await r.json());
  } catch {
    return null;
  }
}

module.exports = { ebayListedPrices, googleSearch, readGrounded, summarizeEbayListings, shortQuery };
