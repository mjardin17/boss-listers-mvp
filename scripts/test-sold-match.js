// Strict sold-price matching. Titles and prices below are test fixtures, not market data.
const test = require("node:test");
const assert = require("node:assert");
const { matchSold, sameItem } = require("../lib/soldMatch");

const QUERY = "Transformers Age of the Primes Energon Optimus Prime";
const sale = (title, price, extra = {}) => ({ title, price, status: "sold", url: `https://example.com/itm/${price}`, ...extra });

// The wrong result ClearCrawl really returned for this query.
const CARD = {
  title: "Optimus Prime [Energon] #1 (2026 Upper Deck Transformers)",
  price: 30,
  status: "sold",
  url: "https://www.pricecharting.com/game/2026-upper-deck-transformers/optimus-prime-energon-1",
};

test("the Optimus figure search rejects the trading card", () => {
  assert.strictEqual(sameItem(QUERY, CARD), false);
  assert.strictEqual(matchSold(QUERY, { samples: [CARD], currency: "USD" }), null);
});

test("a card is rejected even when its title has every key word", () => {
  assert.strictEqual(sameItem(QUERY, sale("Transformers Age of the Primes Energon Optimus Prime Trading Card", 5)), false);
  assert.strictEqual(sameItem(QUERY, sale("Transformers Age of the Primes Energon Optimus Prime", 5, { url: "https://x.com/upper-deck/optimus" })), false);
});

test("other products, lots, parts and active listings are rejected", () => {
  for (const title of [
    "Transformers Legacy Energon Optimus Prime figure",
    "Transformers Age of the Primes Energon Megatron",
    "Lot of Transformers Age of the Primes Energon Optimus Prime",
    "Transformers Age of the Primes Energon Optimus Prime box only",
    "Transformers Age of the Primes Energon Optimus Prime poster",
  ]) assert.strictEqual(sameItem(QUERY, sale(title, 20)), false, title);
  assert.strictEqual(sameItem(QUERY, sale(QUERY, 20, { status: "active" })), false);
});

test("a card search keeps cards and drops figures", () => {
  assert.strictEqual(sameItem("Pokemon Oddish 001/196 Card", sale("Pokémon Oddish 001/196 Lost Origin card", 1)), true);
  assert.strictEqual(sameItem("Pokemon Oddish Card", sale("Pokemon Oddish card figure", 1)), false);
});

test("fewer than three matching sales gives no range", () => {
  const samples = [sale(`${QUERY} figure`, 20), sale(`${QUERY} Hasbro`, 30), CARD];
  assert.strictEqual(matchSold(QUERY, { samples, currency: "USD" }), null);
});

test("three matching sales give a range from those sales only", () => {
  const samples = [sale(`${QUERY} figure`, 20), sale(`Hasbro ${QUERY} NEW`, 35), sale(`${QUERY} sealed`, 24), CARD];
  const out = matchSold(QUERY, { samples, currency: "USD", low: 1, median: 999, high: 999, count: 50 });
  assert.deepStrictEqual([out.low, out.median, out.high, out.count], [20, 24, 35, 3]);
  assert.strictEqual(out.sourceUrls.length, 3);
});

test("repeats, other currencies and broken replies do not count", () => {
  const one = sale(QUERY, 20);
  assert.strictEqual(matchSold(QUERY, { samples: [one, one, one], currency: "USD" }), null);
  assert.strictEqual(matchSold(QUERY, { samples: [sale(QUERY, 1), sale(QUERY, 2), sale(QUERY, 3)], currency: "GBP" }), null);
  assert.strictEqual(matchSold(QUERY, { low: 1, median: 2, high: 3, count: 9 }), null);
  assert.strictEqual(matchSold(QUERY, null), null);
  assert.strictEqual(matchSold("", { samples: [one] }), null);
  assert.strictEqual(sameItem("toy figure", sale("toy figure", 3)), false);
});

test("a one-word search like 'hasbro' never produces a sold price", () => {
  const game = { title: "Hasbro Family Game Night (Wii)", price: 9, status: "sold" };
  assert.strictEqual(matchSold("hasbro", { samples: [game, game, game], currency: "USD" }), null);
});
