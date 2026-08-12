// tests/cardPricing.test.js
// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');

const { getCardValuation, isExactMatch } = require('../lib/cardPricing');
const { VALUATION_STATUS, emptyCardFields } = require('../lib/cardFields');

const IDENTIFIED_CARD = {
  ...emptyCardFields(),
  set: 'Topps Chrome', cardNumber: '123', year: '2024',
  parallel: null, graded: false,
};

function productFixture(overrides = {}) {
  return {
    id: 'p1',
    'product-name': 'Test Card #123',
    'console-name': 'Topps Chrome',
    'card-number': '123',
    year: '2024',
    graded: false,
    'loose-price': 500, // $5.00
    'cib-price': 1000, // $10.00
    'graded-price': 2000, // $20.00
    ...overrides,
  };
}

test('getCardValuation: no token returns INSUFFICIENT, all prices null', async () => {
  const result = await getCardValuation({ fields: IDENTIFIED_CARD, apiToken: null });
  assert.equal(result.status, VALUATION_STATUS.INSUFFICIENT);
  assert.equal(result.low, null);
  assert.equal(result.market, null);
  assert.equal(result.high, null);
  assert.equal(result.confidenceScore, 0);
});

test('getCardValuation: missing set AND card number returns INSUFFICIENT without calling the API', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { ok: true, json: async () => ({ products: [] }) }; };
  const result = await getCardValuation({
    fields: { ...emptyCardFields() }, apiToken: 'fake-token', fetchImpl,
  });
  assert.equal(result.status, VALUATION_STATUS.INSUFFICIENT);
  assert.equal(called, false);
});

test('getCardValuation: provider timeout/network failure returns INSUFFICIENT, no fallback price', async () => {
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

test('getCardValuation: no matching product returns INSUFFICIENT, never a guessed number', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ products: [] }) });
  const result = await getCardValuation({ fields: IDENTIFIED_CARD, apiToken: 'fake-token', fetchImpl });
  assert.equal(result.status, VALUATION_STATUS.INSUFFICIENT);
  assert.equal(result.market, null);
});

test('getCardValuation: exact match returns PROVIDER_ESTIMATE (never VERIFIED_SALES)', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ products: [productFixture()] }) });
  const result = await getCardValuation({ fields: IDENTIFIED_CARD, apiToken: 'fake-token', fetchImpl });
  assert.equal(result.status, VALUATION_STATUS.PROVIDER_ESTIMATE);
  assert.equal(result.market, 10);
  assert.notEqual(result.status, VALUATION_STATUS.VERIFIED_SALES);
});

test('isExactMatch: rejects when card number differs', () => {
  const product = { cardNumber: '999', set: 'Topps Chrome', graded: false };
  assert.equal(isExactMatch(IDENTIFIED_CARD, product), false);
});

test('isExactMatch: rejects raw card matched against a graded product', () => {
  const product = { cardNumber: '123', set: 'Topps Chrome', graded: true, gradingCompany: 'PSA', grade: '10' };
  assert.equal(isExactMatch({ ...IDENTIFIED_CARD, graded: false }, product), false);
});

test('isExactMatch: rejects graded card with different grade', () => {
  const wanted = { ...IDENTIFIED_CARD, graded: true, gradingCompany: 'PSA', grade: '9' };
  const product = { cardNumber: '123', set: 'Topps Chrome', graded: true, gradingCompany: 'PSA', grade: '10' };
  assert.equal(isExactMatch(wanted, product), false);
});

test('isExactMatch: rejects graded card with different grading company (same numeric grade)', () => {
  const wanted = { ...IDENTIFIED_CARD, graded: true, gradingCompany: 'PSA', grade: '10' };
  const product = { cardNumber: '123', set: 'Topps Chrome', graded: true, gradingCompany: 'BGS', grade: '10' };
  assert.equal(isExactMatch(wanted, product), false);
});

test('isExactMatch: rejects multi-card lots', () => {
  const product = { cardNumber: '123', set: 'Topps Chrome', graded: false, isLot: true };
  assert.equal(isExactMatch(IDENTIFIED_CARD, product), false);
});

test('isExactMatch: rejects reprints', () => {
  const product = { cardNumber: '123', set: 'Topps Chrome', graded: false, isReprint: true };
  assert.equal(isExactMatch(IDENTIFIED_CARD, product), false);
});

test('isExactMatch: rejects digital cards', () => {
  const product = { cardNumber: '123', set: 'Topps Chrome', graded: false, isDigital: true };
  assert.equal(isExactMatch(IDENTIFIED_CARD, product), false);
});

test('isExactMatch: rejects different parallel', () => {
  const wanted = { ...IDENTIFIED_CARD, parallel: 'Gold Refractor' };
  const product = { cardNumber: '123', set: 'Topps Chrome', graded: false, parallel: 'Superfractor' };
  assert.equal(isExactMatch(wanted, product), false);
});

test('isExactMatch: accepts a genuine exact match on all dimensions', () => {
  const wanted = { ...IDENTIFIED_CARD, graded: true, gradingCompany: 'PSA', grade: '10', autograph: true };
  const product = {
    cardNumber: '123', set: 'Topps Chrome', year: '2024', graded: true, gradingCompany: 'PSA', grade: '10', autograph: true,
  };
  assert.equal(isExactMatch(wanted, product), true);
});
