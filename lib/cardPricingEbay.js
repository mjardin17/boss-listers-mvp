// lib/cardPricingEbay.js
// Server-side eBay valuation adapter for trading cards — a FREE provider that
// lives alongside lib/cardPricing.js (PriceCharting, $49/mo). cardPricing.js
// is not modified or removed.
//
// WHAT THIS ADAPTER DOES — and what it CANNOT do
// ---------------------------------------------------------------------------
// This adapter prices a card from eBay ACTIVE-listing asking prices only. It
// does NOT and CANNOT return real completed-sale prices. That limitation is
// the reason the status below is PROVIDER_ESTIMATE, never VERIFIED_SALES.
// Before writing any code I checked the free-vs-gated landscape against
// eBay's own developer docs (not an assumption):
//
//   1. eBay Finding API `findCompletedItems` (the old sold-price call) is
//      DEAD. Deprecated 2020-10-15; the entire Finding API was decommissioned
//      on 2025-02-04 — see the "Finding API | All" row on eBay's official
//      "API Deprecation Status" page:
//      https://developer.ebay.com/develop/get-started/api-deprecation-status
//
//   2. eBay Marketplace Insights API returns sold-item price data but is
//      gated. eBay's Buy "Support by Marketplace" page states: "The
//      Marketplace Insights API is restricted and not open to new users at
//      this time", and access requires business-level approval. Not available
//      on a standard/free developer account — same tier as the Sell APIs.
//
//   3. eBay Browse API is the free, working path (requires only a free
//      Application client-credentials token), BUT it returns ACTIVE listings
//      only. Per the eBay community thread "findCompletedItems does not work":
//      the API "does not permit access to information about sold listings, as
//      this type of data is restricted."
//
//   Verdict: there is NO free official eBay API that returns real sold prices.
//   The free path that does exist is the Browse API's active-listing asking
//   prices. This adapter implements that and labels it honestly: "provider
//   market estimate from eBay active-listing asking prices — NOT a verified
//   completed-sale value." It is never labeled VERIFIED_SALES.
//
//   We do NOT scrape ebay.com for sold data: that violates eBay's ToS and this
//   project's policy, and every third-party "sold items" API (SoldComps,
//   Apify, RapidAPI, Parse.bot, Anysite, etc.) is itself a scraper built on
//   that same violation.
//
// API SHAPE — verified against real docs, not guessed
// ---------------------------------------------------------------------------
//   Endpoint:  GET /buy/browse/v1/item_summary/search?q=<AND keywords>&limit=N
//   Base:      https://api.ebay.com/buy/browse/v1
//   Headers:   Authorization: Bearer <Application access token>
//              X-EBAY-C-MARKETPLACE-ID: EBAY_US  (default)
//   Auth:      Application access token from the OAuth 2.0 "client
//              credentials" grant flow — free on a standard developer
//              account. Verified: the Browse API overview states "All methods
//              in the Browse API require an Application access token, which
//              is obtained using the client credentials grant flow"
//              (developer.ebay.com/develop/buy/browse_api).
//   `q`:       space-separated keywords are ANDed (verified: "If the keywords
//              are separated by a space, it is treated as an AND"). `limit`
//              1..200 (default 50). `offset`, `sort` also supported.
//   Response:  a SearchPagedCollection with a single `itemSummaries[]` array.
//              Per-item fields (verified against the generated OpenAPI
//              `ItemSummary` model, which mirrors eBay's live spec):
//                itemId, legacyItemId, title (string),
//                price: { value, currency },
//                condition (string), conditionId (string),
//                buyingOptions (string[]: FIXED_PRICE/AUCTION/BEST_OFFER/CLASSIFIED_AD),
//                itemGroupType (only present on item-variation groups),
//                itemWebUrl, adultOnly (bool).
//
//   Fields eBay's item_summary does NOT expose (this is what shapes the
//   safety logic and its limitations):
//     There is NO structured `lotSize`, `graded`, `grade`, `gradingCompany`,
//     `reprint`, `digital`, or `autograph` field on an item_summary. (Those
//     exist on the full `item` model or on gated sold-data APIs, not on the
//     open search result.) Therefore the safety checks that depend on those
//     signals are implemented as TEXT HEURISTICS against the listing `title`,
//     and are labeled heuristics in the code — never claimed as API fields.
//     This is precisely the kind of shape-coupling the PriceCharting adapter
//     documents about its free-text-only identity model.
//
// UNVERIFIED / acknowledged limits (documented honestly):
//   - The exact `price.value` string format (dollars, e.g. "89.99") and the
//     `buyingOptions` enum strings are taken from the generated OpenAPI model
//     and eBay's published field lists; I could not pull eBay's live
//     renderer during this session (it is bot-blocked). The field NAMES are
//     verified against the model docs; the value formats above are
//     high-confidence but could not be re-confirmed live.
//   - Digital-card rejection is a title heuristic. A digital card whose title
//     contains none of the digital/ePack keywords would NOT be rejected by
//     this adapter. It never fabricates a price — it only fails to reject.
//
// SAFETY CONTRACT (identical to cardPricing.js; do not weaken)
//   - No EBAY_APP_TOKEN, an API failure, a malformed response, or no confident
//     match -> VALUATION_STATUS.INSUFFICIENT with low/market/high all null and
//     confidenceScore 0. NEVER a guessed number, never a fallback "typical"
//     price.
//   - Always labeled "provider market estimate (active-listing asking
//     prices)", never "verified sold value".
//   - Raw cards are never priced against graded listings, and one grading
//     company/grade is never substituted for another.

