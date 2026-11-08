// Local-only boundary. Reuse the canonical card shape/scoring; never invoke vision.
const { z } = require('zod');
const { emptyCardFields, IDENTIFICATION_STATUS } = require('./cardFields');
const { scoreCandidate, statusForScore } = require('./cardIdentification');
const booleanFields = new Set(['foil','holo','refractor','reverseHolo','rookieCard',
  'autograph','memorabilia','patch','graded']);
const fieldSchema = z.object(Object.fromEntries(Object.keys(emptyCardFields()).map(key =>
  [key, (booleanFields.has(key) ? z.boolean() : z.string().trim()).nullable().optional()])));
const identificationSchema = z.object({
  status: z.enum(Object.values(IDENTIFICATION_STATUS)),
  fields: fieldSchema,
  candidates: z.array(fieldSchema).max(3).optional().default([]),
  evidence: z.object({
    frontOcrText: z.string().nullable().optional(),
    backOcrText: z.string().nullable().optional(),
    frontBackTextConflict: z.boolean().optional(),
    conflictNote: z.string().nullable().optional(),
  }).passthrough().nullable().optional(),
});
function normalizeIdentification(input) {
  const parsed = identificationSchema.parse(input);
  const fields = {...emptyCardFields(), ...parsed.fields};
  const confidenceScore = scoreCandidate(fields);
  const computed = statusForScore(confidenceScore, !!parsed.evidence?.frontBackTextConflict,
    Math.max(1, parsed.candidates.length));
  // Completeness may LOWER a claimed status, never promote an uncertain import.
  const ranks = {unknown:0, needs_review:1, likely:2, confirmed:3};
  const status = ranks[computed] < ranks[parsed.status] ? computed : parsed.status;
  return {...parsed, fields, confidenceScore, status};
}
module.exports = { normalizeIdentification };

// Reuse the existing free adapter, but do not enable network by merely finding a key.
// PriceCharting is intentionally not called here: paid usage needs separate approval.
async function estimateEbay({identification, verifiedIdentity = false, allowNetwork = false, env = process.env, fetchImpl = fetch}) {
  const normalized = normalizeIdentification(identification);
  const { getCardValuation } = require('./cardPricingEbay');
  const humanVerified = verifiedIdentity === true && ['player','set','cardNumber','year','manufacturer'].every(k=>normalized.fields[k]);
  const eligible = allowNetwork === true && (normalized.status === 'confirmed' || humanVerified);
  const safeFetch = async (url, options) => {
    const response = await fetchImpl(url, {...options, signal: AbortSignal.timeout(20000)});
    if (!response.ok) return {ok:false, status:response.status};
    const body = await response.json();
    return {ok:true, json:async()=>({...body, itemSummaries:(Array.isArray(body.itemSummaries) ? body.itemSummaries : [])
      .filter(item => item?.price?.currency === 'USD')})};
  };
  const result = await getCardValuation({fields:normalized.fields,
    apiToken: eligible ? env.EBAY_APP_TOKEN : undefined, fetchImpl:safeFetch, marketplaceId:'EBAY_US'});
  const usable = typeof result.market === 'number' && Number.isFinite(result.market) && result.market > 0;
  return {
    status: usable ? 'provider_estimate' : 'insufficient',
    provider:'ebay', market:usable ? result.market : null,
    low:usable ? result.low : null, high:usable ? result.high : null,
    currency:'USD', verification:usable ? 'unverified' : 'unavailable',
    evidenceType:'active-listing-asking-price',
    confidenceScore:usable ? result.confidenceScore : 0,
    fetchedAt:result.fetchedAt, matchedListing:usable ? result.matchedListing : null,
    // Do not propagate upstream error strings: they can contain credentials.
    explanation:usable ? 'Unverified eBay asking-price estimate; not completed sales.' :
      'No usable price evidence. Network permission, configuration, provider response, or matching may be unavailable.',
  };
}
module.exports.estimateEbay = estimateEbay;
