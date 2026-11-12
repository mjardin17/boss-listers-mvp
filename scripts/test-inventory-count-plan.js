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
  assert.deepStrictEqual(parseArgs([]), { live: false, auto: false, confirm: undefined, sku: null, shopify: false });
  assert.deepStrictEqual(parseArgs(["--with-shopify", "--live", "--sku", "A", "--confirm", "X"]), { live: true, auto: false, confirm: "X", sku: "A", shopify: true });
});

// ---- automatic mode -------------------------------------------------------
const { autoSteps } = require("../lib/inventoryCountPlan");
const { parseArgs: parseSyncArgs, AUTO_CONFIRM_WORD } = require("./inventory-count-sync");

const planItem = (over) => ({ sku: "a", ebayListingId: "1", dbQty: 1, newQty: 1, ebayGone: false, oversoldBy: 0, actions: [], notes: [], ...over });

test("autoSteps: a blocked plan applies nothing", () => {
  const out = autoSteps({ blocked: "eBay returned no listings", items: [planItem({ newQty: 0, actions: [{ channel: "db", set: 0 }] })] });
  assert.strictEqual(out.blocked, "eBay returned no listings");
  assert.deepStrictEqual(out.apply, []);
});

test("autoSteps: database-only changes are applied; a gone listing needs eBay's word first", () => {
  const out = autoSteps({ blocked: null, items: [
    planItem({ sku: "gone", dbQty: 1, newQty: 0, ebayGone: true, actions: [{ channel: "db", set: 0 }] }),
    planItem({ sku: "sold-one", dbQty: 3, newQty: 2, actions: [{ channel: "db", set: 2 }] }),
    planItem({ sku: "same" }),
  ] });
  assert.deepStrictEqual(out.apply, [
    { sku: "gone", ebayListingId: "1", from: 1, to: 0, needsEbayProof: true },
    { sku: "sold-one", ebayListingId: "1", from: 3, to: 2, needsEbayProof: false },
  ]);
  assert.deepStrictEqual(out.held, []);
});

test("autoSteps: anything that would write to a selling site, is oversold, or has an error is held for Josh", () => {
  const out = autoSteps({ blocked: null, items: [
    planItem({ sku: "to-ebay", dbQty: 2, newQty: 1, actions: [{ channel: "db", set: 1 }, { channel: "ebay", set: 1 }] }),
    planItem({ sku: "manual", dbQty: 1, newQty: 0, actions: [{ channel: "db", set: 0 }, { channel: "ebay", manual: "end the listing" }] }),
    planItem({ sku: "over", dbQty: 1, newQty: 0, oversoldBy: 1, actions: [{ channel: "db", set: 0 }] }),
    planItem({ sku: "bad", error: "no eBay baseline" }),
  ] });
  assert.deepStrictEqual(out.apply, []);
  assert.deepStrictEqual(out.held.map((h) => h.sku), ["to-ebay", "manual", "over", "bad"]);
  assert.ok(out.held.every((h) => h.reason));
});

test("parseArgs: automatic mode needs its own confirm word", () => {
  assert.strictEqual(parseSyncArgs(["--auto", "--confirm", AUTO_CONFIRM_WORD]).auto, true);
  assert.strictEqual(parseSyncArgs([]).auto, false);
  assert.strictEqual(AUTO_CONFIRM_WORD, "SYNC_ALL_SAFE");
});

// ---- the other direction: a sale somewhere else must lower eBay --------------
test("autoSteps: with eBay changes switched on, a sale elsewhere lowers eBay or ends the listing", () => {
  const plan = { blocked: null, items: [
    planItem({ sku: "three-left", ebayListingId: "11", dbQty: 2, newQty: 2, actions: [{ channel: "ebay", set: 2 }] }),
    planItem({ sku: "last-one", ebayListingId: "22", dbQty: 0, newQty: 0, actions: [{ channel: "ebay", set: 0, manual: "end the eBay listing" }] }),
    planItem({ sku: "shop", dbQty: 1, newQty: 1, actions: [{ channel: "shopify", set: 1 }] }),
  ] };
  const on = autoSteps(plan, { ebayWrites: true });
  assert.deepStrictEqual(on.ebay, [
    { sku: "three-left", ebayListingId: "11", set: 2, end: false },
    { sku: "last-one", ebayListingId: "22", set: 0, end: true },
  ]);
  assert.deepStrictEqual(on.held.map((h) => h.sku), ["shop"]);

  const off = autoSteps(plan);
  assert.deepStrictEqual(off.ebay, []);
  assert.deepStrictEqual(off.held.map((h) => h.sku), ["three-left", "last-one", "shop"]);
});