const { VALUATION_STATUS } = require('./cardFields');

const API_BASE = 'https://api.ebay.com/buy/browse/v1';
const DEFAULT_MARKETPLACE = 'EBAY_US';
const SEARCH_LIMIT = 20;

const GRADING_COMPANIES = ['PSA', 'BGS', 'CGC', 'SGC', 'TAG', 'HGA'];

// Matches "<company> <grade>" in a listing title, e.g. "PSA 9", "BGS 9.5".
const GRADE_PATTERN = new RegExp(
  `\\b(${GRADING_COMPANIES.join('|')})\\s*(?:[-:\\s]+)?(\\d{1,2}(?:\\.\\d)?)\\b`,
  'i'
);

// Title heuristic: listing is advertised as a multi-card lot.
const LOT_RE = /\b(lot of \d+|lot\s*\d+|multi[- ]card|(?:cards?)\b.*\b(?:lot|bundle)|\d+\s*(?:cards?|pcs?|pieces?)|bundle|box(?:es)? of \d+|total of \d+)\b/i;

// Title heuristic: listing is a reprint/replica/re-issue.
const REPRINT_RE = /\b(reprint|re-print|reprinted|replica|repack(?:ed)?|re-issue|reissue|re-copy)\b/i;

// Title heuristic: listing is a digital/virtual/ePack card.
const DIGITAL_RE = /\b(digital|virtual|epack|e-pack|digital edition|digital-only)\b/i;

// Title heuristic: listing is an autograph/signed card.
const AUTOGRAPH_RE = /\b(autograph(?:ed)?|auto\b|signed|signature)\b/i;

// Title heuristic: listing appears graded (even without a parseable number).
const GRADED_WORD_RE = /\b(graded|slabbed|gem mint|pristine)\b/i;

function insufficientResult(reason) {
  return {
    status: VALUATION_STATUS.INSUFFICIENT,
    low: null,
    market: null,
    high: null,
    confidenceScore: 0,
    provider: 'ebay',
    matchedListing: null,
    fetchedAt: new Date().toISOString(),
    explanation: reason,
  };
}

function buildSearchQuery(fields) {
  const parts = [fields.year, fields.set, fields.player, fields.cardNumber].filter(Boolean);
  return parts.join(' ');
}

