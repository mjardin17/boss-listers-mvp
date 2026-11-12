const test = require("node:test");
const assert = require("node:assert");
const { planCounts } = require("../lib/inventoryCountPlan");
const { planPush } = require("./push-all-to-shopify");

const prod = (id, quantity, extra = {}) => ({
  sku: `ebay-${id}`, ebay_listing_id: String(id), quantity, last_ebay_quantity: quantity, status: "active", shopify_baseline: quantity, ...extra,
});
const live = (pairs) => new Map(pairs.map(([k, v]) => [String(k), v]));
const shop = (pairs) => new Map(pairs.map(([sku, qty, status = "ACTIVE"]) => [sku, { qty, status }]));
const row = (plan, id) => plan.items.find((i) => i.sku === `ebay-${id}`);

test("nothing sold anywhere: no actions", () => {
  const plan = planCounts({ products: [prod(1, 3)], ebay: live([[1, 3]]), shopify: shop([["ebay-1", 3]]) });
  assert.strictEqual(plan.blocked, null);
  assert.deepStrictEqual(row(plan, 1).actions, []);
  assert.strictEqual(row(plan, 1).newQty, 3);
});

test("one unit sold on eBay lowers the shared count and Shopify", () => {
  const plan = planCounts({ products: [prod(1, 3)], ebay: live([[1, 2]]), shopify: shop([["ebay-1", 3]]) });
  const r = row(plan, 1);
  assert.strictEqual(r.newQty, 2);
  assert.deepStrictEqual(r.actions, [{ channel: "db", set: 2 }, { channel: "shopify", set: 2, compare: 3 }]);
});

test("one unit sold on Shopify (or a channel it feeds) lowers the shared count and eBay", () => {
  const plan = planCounts({ products: [prod(1, 3)], ebay: live([[1, 3]]), shopify: shop([["ebay-1", 2]]) });
  const r = row(plan, 1);
  assert.strictEqual(r.newQty, 2);
  assert.deepStrictEqual(r.actions, [{ channel: "db", set: 2 }, { channel: "ebay", set: 2 }]);
});

test("sales on both sides in the same window are both counted", () => {
  const plan = planCounts({ products: [prod(1, 6)], ebay: live([[1, 4]]), shopify: shop([["ebay-1", 5]]) });
  const r = row(plan, 1);
  assert.strictEqual(r.newQty, 3);
  assert.deepStrictEqual(r.actions.map((a) => [a.channel, a.set]), [["db", 3], ["ebay", 3], ["shopify", 3]]);
});

test("more sold than existed is flagged as an oversell and the count stops at zero", () => {
  const plan = planCounts({ products: [prod(1, 1)], ebay: live([[1, 0]]), shopify: shop([["ebay-1", 0]]) });
  const r = row(plan, 1);
  assert.strictEqual(r.newQty, 0);
  assert.strictEqual(r.oversoldBy, 1);
});

test("a listing no longer live on eBay goes to zero everywhere", () => {
  const plan = planCounts({ products: [prod(1, 1), prod(2, 1), prod(3, 1), prod(4, 1), prod(5, 1)], ebay: live([[2, 1], [3, 1], [4, 1], [5, 1]]), shopify: shop([["ebay-1", 1]]) });
  const r = row(plan, 1);
  assert.strictEqual(r.ebayGone, true);
  assert.strictEqual(r.newQty, 0);
  assert.deepStrictEqual(r.actions, [{ channel: "db", set: 0 }, { channel: "shopify", set: 0, compare: 1 }]);
});

test("when Shopify sold the last unit, eBay needs ending by hand (never set to 0 silently)", () => {
  const plan = planCounts({ products: [prod(1, 1)], ebay: live([[1, 1]]), shopify: shop([["ebay-1", 0]]) });
  assert.deepStrictEqual(row(plan, 1).actions, [{ channel: "db", set: 0 }, { channel: "ebay", set: 0, manual: "end the eBay listing" }]);
});

test("a restock made on eBay raises the shared count (eBay is the source of truth)", () => {
  const plan = planCounts({ products: [prod(1, 1)], ebay: live([[1, 4]]), shopify: shop([["ebay-1", 1]]) });
  assert.strictEqual(row(plan, 1).newQty, 4);
});

test("with no Shopify baseline no sale is inferred; Shopify is corrected to the shared count", () => {
  const plan = planCounts({ products: [prod(1, 1, { shopify_baseline: null })], ebay: live([[1, 1]]), shopify: shop([["ebay-1", 2]]) });
  const r = row(plan, 1);
  assert.strictEqual(r.newQty, 1);
  assert.deepStrictEqual(r.actions, [{ channel: "shopify", set: 1, compare: 2 }]);
  assert.match(r.notes.join(" "), /no Shopify baseline/);
});

