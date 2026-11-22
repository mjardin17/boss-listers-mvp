import test from "node:test";
import assert from "node:assert/strict";
import { getCardValuation, textMatchesIdentity } from "../lib/cardPricing.js";

const fields = {
  year: "1999", manufacturer: "Nintendo", set: "Base Set", subset: null,
  series: null, player: "Oddish", cardNumber: "58", parallel: null, variant: null,
  graded: false, gradingCompany: null, grade: null,
};
const product = {
  id: "pc-1",
  "product-name": "1999 Nintendo Base Set Oddish #58",
  "console-name": "Pokemon Cards",
  "loose-price": 1250,
};

test("identity matching uses whole tokens, not partial substrings", () => {
  assert.equal(textMatchesIdentity(fields, product), true);
  assert.equal(textMatchesIdentity({
    cardNumber: "58", set: "Base Set", player: "Oddish",
  }, {
    "product-name": "Oddish Base Set #58",
    "console-name": "Pokemon Cards",
  }), true);
  assert.equal(textMatchesIdentity({ ...fields, cardNumber: "12" }, {
    "product-name": "1999 Nintendo Base Set Oddish #123",
    "console-name": "Pokemon Cards",
  }), false);
});

test("unknown graded state never defaults to ungraded pricing", async () => {
  let calls = 0;
  const result = await getCardValuation({
    fields: { ...fields, graded: null },
    apiToken: "test-token-unknown-grade",
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => ({ products: [product] }) };
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.status, "insufficient");
  assert.equal(result.market, null);
});

test("ungraded card can use a matching positive provider price", async () => {
  const result = await getCardValuation({
    fields,
    apiToken: "test-token-ungraded",
    fetchImpl: async () => ({ ok: true, json: async () => ({ products: [product] }) }),
  });
  assert.equal(result.status, "provider_estimate");
  assert.equal(result.market, 12.5);
  assert.equal(result.low, null);
  assert.equal(result.high, null);
});

test("conflicting prices across exact matches return insufficient", async () => {
  const result = await getCardValuation({
    fields,
    apiToken: "test-token-conflicting",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ products: [product, { ...product, id: "pc-2", "loose-price": 1999 }] }),
    }),
  });
  assert.equal(result.status, "insufficient");
  assert.equal(result.market, null);
  assert.match(result.explanation, /conflicting prices/i);
});

test("no token or no matching product never fabricates a price", async () => {
  const noToken = await getCardValuation({ fields, apiToken: "" });
  assert.equal(noToken.market, null);
  const noMatch = await getCardValuation({
    fields,
    apiToken: "test-token-no-match",
    fetchImpl: async () => ({ ok: true, json: async () => ({ products: [] }) }),
  });
  assert.equal(noMatch.market, null);
});

test("identical PriceCharting lookups are cached within the process", async () => {
  let calls = 0;
  const token = "unique-cache-test-token";
  const args = {
    fields,
    apiToken: token,
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => ({ products: [product] }) };
    },
  };
  const first = await getCardValuation(args);
  const second = await getCardValuation(args);
  assert.equal(first.market, 12.5);
  assert.equal(second.market, 12.5);
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
});
