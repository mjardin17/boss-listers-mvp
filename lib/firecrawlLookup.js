// Web lookup used when the photo AI is not sure what an item is.
// Needs FIRECRAWL_API_KEY in the environment; without it, lookups are skipped.

const SEARCH_URL = "https://api.firecrawl.dev/v2/search";
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
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key || !query) return [];
  try {
    const r = await fetch(SEARCH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
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

module.exports = { needsLookup, searchItem };
