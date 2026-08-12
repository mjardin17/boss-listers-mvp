// lib/cardPricing.js
// Server-side PriceCharting valuation adapter for trading cards.
//
// [Guessing] The exact PriceCharting API request/response shape below
// (endpoint path, query params, price field names) is based on their
// documented general-purpose product API pattern, NOT verified against a
// live response — this repo has never had a PRICECHARTING_API_TOKEN to
// test against. Before trusting this in production: get a real token,
// call it once for a known card, and confirm the field names in
// parsePriceChartingResponse() actually match. Do not remove this comment
// until that's done.
//
// SAFETY CONTRACT (do not weaken this):
//   - No PRICECHARTING_API_TOKEN, an API failure, a malformed response, or
//     no confident match → returns VALUATION_STATUS.INSUFFICIENT with
//     low/market/high all null and confidenceScore 0. Never a guessed
//     number, never a fallback to a "typical" price.
//   - A result is only ever labeled "provider market estimate." It is
//     never labeled "verified sold value" unless the provider response
//     explicitly marks the underlying data as completed-sale transactions
//     (which, per PriceCharting's own model, their headline prices
//     generally are NOT — they track market/asking prices, not a verified
//     completed-sale ledger). Treat everything from this adapter as
//     PROVIDER_ESTIMATE unless that changes.
//   - Matching is exact-or-nothing: set, card number, parallel, grading
//     company + grade (or raw-vs-raw) must all agree. A close-but-not-
//     exact match is not returned as a value — it's reported as
//     insufficient evidence, same as no match at all.

const { VALUATION_STATUS } = require('./cardFields');

const API_BASE = 'https://www.pricecharting.com/api';

function insufficientResult(reason) {
  return {
    status: VALUATION_STATUS.INSUFFICIENT,
    low: null,
    market: null,
    high: null,
    confidenceScore: 0,
    provider: 'pricecharting',
    matchedProduct: null,
    fetchedAt: new Date().toISOString(),
    explanation: reason,
  };
}

function buildSearchQuery(fields) {
  // Card number and set are the strongest signal — include them explicitly
  // rather than relying on a loose free-text search matching everything.
  const parts = [fields.year, fields.manufacturer, fields.set, fields.player, fields.cardNumber].filter(Boolean);
  return parts.join(' ');
}

// Returns true only if `product` is an exact match for the identified card
// on every dimension that changes its value. This is deliberately strict —
// see the module-level safety contract.
function isExactMatch(fields, product) {
  if (!product) return false;

  const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());

  if (fields.cardNumber && norm(product.cardNumber) !== norm(fields.cardNumber)) return false;
  if (fields.set && norm(product.set) !== norm(fields.set)) return false;
  if (fields.parallel && norm(product.parallel) !== norm(fields.parallel)) return false;
  if (fields.year && norm(product.year) !== norm(fields.year)) return false;

  const wantsGraded = Boolean(fields.graded);
  const productGraded = Boolean(product.graded);
  if (wantsGraded !== productGraded) return false; // never compare raw to graded
  if (wantsGraded) {
    if (norm(product.gradingCompany) !== norm(fields.gradingCompany)) return false;
    if (norm(product.grade) !== norm(fields.grade)) return false;
  }

  if (Boolean(fields.autograph) !== Boolean(product.autograph)) return false;
  if (Boolean(fields.memorabilia) !== Boolean(product.memorabilia)) return false;
  if (fields.language && norm(product.language) !== norm(fields.language)) return false;
  if (fields.edition && norm(product.edition) !== norm(fields.edition)) return false;

  // Explicitly reject anything that isn't a single confirmed card.
  if (product.isLot || product.isReprint || product.isDigital) return false;

  return true;
}

// [Guessing] Maps a raw PriceCharting API product record into our internal
// shape. Field names here need verification against a real response.
function parsePriceChartingProduct(raw) {
  return {
    id: raw.id,
    name: raw['product-name'] || raw.productName || null,
    set: raw['console-name'] || raw.set || null,
    cardNumber: raw['card-number'] || raw.cardNumber || null,
    parallel: raw.parallel || null,
    year: raw.year || null,
    graded: Boolean(raw.graded),
    gradingCompany: raw['grading-company'] || null,
    grade: raw.grade || null,
    autograph: Boolean(raw.autograph),
    memorabilia: Boolean(raw.memorabilia || raw.relic),
    language: raw.language || null,
    edition: raw.edition || null,
    isLot: Boolean(raw.isLot),
    isReprint: Boolean(raw.isReprint),
    isDigital: Boolean(raw.isDigital),
    // PriceCharting prices are typically in cents.
    priceLowCents: raw['loose-price'] ?? null,
    priceMarketCents: raw['cib-price'] ?? raw['new-price'] ?? null,
    priceHighCents: raw['graded-price'] ?? raw['manual-only-price'] ?? null,
  };
}

/**
 * Looks up a valuation for an identified card. Only called when
 * identification status is CONFIRMED or LIKELY — callers must not call
 * this for NEEDS_REVIEW/UNKNOWN identifications (there's no confirmed
 * card to price).
 */
async function getCardValuation({ fields, apiToken, fetchImpl = fetch }) {
  if (!apiToken) {
    return insufficientResult(
      'PRICECHARTING_API_TOKEN not configured — no pricing provider connected. Confirm the card identity or connect an approved pricing-data provider.'
    );
  }

  if (!fields.cardNumber && !fields.set) {
    return insufficientResult('Not enough confirmed card identity (missing set and card number) to search for a price match.');
  }

  const query = buildSearchQuery(fields);
  if (!query.trim()) {
    return insufficientResult('No searchable identity fields available for this card.');
  }

  let res;
  try {
    res = await fetchImpl(`${API_BASE}/products?t=${encodeURIComponent(apiToken)}&q=${encodeURIComponent(query)}`);
  } catch (err) {
    return insufficientResult(`Pricing provider request failed: ${err.message}`);
  }

  if (!res.ok) {
    return insufficientResult(`Pricing provider returned an error (HTTP ${res.status}). No fallback value substituted.`);
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    return insufficientResult('Pricing provider returned a response that could not be parsed. No fallback value substituted.');
  }

  const rawProducts = Array.isArray(data.products) ? data.products : Array.isArray(data) ? data : [];
  const candidates = rawProducts.map(parsePriceChartingProduct);
  const exact = candidates.filter((p) => isExactMatch(fields, p));

  if (!exact.length) {
    return insufficientResult(
      `BossLister could not establish a reliable value for this exact card. Found ${candidates.length} similar listing(s) but none matched exactly on set, card number, parallel, and grade.`
    );
  }

  const match = exact[0];
  const toDollars = (cents) => (typeof cents === 'number' ? Math.round(cents) / 100 : null);
  const low = toDollars(match.priceLowCents);
  const market = toDollars(match.priceMarketCents);
  const high = toDollars(match.priceHighCents);

  if (market == null) {
    return insufficientResult('Matched the exact card, but the pricing provider has no current price data for it.');
  }

  return {
    status: VALUATION_STATUS.PROVIDER_ESTIMATE, // PriceCharting tracks market pricing, not a verified-sale ledger
    low,
    market,
    high,
    confidenceScore: exact.length === 1 ? 90 : 70, // lower if multiple exact matches disagree on price
    provider: 'pricecharting',
    matchedProduct: { id: match.id, name: match.name },
    fetchedAt: new Date().toISOString(),
    explanation: 'Provider market estimate from PriceCharting — not a verified completed-sale value.',
  };
}

module.exports = { getCardValuation, isExactMatch, parsePriceChartingProduct, buildSearchQuery };
