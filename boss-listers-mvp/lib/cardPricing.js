// lib/cardPricing.js
// Server-side PriceCharting valuation adapter for trading cards.
//
// API shape verified against the live docs at
// https://www.pricecharting.com/api-documentation (2026-08-12) — this is
// NOT a guess. Key facts that shape this file:
//   - API access requires their "Legendary" subscription tier ($49/mo).
//   - PriceCharting has NO structured card-number/set/parallel/grading
//     fields. A product is identified only by free-text `product-name`
//     and `console-name` (e.g. console-name might be "Pokemon Cards",
//     product-name carries the player/set/number as one string) — same
//     model as their video-game catalog. This means "exact match" can
//     only be done via token matching against those two text fields, not
//     structured field comparison. That's a real precision limit, which
//     is exactly why the insufficient-evidence fallback below matters:
//     a fuzzy text match is treated as NOT a match unless every identity
//     token we have is actually present in the returned text.
//   - Grade/condition is NOT a separate field either — it's encoded by
//     WHICH price field you read. Cards use the same price-tier field
//     names as PriceCharting's game catalog, but with card-specific
//     meanings (see GRADE_TO_PRICE_FIELD below, taken directly from
//     their "Description of Keys" table).
//   - Prices are integer cents ("1732" = $17.32).
//   - `/api/product` returns their single best-guess match only;
//     `/api/products` returns up to 20 candidates for us to filter
//     ourselves — we always use the latter so we can apply our own
//     strict matching instead of trusting their "best match" pick.
//
// SAFETY CONTRACT (do not weaken this):
//   - No PRICECHARTING_API_TOKEN, an API failure, a malformed response, or
//     no confident text match → returns VALUATION_STATUS.INSUFFICIENT with
//     low/market/high all null and confidenceScore 0. Never a guessed
//     number, never a fallback to a "typical" price.
//   - Always labeled "provider market estimate," never "verified sold
//     value" — PriceCharting's headline prices track market/asking data,
//     not a verified completed-sale ledger.
//   - Raw cards are never compared against graded prices, and one grading
//     company/grade is never substituted for another.

const { VALUATION_STATUS } = require('./cardFields');

const API_BASE = 'https://www.pricecharting.com/api';

// Card-specific meaning of each PriceCharting price-tier field, per their
// published "Description of Keys" table. Ordered roughly loose -> highest.
const GRADE_TO_PRICE_FIELD = [
  { test: (f) => !f.graded, field: 'loose-price', label: 'Ungraded' },
  { test: (f) => matchesGrade(f, null, ['7', '7.5']), field: 'cib-price', label: 'Grade 7-7.5' },
  { test: (f) => matchesGrade(f, null, ['8', '8.5']), field: 'new-price', label: 'Grade 8-8.5' },
  { test: (f) => matchesGrade(f, null, ['9']), field: 'graded-price', label: 'Grade 9' },
  { test: (f) => matchesGrade(f, null, ['9.5']), field: 'box-only-price', label: 'Grade 9.5' },
  { test: (f) => matchesGrade(f, 'PSA', ['10']), field: 'manual-only-price', label: 'PSA 10' },
  { test: (f) => matchesGrade(f, 'BGS', ['10']), field: 'bgs-10-price', label: 'BGS 10' },
  { test: (f) => matchesGrade(f, 'CGC', ['10']), field: 'condition-17-price', label: 'CGC 10' },
  { test: (f) => matchesGrade(f, 'SGC', ['10']), field: 'condition-18-price', label: 'SGC 10' },
];

function matchesGrade(fields, company, grades) {
  if (!fields.graded) return false;
  if (company && String(fields.gradingCompany || '').toUpperCase() !== company) return false;
  const g = String(fields.grade || '').trim();
  return grades.includes(g);
}

// Picks which PriceCharting price field corresponds to this card's actual
// condition/grade. Returns null if the grade doesn't map to any of
// PriceCharting's supported card price tiers (e.g. an unsupported grading
// company or a grade like "6" that isn't in their card tier list) — that's
// treated as insufficient evidence, not approximated to a nearby tier.
function priceFieldForGrade(fields) {
  const match = GRADE_TO_PRICE_FIELD.find((rule) => rule.test(fields));
  return match || null;
}

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
  const parts = [fields.year, fields.set, fields.player, fields.cardNumber ? `#${fields.cardNumber}` : null].filter(Boolean);
  return parts.join(' ');
}

function normalizeText(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// A product is only a match if every identity token we actually have
// (card number, set name, player name) appears in its product-name or
// console-name text. This is strict on purpose: PriceCharting has no
// structured fields to compare, so token presence is the only signal
// available, and a partial/fuzzy match is not good enough to price
// against — see module-level safety contract.
function textMatchesIdentity(fields, product) {
  const haystack = normalizeText(`${product['product-name'] || ''} ${product['console-name'] || ''}`);
  if (!haystack) return false;

  const required = [];
  if (fields.cardNumber) required.push(normalizeText(fields.cardNumber));
  if (fields.set) required.push(...normalizeText(fields.set).split(' ').filter((w) => w.length > 2));
  if (fields.player) required.push(...normalizeText(fields.player).split(' ').filter((w) => w.length > 2));

  if (!required.length) return false;
  return required.every((token) => haystack.includes(token));
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

  if (!fields.cardNumber && !fields.set && !fields.player) {
    return insufficientResult('Not enough confirmed card identity to search for a price match.');
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

  if (data.status === 'error') {
    return insufficientResult(`Pricing provider error: ${data['error-message'] || 'unknown error'}. No fallback value substituted.`);
  }

  const rawProducts = Array.isArray(data.products) ? data.products : [];
  const matches = rawProducts.filter((p) => textMatchesIdentity(fields, p));

  if (!matches.length) {
    return insufficientResult(
      `BossLister could not establish a reliable value for this exact card. Searched ${rawProducts.length} similar listing(s) but none matched this card's set, number, and player as text.`
    );
  }

  const gradeRule = priceFieldForGrade(fields);
  if (!gradeRule) {
    return insufficientResult(
      `Matched the card by name, but its grade (${fields.graded ? `${fields.gradingCompany || '?'} ${fields.grade || '?'}` : 'raw'}) doesn't map to a PriceCharting card price tier.`
    );
  }

  // If multiple text matches disagree on price, that's itself evidence of
  // ambiguity — surface it as lower confidence rather than silently
  // picking the first one.
  const priced = matches
    .map((p) => ({ product: p, cents: p[gradeRule.field] }))
    .filter((m) => typeof m.cents === 'number');

  if (!priced.length) {
    return insufficientResult(`Matched the exact card, but the provider has no ${gradeRule.label} price data for it.`);
  }

  const cents = priced[0].cents;
  const market = Math.round(cents) / 100;

  return {
    status: VALUATION_STATUS.PROVIDER_ESTIMATE, // PriceCharting tracks market pricing, not a verified-sale ledger
    low: null,
    market,
    high: null,
    confidenceScore: priced.length === 1 ? 80 : 55, // lower confidence when multiple text matches found
    provider: 'pricecharting',
    matchedProduct: { id: priced[0].product.id, name: priced[0].product['product-name'], priceTier: gradeRule.label },
    fetchedAt: new Date().toISOString(),
    explanation: `Provider market estimate from PriceCharting (${gradeRule.label} tier) — not a verified completed-sale value.`,
  };
}

module.exports = { getCardValuation, textMatchesIdentity, priceFieldForGrade, buildSearchQuery, GRADE_TO_PRICE_FIELD };
