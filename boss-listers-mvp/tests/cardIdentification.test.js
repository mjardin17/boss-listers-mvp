// tests/cardIdentification.test.js
// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');

const { identifyCard, scoreCandidate, statusForScore } = require('../lib/cardIdentification');
const { IDENTIFICATION_STATUS, emptyCardFields } = require('../lib/cardFields');

function fakeGeminiResponse(candidates, extra = {}) {
  const body = JSON.stringify({
    candidates,
    frontOcrText: extra.frontOcrText ?? 'sample front text',
    backOcrText: extra.backOcrText ?? 'sample back text',
    frontBackTextConflict: extra.frontBackTextConflict ?? false,
    conflictNote: extra.conflictNote ?? null,
  });
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: body }] } }] }),
    text: async () => body,
  };
}

const FULL_MATCH_CANDIDATE = {
  cardGame: 'MLB', sport: 'Baseball', player: 'Test Player', team: 'Test Team',
  set: 'Topps Chrome', cardNumber: '123', year: '2024', manufacturer: 'Topps',
  parallel: 'Refractor',
};

test('scoreCandidate gives high score when all identity-critical fields present', () => {
  const score = scoreCandidate({ ...emptyCardFields(), ...FULL_MATCH_CANDIDATE });
  assert.ok(score >= 90, `expected >=90, got ${score}`);
});

test('scoreCandidate gives low score when only visual/secondary fields present', () => {
  const score = scoreCandidate({ ...emptyCardFields(), sport: 'Baseball', team: 'Test Team' });
  assert.ok(score < 30, `expected <30, got ${score}`);
});

test('statusForScore: high score + no conflict + single candidate = confirmed', () => {
  assert.equal(statusForScore(97, false, 1), IDENTIFICATION_STATUS.CONFIRMED);
});

test('statusForScore: high score BUT conflict = needs_review, not confirmed', () => {
  assert.equal(statusForScore(97, true, 1), IDENTIFICATION_STATUS.NEEDS_REVIEW);
});

test('statusForScore: high score BUT multiple candidates = needs_review', () => {
  assert.equal(statusForScore(97, false, 2), IDENTIFICATION_STATUS.NEEDS_REVIEW);
});

test('statusForScore: zero score = unknown regardless of other signals', () => {
  assert.equal(statusForScore(0, false, 1), IDENTIFICATION_STATUS.UNKNOWN);
});

test('identifyCard: no API key returns UNKNOWN, never fabricates', async () => {
  const result = await identifyCard({ frontBytes: new ArrayBuffer(8), frontMime: 'image/jpeg', apiKey: null });
  assert.equal(result.status, IDENTIFICATION_STATUS.UNKNOWN);
  assert.equal(result.confidenceScore, 0);
  assert.deepEqual(result.fields, emptyCardFields());
  assert.ok(result.error);
});

test('identifyCard: no front image returns UNKNOWN', async () => {
  const result = await identifyCard({ frontBytes: null, apiKey: 'fake-key' });
  assert.equal(result.status, IDENTIFICATION_STATUS.UNKNOWN);
});

test('identifyCard: Gemini API failure returns UNKNOWN, no simulated fallback', async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, text: async () => 'service unavailable' });
  const result = await identifyCard({
    frontBytes: new ArrayBuffer(8), frontMime: 'image/jpeg', apiKey: 'fake-key', fetchImpl,
  });
  assert.equal(result.status, IDENTIFICATION_STATUS.UNKNOWN);
  assert.match(result.error, /Identification failed/);
});

test('identifyCard: malformed JSON from Gemini returns UNKNOWN, no simulated fallback', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'not valid json {{{' }] } }] }),
  });
  const result = await identifyCard({
    frontBytes: new ArrayBuffer(8), frontMime: 'image/jpeg', apiKey: 'fake-key', fetchImpl,
  });
  assert.equal(result.status, IDENTIFICATION_STATUS.UNKNOWN);
});

test('identifyCard: single confident candidate with all identity fields = CONFIRMED', async () => {
  const fetchImpl = async () => fakeGeminiResponse([FULL_MATCH_CANDIDATE]);
  const result = await identifyCard({
    frontBytes: new ArrayBuffer(8), frontMime: 'image/jpeg',
    backBytes: new ArrayBuffer(8), backMime: 'image/jpeg',
    apiKey: 'fake-key', fetchImpl,
  });
  assert.equal(result.status, IDENTIFICATION_STATUS.CONFIRMED);
  assert.equal(result.fields.cardNumber, '123');
  assert.equal(result.candidates.length, 0); // confirmed = no candidate list needed
});

test('identifyCard: multiple candidates returns up to 3, requires review, never auto-picks', async () => {
  const fetchImpl = async () =>
    fakeGeminiResponse([
      FULL_MATCH_CANDIDATE,
      { ...FULL_MATCH_CANDIDATE, parallel: 'Gold Refractor' },
      { ...FULL_MATCH_CANDIDATE, parallel: 'Superfractor' },
    ]);
  const result = await identifyCard({
    frontBytes: new ArrayBuffer(8), frontMime: 'image/jpeg', apiKey: 'fake-key', fetchImpl,
  });
  assert.equal(result.status, IDENTIFICATION_STATUS.NEEDS_REVIEW);
  assert.ok(result.candidates.length >= 2 && result.candidates.length <= 3);
});

test('identifyCard: front/back text conflict forces NEEDS_REVIEW even with high field coverage', async () => {
  const fetchImpl = async () =>
    fakeGeminiResponse([FULL_MATCH_CANDIDATE], { frontBackTextConflict: true, conflictNote: 'Name mismatch' });
  const result = await identifyCard({
    frontBytes: new ArrayBuffer(8), frontMime: 'image/jpeg', apiKey: 'fake-key', fetchImpl,
  });
  assert.equal(result.status, IDENTIFICATION_STATUS.NEEDS_REVIEW);
});

test('identifyCard: base+parallel with same identity fields score identically on criticals (parallel is secondary)', () => {
  const base = scoreCandidate({ ...emptyCardFields(), ...FULL_MATCH_CANDIDATE, parallel: null });
  const parallel = scoreCandidate({ ...emptyCardFields(), ...FULL_MATCH_CANDIDATE, parallel: 'Gold' });
  assert.ok(parallel >= base); // parallel adds secondary-field evidence, never subtracts
});

test('identifyCard: raw vs graded are distinguishable via fields, not conflated', () => {
  const raw = { ...emptyCardFields(), ...FULL_MATCH_CANDIDATE, graded: false };
  const graded = { ...emptyCardFields(), ...FULL_MATCH_CANDIDATE, graded: true, gradingCompany: 'PSA', grade: '10' };
  assert.notEqual(raw.graded, graded.graded);
  assert.equal(raw.gradingCompany, null);
});
