const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSoldList, matchOwnSales } = require("../lib/ownSoldHistory");

test("reads title, price and date from an eBay sold list; skips unpriced rows", () => {
  const list = { OrderTransactionArray: { OrderTransaction: [
    { Transaction: { Item: [{ Title: "Hasbro Transformers Age of the Primes Optimus Prime figure", ItemID: "1" }], TotalTransactionPrice: { "#text": "42.5" }, CreatedDate: "2026-11-01T10:00:00Z" } },
    { Transaction: { Item: [{ Title: "No price row" }] } },
  ] } };
  const sales = parseSoldList(list);
  assert.equal(sales.length, 1);
  assert.equal(sales[0].price, 42.5);
  assert.equal(matchOwnSales("Transformers Age of the Primes Optimus Prime", sales).length, 1);
  assert.equal(matchOwnSales("Halloween snow globe witch cat", sales).length, 0);
});
