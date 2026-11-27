// Strict filter for sold prices: a sale only counts when it is the same item as the one searched.

const MIN_SALES = 3;
// Words that describe an item without identifying it.
const FILLER = new Set(
  ("a an and the of for with in on by new sealed mib misb nib mint box boxed toy toys action figure figures " +
    "hasbro takara tomy collectible official authentic genuine brand").split(" ")
);
// Different kinds of product that share names. A sale of one kind never prices another.
const KINDS = [
  /\b(cards?|tcg|ccg|upper deck|topps|panini|psa|bgs)\b/,
  /\bcomics?\b/,
  /\b(poster|print)\b/,
  /\b(shirt|tshirt|hoodie)\b/,
  /\b(sticker|decal)\b/,
  /\bplush\b/,
  /\bfunko\b/,
  /\blego\b/,
  /\bbook\b/,
  /\b(dvd|blu ray|video game)\b/,
  /\b(keychain|mask|helmet|mug)\b/,
];
const FIGURE = /\b(action figure|figures?)\b/;
// Partial, altered or grouped items.
const NOT_THE_ITEM =
  /\b(lot|bundle|set of|for parts|parts only|box only|empty box|no figure|manual only|custom|repro|reproduction|knockoff|ko|upgrade kit|accessory|accessories|replacement|broken|damaged|incomplete)\b/;

const plain = (text) =>
  String(text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const singular = (word) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);
const words = (text) => plain(text).split(" ").filter(Boolean).map(singular);
const keyWords = (query) =>
  [...new Set(plain(query).split(" ").filter((w) => w && !FILLER.has(w)).map(singular))];

function urlPath(url) {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return "";
  }
}

/** True when this sale is a sold copy of the searched item. */
function sameItem(query, sale) {
  const keys = keyWords(query);
  if (keys.length < 2 || String(sale?.status || "").toLowerCase() !== "sold") return false;
  const have = new Set(words(sale.title));
  if (!keys.every((k) => have.has(k))) return false;
  const wanted = plain(query);
  const found = `${plain(sale.title)} ${plain(urlPath(sale.url))}`;
  if (KINDS.some((kind) => kind.test(found) && !kind.test(wanted))) return false;
  if (KINDS.some((kind) => kind.test(wanted)) && FIGURE.test(found) && !FIGURE.test(wanted)) return false;
  return !(NOT_THE_ITEM.test(plain(sale.title)) && !NOT_THE_ITEM.test(wanted));
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Builds a sold range from a /v1/price reply using only matching sales. The reply's own totals are ignored.
 * @param {string} query
 * @param {{ samples?: object[], currency?: string } | null} reply
 * @returns {{ low: number, median: number, high: number, count: number, sourceUrls: string[] } | null}
 */
function matchSold(query, reply) {
  // A one- or two-word search ("hasbro") would match any product of that brand.
  if (String(query || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1).length < 3) return null;
  if (!Array.isArray(reply?.samples) || (reply.currency && reply.currency !== "USD")) return null;
  const unique = new Map();
  for (const sale of reply.samples) {
    const price = Number(sale?.price);
    if (Number.isFinite(price) && price > 0 && sameItem(query, sale)) {
      unique.set(`${sale.url}|${plain(sale.title)}|${price}`, { price: round2(price), url: String(sale.url || "") });
    }
  }
  const sales = [...unique.values()].sort((a, b) => a.price - b.price);
  if (sales.length < MIN_SALES) return null;
  const mid = Math.floor(sales.length / 2);
  const median = sales.length % 2 ? sales[mid].price : round2((sales[mid - 1].price + sales[mid].price) / 2);
  return {
    low: sales[0].price,
    median,
    high: sales[sales.length - 1].price,
    count: sales.length,
    sourceUrls: sales.map((s) => s.url).filter((u) => /^https:\/\//.test(u)).slice(0, 5),
  };
}

module.exports = { matchSold, sameItem, MIN_SALES };
