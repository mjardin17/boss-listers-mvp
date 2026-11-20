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
  assert.equal(textMatchesIdentity({ ...fields, cardNumber: "12" }, {
    "product-name": "1999 Nintendo Base Set Oddish #123",
    "console-name": "Pokemon Cards",
  }), false);
});

test("unknown graded state never defaults to ungraded pricing", async () => {
  let calls = 0;
  const result = await getCardValuation({
    fields: { ...fields, graded: null },
    apiToken: "test-token",
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => ({ products: [product] }) };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "insufficient");
  assert.equal(result.market, null);
});

test("ungraded card can use a matching positive provider price", async () => {
  const result = await getCardValuation({
    fields,
    apiToken: "test-token",
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
    apiToken: "test-token",
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
    apiToken: "test-token",
    fetchImpl: async () => ({ ok: true, json: async () => ({ products: [] }) }),
  });
  assert.equal(noMatch.market, null);
});
