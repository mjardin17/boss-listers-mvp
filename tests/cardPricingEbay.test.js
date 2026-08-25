// tests/cardPricingEbay.test.js
// Run with: node --test tests/
//
// These fixtures use REALISTIC eBay item_summary shapes: the matching logic
// reads the free-text listing `title` (there is no structured lotSize/grade/
// graded/reprint/digital field on an item_summary — see the adapter's header
// for the verified field list). Every reject/accept fixture therefore supplies
// a realistic title string so the tests actually exercise the matching logic.
//
// This deliberately avoids the bug fixed in commit aed37ce: the old
// cardPricing.test.js fixtures used structured fields (cardNumber/set/grade)
// that textMatchesIdentity never reads (it reads product-name/console-name),
// so the accept path never actually exercised the real logic. Here the
// fixtures mirror the live data shape.
const test = require('node:test');
const assert = require('node:assert/strict');

const { getCardValuation, listingMatchesIdentity } = require('../lib/cardPricingEbay');
const { VALUATION_STATUS, emptyCardFields } = require('../lib/cardFields');

const IDENTIFIED_CARD = {
  ...emptyCardFields(),
  set: 'Topps Chrome', player: 'Yamamoto', cardNumber: '205', year: '2024',
  parallel: null, graded: true, gradingCompany: 'PSA', grade: '10',
};

function listingFixture(overrides = {}) {
  return {
    itemId: 'v1|100123456789|0',
    legacyItemId: '100123456789',
    title: '2024 Topps Chrome #205 Yamamoto PSA 10 Gem Mint Graded',
    price: { value: '89.99', currency: 'USD' },
    buyingOptions: ['FIXED_PRICE', 'BEST_OFFER'],
    condition: 'New',
    conditionId: '1000',
    itemWebUrl: 'https://www.ebay.com/itm/100123456789',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getCardValuation: provider-level safety (mirrors cardPricing.test.js)
// ---------------------------------------------------------------------------

test('getCardValuation: no token returns INSUFFICIENT, all prices null', async () => {
  const result = await getCardValuation({ fields: IDENTIFIED_CARD, apiToken: null });
  assert.equal(result.status, VALUATION_STATUS.INSUFFICIENT);
  assert.equal(result.low, null);
  assert.equal(result.market, null);
  assert.equal(result.high, null);
  assert.equal(result.confidenceScore, 0);
});

test('getCardValuation: missing set AND player AND card number returns INSUFFICIENT without calling the API', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { ok: true, json: async () => ({ itemSummaries: [] }) }; };
  const result = await getCardValuation({
    fields: { ...emptyCardFields() }, apiToken: 'fake-token', fetchImpl,
  });
  assert.equal(result.status, VALUATION_STATUS.INSUFFICIENT);
  assert.equal(called, false);
});

test('getCardValuation: provider network failure returns INSUFFICIENT, no fallback price', async () => {
  const fetchImpl = async () => { throw new Error('network timeout'); };
  const result = await getCardValuation({ fields: IDENTIFIED_CARD, apiToken: 'fake-token', fetchImpl });
  assert.equal(result.status, VALUATION_STATUS.INSUFFICIENT);
  assert.match(result.explanation, /request failed/i);
});

test('getCardValuation: provider HTTP error returns INSUFFICIENT, no fallback price', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500 });
  const result = await getCardValuation({ fields: IDENTIFIED_CARD, apiToken: 'fake-token', fetchImpl });
  assert.equal(result.status, VALUATION_STATUS.INSUFFICIENT);
});

test('getCardValuation: malformed JSON response returns INSUFFICIENT, no fallback price', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => { throw new Error('bad json'); } });
  const result = await getCardValuation({ fields: IDENTIFIED_CARD, apiToken: 'fake-token', fetchImpl });
  assert.equal(result.status, VALUATION_STATUS.INSUFFICIENT);
});

test('getCardValuation: empty itemSummaries returns INSUFFICIENT, never a guessed number', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ itemSummaries: [] }) });
  const result = await getCardValuation({ fields: IDENTIFIED_CARD, apiToken: 'fake-token', fetchImpl });
  assert.equal(result.status, VALUATION_STATUS.INSUFFICIENT);
  assert.equal(result.market, null);
});

test('getCardValuation: no matching listing returns INSUFFICIENT (search returns other cards)', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ itemSummaries: [listingFixture({ title: '2024 Topps Chrome #999 Ohtani PSA 10' })] }),
  });
  const result = await getCardValuation({ fields: IDENTIFIED_CARD, apiToken: 'fake-token', fetchImpl });
  assert.equal(result.status, VALUATION_STATUS.INSUFFICIENT);
  assert.match(result.explanation, /none matched/i);
});

test('getCardValuation: matched listings but all auction-only -> INSUFFICIENT (no firm asking price)', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ itemSummaries: [listingFixture({ buyingOptions: ['AUCTION'] })] }),
  });
  const result = await getCardValuation({ fields: IDENTIFIED_CARD, apiToken: 'fake-token', fetchImpl });
  assert.equal(result.status, VALUATION_STATUS.INSUFFICIENT);
  assert.equal(result.market, null);
});

