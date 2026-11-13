// lib/metaFeed.js
// Builds the product list (a CSV "data feed") that Meta Commerce Manager reads to fill a
// Facebook Shop and an Instagram Shop. One catalog feeds both. Pure function, no network.
//
// Rules taken from Meta's product data spec (checked 2026-11-13):
//   - link must be the item's own page on a website the business owns. A link to ebay.com
//     is refused by Meta, so this module refuses it too.
//   - availability, condition and price have fixed spellings.
// An item Meta would reject is left out and reported with the reason. Nothing is guessed:
// an unknown condition is never turned into "new" or "used".

const META_COLUMNS = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand"];
const TITLE_MAX = 150;
const DESCRIPTION_MAX = 5000;
const NEW_WORDS = /^new\b/;
const USED_WORDS = /^(used|like new|pre-?owned|for parts)/;
const REFURBISHED_WORDS = /refurbished/;

function metaCondition(raw) {
  const c = String(raw || "").trim().toLowerCase();
  if (REFURBISHED_WORDS.test(c)) return "refurbished";
  if (NEW_WORDS.test(c)) return "new";
  if (USED_WORDS.test(c)) return "used";
  return null;
}

/** One CSV cell: no line breaks, quoted when needed, and never read as a spreadsheet formula. */
function cell(value) {
  let text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function ownPageUrl(url) {
  let parsed;
  try { parsed = new URL(String(url)); } catch { throw new Error(`product link is not a web address: ${url}`); }
  if (parsed.protocol !== "https:") throw new Error("product links must be https");
  if (/(^|\.)ebay\.[a-z.]+$/i.test(parsed.hostname)) throw new Error("product links must be pages on your own website, not eBay");
  return parsed.toString();
}

/**
 * @param {{ sku: string, slug?: string, title: string, description?: string|null, price: number|string,
 *           image_url: string, condition: string, available: number }[]} products  rows of storefront_products
 * @param {{ productUrl: (p: object) => string, brand: string, currency?: string }} options
 * @returns {{ csv: string, included: number, skipped: { sku: string, why: string }[] }}
 */
function buildMetaFeed(products, { productUrl, brand, currency = "USD" }) {
  const lines = [META_COLUMNS.join(",")];
  const skipped = [];
  for (const p of products) {
    const title = String(p.title || "").replace(/\s+/g, " ").trim();
    const price = Number(p.price);
    const condition = metaCondition(p.condition);
    let why = null;
    if (!String(p.image_url || "").trim()) why = "no photo";
    else if (!(price > 0)) why = "no price";
    else if (!condition) why = `condition "${p.condition}" is not new, used or refurbished`;
    else if (!title) why = "no name";
    if (why) { skipped.push({ sku: p.sku, why }); continue; }

    const description = String(p.description || "").trim() || title;
    lines.push([
      p.sku,
      title.slice(0, TITLE_MAX),
      description.slice(0, DESCRIPTION_MAX),
      Number(p.available) > 0 ? "in stock" : "out of stock",
      condition,
      `${price.toFixed(2)} ${currency}`,
      ownPageUrl(productUrl(p)),
      p.image_url,
      brand,
    ].map(cell).join(","));
  }
  return { csv: lines.join("\n") + "\n", included: lines.length - 1, skipped };
}

module.exports = { buildMetaFeed, metaCondition, META_COLUMNS };