test("Shopify showing more than the baseline is drift, not a sale, and is corrected", () => {
  const plan = planCounts({ products: [prod(1, 2)], ebay: live([[1, 2]]), shopify: shop([["ebay-1", 5]]) });
  assert.strictEqual(row(plan, 1).newQty, 2);
  assert.deepStrictEqual(row(plan, 1).actions, [{ channel: "shopify", set: 2, compare: 5 }]);
});

test("a Shopify draft or missing product is never touched", () => {
  const plan = planCounts({ products: [prod(1, 3), prod(2, 3)], ebay: live([[1, 2], [2, 2]]), shopify: shop([["ebay-1", 3, "DRAFT"]]) });
  assert.deepStrictEqual(row(plan, 1).actions, [{ channel: "db", set: 2 }]);
  assert.deepStrictEqual(row(plan, 2).actions, [{ channel: "db", set: 2 }]);
});

test("digital items and ended products are left out", () => {
  const plan = planCounts({
    products: [prod(1, 999, { sku: "BOOK-X" }), prod(2, 1, { status: "ended" }), prod(3, 1)],
    ebay: live([[1, 1], [3, 1]]), shopify: shop([]), digitalSkus: ["BOOK-X"],
  });
  assert.deepStrictEqual(plan.items.map((i) => i.sku), ["ebay-3"]);
  assert.deepStrictEqual(plan.skipped, [{ sku: "BOOK-X", why: "digital item, not counted" }]);
});

test("fails closed: an empty eBay read blocks the whole plan", () => {
  const plan = planCounts({ products: [prod(1, 1)], ebay: live([]), shopify: shop([]) });
  assert.match(plan.blocked, /eBay returned no listings/);
});

test("fails closed: too many listings missing at once looks like a bad read, not sales", () => {
  const products = Array.from({ length: 40 }, (_, i) => prod(i + 1, 1));
  const plan = planCounts({ products, ebay: live(products.slice(0, 30).map((p) => [p.ebay_listing_id, 1])), shopify: shop([]) });
  assert.match(plan.blocked, /10 of 40/);
});

test("a negative or non-integer live count blocks that item only", () => {
  const plan = planCounts({ products: [prod(1, 2), prod(2, 2)], ebay: live([[1, -1], [2, 1]]), shopify: shop([]) });
  assert.match(row(plan, 1).error, /bad eBay count/);
  assert.deepStrictEqual(row(plan, 1).actions, []);
  assert.strictEqual(row(plan, 2).newQty, 1);
});

test("planPush: a SKU on the skip list is never pushed again", () => {
  const good = { id: "A", sku: "ebay-9", title: "Thing", price: 9.99, image_url: "https://i.ebayimg.com/x.jpg", status: "active" };
  const { eligible, skipped } = planPush([good], new Set(), new Set(), null, new Set(["EBAY-9"]));
  assert.strictEqual(eligible.length, 0);
  assert.deepStrictEqual(skipped[0].why, ["on the skip list"]);
});

const { classifyEbayItem } = require("../lib/inventoryCountPlan");
const { parseArgs } = require("./inventory-count-sync");

test("classifyEbayItem: a completed listing with every unit sold is 'sold'", () => {
  assert.strictEqual(classifyEbayItem({ SellingStatus: { ListingStatus: "Completed", QuantitySold: 1 }, Quantity: 1 }), "sold");
});

test("classifyEbayItem: a completed listing with units left was ended by the seller or expired", () => {
  assert.strictEqual(classifyEbayItem({ SellingStatus: { ListingStatus: "Completed", QuantitySold: 1 }, Quantity: 3 }), "ended");
  assert.strictEqual(classifyEbayItem({ SellingStatus: { ListingStatus: "Ended", QuantitySold: 0 }, Quantity: 1 }), "ended");
});

test("classifyEbayItem: a listing eBay still calls Active is 'active' (the list read missed it)", () => {
  assert.strictEqual(classifyEbayItem({ SellingStatus: { ListingStatus: "Active", QuantitySold: 0 }, Quantity: 2 }), "active");
});

test("classifyEbayItem: a missing or unreadable item is 'unknown', never 'sold'", () => {
  assert.strictEqual(classifyEbayItem(undefined), "unknown");
  assert.strictEqual(classifyEbayItem({}), "unknown");
});

test("parseArgs: preview without Shopify is the default; --with-shopify and --live are opt-in", () => {
  assert.deepStrictEqual(parseArgs([]), { live: false, confirm: undefined, sku: null, shopify: false });
  assert.deepStrictEqual(parseArgs(["--with-shopify", "--live", "--sku", "A", "--confirm", "X"]), { live: true, confirm: "X", sku: "A", shopify: true });
});
