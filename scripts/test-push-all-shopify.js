const test = require("node:test");
const assert = require("node:assert");
const { planPush, parseArgs } = require("./push-all-to-shopify");

const good = (sku, extra = {}) => ({ id: sku, sku, title: "Thing", price: 9.99, image_url: "https://i.ebayimg.com/x.jpg", status: "active", ...extra });

test("a complete product is eligible", () => {
  const { eligible, skipped } = planPush([good("A")], new Set());
  assert.strictEqual(eligible.length, 1);
  assert.strictEqual(skipped.length, 0);
});

test("a SKU already in Shopify is skipped, case-insensitively, so no duplicate is ever created", () => {
  const { eligible, skipped } = planPush([good("ABC-1")], new Set(["abc-1"]));
  assert.strictEqual(eligible.length, 0);
  assert.deepStrictEqual(skipped[0].why, ["already in Shopify"]);
});

test("a SKU already recorded as posted is skipped", () => {
  const { eligible } = planPush([good("A")], new Set(), new Set(["A"]));
  assert.strictEqual(eligible.length, 0);
});

test("missing price, title, or a public https photo each block a push and say why", () => {
  const { eligible, skipped } = planPush(
    [good("P", { price: 0 }), good("T", { title: " " }), good("I", { image_url: "/uploads/a.jpg" }), good("H", { image_url: "http://x/a.jpg" })],
    new Set()
  );
  assert.strictEqual(eligible.length, 0);
  assert.deepStrictEqual(skipped.map((s) => s.why[0]), ["no price", "no title", "no public photo", "no public photo"]);
});

test("non-active products are skipped", () => {
  const { skipped } = planPush([good("D", { status: "draft" })], new Set());
  assert.deepStrictEqual(skipped[0].why, ["status draft"]);
});

test("--sku limits the run to those SKUs", () => {
  const { eligible } = planPush([good("A"), good("B")], new Set(), new Set(), new Set(["B"]));
  assert.deepStrictEqual(eligible.map((p) => p.sku), ["B"]);
});

test("live mode is only on with --live, and defaults are safe", () => {
  assert.strictEqual(parseArgs([]).live, false);
  assert.strictEqual(parseArgs(["--live"]).live, true);
  assert.strictEqual(parseArgs(["--live"]).confirm, undefined);
  assert.strictEqual(parseArgs(["--limit", "3"]).limit, 3);
  assert.strictEqual(parseArgs([]).limit, Infinity);
});

test("a price under $1 is treated as a test value and is not pushed", () => {
  const { eligible, skipped } = planPush([good("CHEAP", { price: 0.01 }), good("OK", { price: 1 })], new Set());
  assert.deepStrictEqual(eligible.map((p) => p.sku), ["OK"]);
  assert.match(skipped[0].why[0], /under /);
});
