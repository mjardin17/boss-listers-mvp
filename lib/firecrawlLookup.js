// Web lookup used when the photo AI is not sure what an item is.
// Uses our own ClearCrawl service from the ClipCraft app (Firecrawl v1 compatible, runs on this PC), no paid credits.
// SCRAPER_URL overrides the address; SCRAPER_API_KEY is sent only if set. If it is not running, lookups are skipped.

const SCRAPER_URL = (process.env.SCRAPER_URL || "http://127.0.0.1:3002").replace(/\/+$/, "");
const MAX_RESULTS = 5;
const TIMEOUT_MS = 15000;

/** True when the AI's guess should be checked on the web. */
function needsLookup(product) {
  if (!product || typeof product !== "object") return false;
  const query = String(product.identified_as || product.title || "").trim();
  return query.length > 2 && String(product.confidence || "").toLowerCase() !== "high";
}

/**
 * Searches the web for the item and returns short text snippets, or [] when off or failing.
 * @param {string} query
 * @returns {Promise<{ title: string, url: string, text: string }[]>}
 */
async function searchItem(query) {
  if (!query) return [];
  const key = process.env.SCRAPER_API_KEY;
  try {
    const r = await fetch(`${SCRAPER_URL}/v1/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ query: String(query).slice(0, 200), limit: MAX_RESULTS }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return [];
    const j = await r.json();
    const web = Array.isArray(j?.data?.web) ? j.data.web : Array.isArray(j?.data) ? j.data : [];
    return web.slice(0, MAX_RESULTS).map((w) => ({
      title: String(w.title || "").slice(0, 200),
      url: String(w.url || ""),
      text: String(w.description || w.markdown || "").slice(0, 600),
    }));
  } catch {
    return [];
  }
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Real sold prices for similar items from ClearCrawl /v1/price, or null when off, failing or none found.
 * Similar items can include other versions, so the median is the safer guide than the average.
 * @param {string} query
 * @returns {Promise<{ low: number, median: number, high: number, count: number, sourceUrls: string[] } | null>}
 */
async function soldPrices(query) {
  if (!query) return null;
  const key = process.env.SCRAPER_API_KEY;
  try {
    const r = await fetch(`${SCRAPER_URL}/v1/price`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ query: String(query).slice(0, 200) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return null;
    return pickSold(await r.json());
  } catch {
    return null;
  }
}

/** Keeps only sane numbers from a /v1/price reply. */
function pickSold(j) {
  const nums = ["low", "median", "high"].map((k) => Number(j?.[k]));
  const count = Number(j?.count) || 0;
  if (!count || nums.some((n) => !Number.isFinite(n) || n <= 0)) return null;
  const [low, median, high] = nums.map(round2);
  const sourceUrls = Array.isArray(j.sourceUrls) ? j.sourceUrls.filter((u) => /^https:\/\//.test(u)).slice(0, 5) : [];
  return { low, median, high, count, sourceUrls };
}

module.exports = { needsLookup, searchItem, soldPrices, pickSold };
