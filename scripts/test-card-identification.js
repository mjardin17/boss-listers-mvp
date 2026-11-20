import test from "node:test";
import assert from "node:assert/strict";
import { identifyCard, scoreCandidate, statusForScore } from "../lib/cardIdentification.js";

const fields = {
  cardGame: "Pokemon", sport: null, league: null, player: "Oddish", team: null,
  set: "Base Set", subset: null, series: null, cardNumber: "58", year: "1999",
  manufacturer: "Nintendo", brand: null, parallel: null, variant: null,
  foil: null, holo: null, refractor: null, reverseHolo: null,
  serialNumber: null, printRun: null, rookieCard: null, autograph: null,
  memorabilia: null, patch: null, edition: null, language: null,
  graded: false, gradingCompany: null, grade: null, certificationNumber: null,
  conditionNotes: null,
};

test("evidence score weights identity-critical fields more heavily", () => {
  assert.equal(scoreCandidate({ player: "Oddish", set: "Base Set", cardNumber: "58", year: "1999", manufacturer: "Nintendo" }), 80);
  assert.equal(statusForScore(100, false, 1), "confirmed");
  assert.equal(statusForScore(100, true, 1), "needs_review");
  assert.equal(statusForScore(100, false, 2), "needs_review");
  assert.equal(statusForScore(0, false, 1), "unknown");
});

test("missing Gemini key returns unknown without making a provider request", async () => {
  let calls = 0;
  const result = await identifyCard({
    frontBytes: Buffer.from("fake"),
    frontMime: "image/jpeg",
    apiKey: "",
    fetchImpl: async () => { calls += 1; throw new Error("must not call"); },
  });
  assert.equal(result.status, "unknown");
  assert.equal(result.confidenceScore, 0);
  assert.equal(calls, 0);
});

test("Gemini key is sent in header, not URL; unsafe field types are discarded", async () => {
  let captured;
  const result = await identifyCard({
    frontBytes: Buffer.from("fake"),
    frontMime: "image/jpeg",
    apiKey: "test-secret-key",
    model: "gemini-test-model",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        json: async () => ({
          candidates: [{
            content: { parts: [{ text: JSON.stringify({
              candidates: [{ ...fields, player: { injected: true }, graded: "false", year: 1999 }],
              frontOcrText: "x".repeat(5000),
            }) }] },
          }],
        }),
      };
    },
  });
  assert.equal(captured.url.includes("test-secret-key"), false);
  assert.equal(captured.options.headers["x-goog-api-key"], "test-secret-key");
  assert.equal(result.fields.player, null);
  assert.equal(result.fields.graded, null);
  assert.equal(result.fields.year, "1999");
  assert.equal(result.evidence.frontOcrText.length, 4000);
});

test("ambiguous candidates and conflicting front/back text require review", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      candidates: [fields, { ...fields, parallel: "Holo" }],
      frontBackTextConflict: false,
    }),
  });
  const result = await identifyCard({
    frontBytes: Buffer.from("fake"),
    frontMime: "image/jpeg",
    apiKey: "test-key",
    fetchImpl,
  });
  assert.equal(result.status, "needs_review");
  assert.equal(result.candidates.length, 2);
});

test("malformed provider response remains unknown", async () => {
  const result = await identifyCard({
    frontBytes: Buffer.from("fake"),
    frontMime: "image/jpeg",
    apiKey: "test-key",
    fetchImpl: async () => ({ ok: true, json: async () => null }),
  });
  assert.equal(result.status, "unknown");
  assert.equal(result.confidenceScore, 0);
});