function normalizeText(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseListingGrade(title) {
  const norm = normalizeText(title);
  const m = GRADE_PATTERN.exec(norm);
  if (!m) return null;
  const company = String(m[1]).toUpperCase();
  // Normalize the grade so "10" and "10.0" compare equal.
  const grade = String(Number(m[2]));
  return { company, grade };
}

function gradesEqual(a, b) {
  return String(Number(a)) === String(Number(b));
}

// True if the listing title indicates a graded item at all.
function listingIsGraded(title) {
  return GRADE_PATTERN.test(normalizeText(title)) || GRADED_WORD_RE.test(normalizeText(title));
}

// Decides whether an eBay item_summary listing is a confident match for the
// card we are trying to price. Mirrors the strictness of textMatchesIdentity
// in cardPricing.js: EVERY identity token we actually have (card number,
// set, player, and — when present — parallel) must appear in the listing
// title, and the listing must not be a different grade, a different grading
// company, a multi-card lot, a reprint, or a digital card.
//
// Returns true only on a confident match; anything ambiguous returns false so
// the caller returns INSUFFICIENT rather than pricing against an unreliable
// number.
function listingMatchesIdentity(fields, listing) {
  const title = listing && listing.title;
  if (!title) return false;

  const haystack = normalizeText(title);
  if (!haystack) return false;

  // Item-variation groups and adult-only listings are not single comparable
  // cards.
  if (listing.adultOnly === true) return false;
  if (typeof listing.itemGroupType === 'string' && listing.itemGroupType) return false;

  // Cross-card / reprint / digital — reject outright.
  if (LOT_RE.test(haystack)) return false;
  if (REPRINT_RE.test(haystack)) return false;
  if (DIGITAL_RE.test(haystack)) return false;

  // Grade/condition safety. fields.graded falsy (false or null) means "raw",
  // exactly like cardPricing.js — never match raw against graded.
  const listingGrade = parseListingGrade(haystack);
  const listingGraded = listingIsGraded(haystack);

  if (fields.graded) {
    // We want a graded card: the listing must carry a parseable (company,
    // grade) that matches ours.
    if (!listingGrade) return false; // cannot confirm a grade -> reject
    if (listingGrade.company !== String(fields.gradingCompany || '').toUpperCase()) return false;
    if (!gradesEqual(listingGrade.grade, fields.grade)) return false;
  } else if (listingGraded) {
    // We want a raw card; the listing is graded -> reject.
    return false;
  }

  // Autograph: if the card is autographed, the listing must advertise it.
  if (fields.autograph && !AUTOGRAPH_RE.test(haystack)) return false;

  // Required identity tokens (mirror of textMatchesIdentity).
  const required = [];
  if (fields.cardNumber) required.push(normalizeText(fields.cardNumber));
  if (fields.set) required.push(...normalizeText(fields.set).split(' ').filter((w) => w.length > 2));
  if (fields.player) required.push(...normalizeText(fields.player).split(' ').filter((w) => w.length > 2));
  if (fields.parallel) required.push(...normalizeText(fields.parallel).split(' ').filter((w) => w.length > 2));

  if (!required.length) return false;
  return required.every((token) => haystack.includes(token));
}

// Returns the listing's asking price in dollars, or null if the listing has
// no usable price (auction/classified have no firm asking price; missing/
// malformed price too).
function usablePrice(listing) {
  const value = listing && listing.price && listing.price.value;
  if (typeof value !== 'string') return null;

  const opts = Array.isArray(listing.buyingOptions)
    ? listing.buyingOptions.map((o) => String(o).toUpperCase())
    : [];
  // Only fixed-price / best-offer listings carry an explicit asking price.
  if (opts.includes('AUCTION') || opts.includes('CLASSIFIED_AD')) return null;

  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function medianOf(values) {
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

/**
 * Looks up a valuation for an identified card from eBay active listings. Only
 * called when identification status is CONFIRMED or LIKELY — callers must not
 * call this for NEEDS_REVIEW/UNKNOWN identifications.
 *
 * The returned market price is the median asking price across confident,
 * grade-matched active listings — real eBay data, but asking (active-listing)
 * prices, not completed sales. Hence PROVIDER_ESTIMATE, never VERIFIED_SALES.
 */
async function getCardValuation({
  fields,
  apiToken,
  fetchImpl = fetch,
  marketplaceId = process.env.EBAY_MARKETPLACE_ID || DEFAULT_MARKETPLACE,
}) {
  if (!apiToken) {
    return insufficientResult(
      'EBAY_APP_TOKEN not configured — no free eBay pricing provider connected. Confirm the card identity or connect an approved pricing-data provider.'
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
    res = await fetchImpl(`${API_BASE}/item_summary/search?q=${encodeURIComponent(query)}&limit=${SEARCH_LIMIT}`, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
      },
    });
  } catch (err) {
    return insufficientResult(`eBay request failed: ${err.message}`);
  }

  if (!res.ok) {
    return insufficientResult(`eBay returned an error (HTTP ${res.status}). No fallback value substituted.`);
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    return insufficientResult('eBay returned a response that could not be parsed. No fallback value substituted.');
  }

  const rawListings = Array.isArray(data.itemSummaries) ? data.itemSummaries : [];
  if (!rawListings.length) {
    return insufficientResult('eBay returned no active listings for this card.');
  }

  const matches = rawListings.filter((l) => listingMatchesIdentity(fields, l));
  if (!matches.length) {
    return insufficientResult(
      `BossLister could not find a reliable value for this exact card. Searched ${rawListings.length} similar active listing(s) on eBay but none matched this card's set, number, player, and grade.`
    );
  }

  const priced = matches
    .map((l) => ({ listing: l, dollars: usablePrice(l) }))
    .filter((m) => m.dollars !== null);

  if (!priced.length) {
    return insufficientResult(
      `Matched the exact card, but none of the ${matches.length} matching active listings have a usable asking price (auction/classified only or missing price).`
    );
  }

  const prices = priced.map((m) => m.dollars).sort((a, b) => a - b);
  const low = Math.round(prices[0] * 100) / 100;
  const high = Math.round(prices[prices.length - 1] * 100) / 100;
  const market = Math.round(medianOf(prices) * 100) / 100;

  // Confidence scales with how many independent active listings corroborate.
  const confidenceScore = priced.length >= 5 ? 90 : priced.length >= 3 ? 80 : priced.length === 2 ? 70 : 55;

  return {
    status: VALUATION_STATUS.PROVIDER_ESTIMATE, // eBay active-listing asking prices, NOT a verified-sale ledger
    low,
    market,
    high,
    confidenceScore,
    provider: 'ebay',
    matchedListing: { itemId: matches[0].itemId, title: matches[0].title, corroboratingListings: priced.length },
    fetchedAt: new Date().toISOString(),
    explanation: `Provider market estimate from eBay active-listing asking prices (${priced.length} matching listing(s)) — NOT a verified completed-sale value.`,
  };
}

module.exports = { getCardValuation, listingMatchesIdentity, parseListingGrade, buildSearchQuery, usablePrice };