test("autoSteps: an eBay change is never made for an oversold or broken item, even when switched on", () => {
  const out = autoSteps({ blocked: null, items: [
    planItem({ sku: "over", oversoldBy: 1, newQty: 0, actions: [{ channel: "ebay", set: 0, manual: "end the eBay listing" }] }),
    planItem({ sku: "bad", error: "bad eBay count: -1", actions: [] }),
  ] }, { ebayWrites: true });
  assert.deepStrictEqual(out.ebay, []);
  assert.strictEqual(out.held.length, 2);
});

test("autoSteps: a count change and an eBay change on the same item are both carried out", () => {
  const out = autoSteps({ blocked: null, items: [
    planItem({ sku: "both", ebayListingId: "5", dbQty: 3, newQty: 2, actions: [{ channel: "db", set: 2 }, { channel: "ebay", set: 2 }] }),
  ] }, { ebayWrites: true });
  assert.deepStrictEqual(out.apply, [{ sku: "both", ebayListingId: "5", from: 3, to: 2, needsEbayProof: false }]);
  assert.deepStrictEqual(out.ebay, [{ sku: "both", ebayListingId: "5", set: 2, end: false }]);
});

const { runAuto } = require("./inventory-count-sync");
const quiet = async (fn) => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };

test("runAuto: lowers the BossListers count first, then eBay; a count that did not apply leaves eBay alone", async () => {
  const plan = { blocked: null, items: [
    planItem({ sku: "ok", ebayListingId: "1", dbQty: 3, newQty: 2, actions: [{ channel: "db", set: 2 }, { channel: "ebay", set: 2 }] }),
    planItem({ sku: "last", ebayListingId: "2", dbQty: 0, newQty: 0, actions: [{ channel: "ebay", set: 0, manual: "end the eBay listing" }] }),
    planItem({ sku: "stale", ebayListingId: "3", dbQty: 5, newQty: 4, actions: [{ channel: "db", set: 4 }, { channel: "ebay", set: 4 }] }),
  ] };
  const order = [];
  const rest = async (path, opts) => {
    const body = JSON.parse(opts.body);
    order.push(`db:${body.p_sku}`);
    return [{ applied: body.p_sku !== "stale", reason: "count changed since it was read" }];
  };
  const changeEbay = {
    set: async (_f, _t, id, qty) => { order.push(`ebay-set:${id}:${qty}`); },
    end: async (_f, _t, id) => { order.push(`ebay-end:${id}`); },
  };
  const out = await quiet(() => runAuto({ plan, ebay: { map: new Map(), fetcher: {} }, tenantId: "t", rest, ebayWrites: true, changeEbay }));
  assert.deepStrictEqual(order, ["db:ok", "db:stale", "ebay-set:1:2", "ebay-end:2"]);
  assert.deepStrictEqual(out.ebayChanged, [{ sku: "ok", set: 2, ended: false }, { sku: "last", set: 0, ended: true }]);
  assert.deepStrictEqual(out.failed.map((f) => f.sku), ["stale"]);
});

test("runAuto: with eBay changes switched off, eBay is never called", async () => {
  const plan = { blocked: null, items: [planItem({ sku: "last", dbQty: 0, newQty: 0, actions: [{ channel: "ebay", set: 0, manual: "end the eBay listing" }] })] };
  let calls = 0;
  const changeEbay = { set: async () => { calls++; }, end: async () => { calls++; } };
  const out = await quiet(() => runAuto({ plan, ebay: { map: new Map(), fetcher: {} }, tenantId: "t", rest: async () => [], changeEbay }));
  assert.strictEqual(calls, 0);
  assert.deepStrictEqual(out.held.map((h) => h.sku), ["last"]);
});

test("runAuto: a failed eBay change is reported, not hidden", async () => {
  const plan = { blocked: null, items: [planItem({ sku: "x", ebayListingId: "9", dbQty: 1, newQty: 1, actions: [{ channel: "ebay", set: 1 }] })] };
  const changeEbay = { set: async () => { throw new Error("eBay refused"); }, end: async () => {} };
  const out = await quiet(() => runAuto({ plan, ebay: { map: new Map(), fetcher: {} }, tenantId: "t", rest: async () => [], ebayWrites: true, changeEbay }));
  assert.deepStrictEqual(out.ebayChanged, []);
  assert.match(out.failed[0].reason, /eBay refused/);
});