test('getCardValuation: returns PROVIDER_ESTIMATE (never VERIFIED_SALES) with low/market/high from matching listings', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      itemSummaries: [
        listingFixture({ itemId: 'a', price: { value: '80.00', currency: 'USD' } }),
        listingFixture({ itemId: 'b', price: { value: '90.00', currency: 'USD' } }),
        listingFixture({ itemId: 'c', price: { value: '100.00', currency: 'USD' } }),
      ],
    }),
  });
  const result = await getCardValuation({ fields: IDENTIFIED_CARD, apiToken: 'fake-token', fetchImpl });
  assert.equal(result.status, VALUATION_STATUS.PROVIDER_ESTIMATE);
  assert.equal(result.low, 80);
  assert.equal(result.market, 90);
  assert.equal(result.high, 100);
  assert.equal(result.confidenceScore, 80); // 3 corroborating listings
  assert.equal(result.provider, 'ebay');
  assert.notEqual(result.status, VALUATION_STATUS.VERIFIED_SALES);
  assert.match(result.explanation, /NOT a verified completed-sale/i);
});

// ---------------------------------------------------------------------------
// listingMatchesIdentity: reject cases (mirror cardPricing.test.js)
// ---------------------------------------------------------------------------

test('listingMatchesIdentity: rejects when card number differs', () => {
  const listing = listingFixture({ title: '2025 Topps Chrome PSA 10 Yamamoto #999 Gem Mint' });
  assert.equal(listingMatchesIdentity(IDENTIFIED_CARD, listing), false);
});

test('listingMatchesIdentity: rejects raw card matched against a graded listing', () => {
  const listing = listingFixture({ title: '2025 Topps Chrome #205 Yamamoto PSA 10 Gem Mint' });
  assert.equal(listingMatchesIdentity({ ...IDENTIFIED_CARD, graded: false }, listing), false);
});

test('listingMatchesIdentity: rejects graded card with a different grade', () => {
  const listing = listingFixture({ title: '2025 Topps Chrome #205 Yamamoto PSA 9 Mint' });
  assert.equal(listingMatchesIdentity(IDENTIFIED_CARD, listing), false);
});

test('listingMatchesIdentity: rejects graded card with a different grading company (same numeric grade)', () => {
  const listing = listingFixture({ title: '2025 Topps Chrome #205 Yamamoto BGS 10 Pristine' });
  assert.equal(listingMatchesIdentity(IDENTIFIED_CARD, listing), false);
});

test('listingMatchesIdentity: rejects multi-card lots', () => {
  const listing = listingFixture({ title: '2025 Topps Chrome #205 Yamamoto PSA 10 Lot of 10 Cards' });
  assert.equal(listingMatchesIdentity(IDENTIFIED_CARD, listing), false);
});

test('listingMatchesIdentity: rejects reprints', () => {
  const listing = listingFixture({ title: '2025 Topps Chrome #205 Yamamoto PSA 10 Reprint' });
  assert.equal(listingMatchesIdentity(IDENTIFIED_CARD, listing), false);
});

test('listingMatchesIdentity: rejects digital cards', () => {
  const listing = listingFixture({ title: '2025 Topps Chrome #205 Yamamoto PSA 10 Digital' });
  assert.equal(listingMatchesIdentity(IDENTIFIED_CARD, listing), false);
});

test('listingMatchesIdentity: rejects different parallel', () => {
  const wanted = { ...IDENTIFIED_CARD, parallel: 'Gold Refractor' };
  const listing = listingFixture({ title: '2025 Topps Chrome #205 Yamamoto PSA 10 Superfractor' });
  assert.equal(listingMatchesIdentity(wanted, listing), false);
});

test('listingMatchesIdentity: rejects a raw wanted card when the listing is graded', () => {
  const wanted = { ...IDENTIFIED_CARD, graded: false, gradingCompany: null, grade: null };
  const listing = listingFixture({ title: '2025 Topps Chrome #205 Yamamoto BGS 9.5 Gem Mint' });
  assert.equal(listingMatchesIdentity(wanted, listing), false);
});

// ---------------------------------------------------------------------------
// listingMatchesIdentity: accept case
// ---------------------------------------------------------------------------

test('listingMatchesIdentity: accepts a genuine exact match on all dimensions', () => {
  const wanted = { ...IDENTIFIED_CARD, graded: true, gradingCompany: 'PSA', grade: '10', autograph: true };
  const listing = listingFixture({ title: '2025 Topps Chrome #205 Yamamoto Autograph PSA 10 Gem Mint' });
  assert.equal(listingMatchesIdentity(wanted, listing), true);
});

test('listingMatchesIdentity: accepts a raw (ungraded) exact match', () => {
  const wanted = { ...IDENTIFIED_CARD, graded: false, gradingCompany: null, grade: null };
  const listing = listingFixture({ title: '2025 Topps Chrome #205 Yamamoto Near Mint' });
  assert.equal(listingMatchesIdentity(wanted, listing), true);
});
