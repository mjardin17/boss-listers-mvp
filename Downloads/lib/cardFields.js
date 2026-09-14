// lib/cardFields.js
// Canonical shape for a trading-card identification result. Every field is
// nullable/optional — absence means "not visible/not determined", never a
// guess. See lib/cardIdentification.js for how this gets populated.

const GRADING_COMPANIES = ["PSA", "BGS", "SGC", "CGC", "TAG", "HGA", "Ungraded"];

const IDENTIFICATION_STATUS = {
  CONFIRMED: "confirmed", // >=95% evidence score, no conflicting evidence
  LIKELY: "likely", // 80-94%
  NEEDS_REVIEW: "needs_review", // <80% or conflicting evidence between front/back
  UNKNOWN: "unknown", // insufficient evidence to identify at all
};

const VALUATION_STATUS = {
  PROVIDER_ESTIMATE: "provider_estimate", // real provider data, active-listing derived
  VERIFIED_SALES: "verified_sales", // real provider data, confirmed completed sales
  INSUFFICIENT: "insufficient", // no reliable evidence — never a guessed number
};

/** @typedef {{
 *   cardGame: string|null, sport: string|null, league: string|null,
 *   player: string|null, team: string|null,
 *   set: string|null, subset: string|null, series: string|null,
 *   cardNumber: string|null, year: string|null, manufacturer: string|null, brand: string|null,
 *   parallel: string|null, variant: string|null,
 *   foil: boolean|null, holo: boolean|null, refractor: boolean|null, reverseHolo: boolean|null,
 *   serialNumber: string|null, printRun: string|null,
 *   rookieCard: boolean|null, autograph: boolean|null, memorabilia: boolean|null, patch: boolean|null,
 *   edition: string|null, language: string|null,
 *   graded: boolean|null, gradingCompany: string|null, grade: string|null, certificationNumber: string|null,
 *   conditionNotes: string|null,
 *   frontOcrText: string|null, backOcrText: string|null,
 * }} CardFields */

function emptyCardFields() {
  return {
    cardGame: null, sport: null, league: null,
    player: null, team: null,
    set: null, subset: null, series: null,
    cardNumber: null, year: null, manufacturer: null, brand: null,
    parallel: null, variant: null,
    foil: null, holo: null, refractor: null, reverseHolo: null,
    serialNumber: null, printRun: null,
    rookieCard: null, autograph: null, memorabilia: null, patch: null,
    edition: null, language: null,
    graded: null, gradingCompany: null, grade: null, certificationNumber: null,
    conditionNotes: null,
    frontOcrText: null, backOcrText: null,
  };
}

module.exports = { GRADING_COMPANIES, IDENTIFICATION_STATUS, VALUATION_STATUS, emptyCardFields };
