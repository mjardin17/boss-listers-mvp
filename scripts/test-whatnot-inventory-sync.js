// Whatnot leg of the 15-minute inventory sync: quantities only, both directions, no double counting.
// Everything here is fake: no network, no eBay, no Whatnot, nothing is bought or sold.
const test = require("node:test");
const assert = require("node:assert");
const { applyWhatnotOrders, pushWhatnotQuantities, listingIdFinder } = require("../lib/whatnotSync");
const { planCounts, autoSteps } = require("../lib/inventoryCountPlan");

const CREATED = "2026-11-27T17:24:10.592Z";

/** A fake Whatnot Seller API: orders, order items, variants with quantities, and /inventory/set. */
function fakeWhatnot({ orders = [], items = {}, variants = {}, failOrders = false } = {}) {
  const calls = { requests: [], inventory: [] };
  return {
    calls,
    async request(method, path) {
      calls.requests.push(`${method} ${path}`);
      if (method !== "GET") throw new Error(`unexpected ${method} ${path}`);
      let m;
      if (/^\/orders\?/.test(path)) {
        if (failOrders) throw new Error("Whatnot list_orders failed (HTTP 503): unavailable");
        return { json: { data: orders, next_cursor: null } };
      }
      if ((m = /^\/orders\/([^/]+)\/items/.exec(path))) return { json: { data: items[decodeURIComponent(m[1])] || [], next_cursor: null } };
      if ((m = /^\/products\/([^/]+)\/variants/.exec(path))) return { json: { data: variants[decodeURIComponent(m[1])] || [], next_cursor: null } };
      throw new Error(`unexpected GET ${path}`);
    },
    async syncInventory(list) {
      calls.inventory.push(...list);
      return { ok: true, results: list.map((i) => ({ variant_id: i.variant_id, status: "applied", previous_quantity: null, new_quantity: i.quantity })) };
    },
  };
}

function fakeEbay() {
  const calls = [];
  return { calls, set: async (id, qty) => { calls.push(`set:${id}:${qty}`); }, end: async (id) => { calls.push(`end:${id}`); } };
}

const syncState = (extra = {}) => ({ items: { "ebay-111": { productId: "900", quantity: 0, createdAt: CREATED, ...extra } } });
const order = (id, status = "pending_fulfillment") => ({ id, status, created_at: "2026-11-28T01:05:00.000Z" });
const line = (id, orderId, quantity = 1) => ({ id, order_id: orderId, product_id: "900", variant_id: "v900", product_external_id: "ebay-111", quantity });
const freshOrders = () => ({ checkpoint: null, orders: {}, items: {} });

test("Whatnot -> eBay: a Whatnot order lowers eBay by 1, and the count step then lowers the database by 1", async () => {
  const whatnot = fakeWhatnot({ orders: [order("5001")], items: { 5001: [line("7001", "5001")] } });
  const ebay = fakeEbay();
  const ebayMap = new Map([["111", 3]]);
  const logged = [];
  const out = await applyWhatnotOrders({ whatnot, syncState: syncState(), ordersState: freshOrders(), ebayMap, listingIdFor: listingIdFinder([]), enabled: true, changeEbay: ebay, logChange: (e) => logged.push(e) });
  assert.deepStrictEqual(ebay.calls, ["set:111:2"]);
  assert.strictEqual(ebayMap.get("111"), 2);
  assert.deepStrictEqual(out.ebayLowered, [{ sku: "ebay-111", order: "5001", from: 3, to: 2, ended: false }]);
  assert.strictEqual(logged.length, 1);
  assert.strictEqual(logged[0].whatnot, "order");
  // The existing planner sees eBay one below its baseline and lowers the BossListers count by 1.
  const plan = planCounts({ products: [{ sku: "ebay-111", ebay_listing_id: "111", quantity: 3, last_ebay_quantity: 3, status: "active" }], ebay: ebayMap, shopify: new Map() });
  const steps = autoSteps(plan, { ebayWrites: false });
  assert.deepStrictEqual(steps.apply, [{ sku: "ebay-111", ebayListingId: "111", from: 3, to: 2, needsEbayProof: false }]);
  assert.deepStrictEqual(steps.held, []);
});

test("Whatnot -> eBay: the same order is never applied twice", async () => {
  const whatnot = fakeWhatnot({ orders: [order("5001")], items: { 5001: [line("7001", "5001")] } });
  const ebay = fakeEbay();
  const ebayMap = new Map([["111", 3]]);
  const ordersState = freshOrders();
  const args = { whatnot, syncState: syncState(), ordersState, ebayMap, listingIdFor: listingIdFinder([]), enabled: true, changeEbay: ebay };
  await applyWhatnotOrders(args);
  const again = await applyWhatnotOrders(args); // next 15-minute run sees the same order
  assert.deepStrictEqual(ebay.calls, ["set:111:2"]);
  assert.deepStrictEqual(again.ebayLowered, []);
  assert.ok(ordersState.orders["5001"], "order id recorded");
  assert.ok(ordersState.checkpoint, "checkpoint recorded");
});

test("Whatnot -> eBay: the last unit sold ends the eBay listing", async () => {
  const whatnot = fakeWhatnot({ orders: [order("5002")], items: { 5002: [line("7002", "5002")] } });
  const ebay = fakeEbay();
  const ebayMap = new Map([["111", 1]]);
  await applyWhatnotOrders({ whatnot, syncState: syncState(), ordersState: freshOrders(), ebayMap, listingIdFor: listingIdFinder([]), enabled: true, changeEbay: ebay });
  assert.deepStrictEqual(ebay.calls, ["end:111"]);
  assert.strictEqual(ebayMap.has("111"), false);
});

test("Whatnot -> eBay: a failed eBay change is not recorded, so the next run retries it", async () => {
  const whatnot = fakeWhatnot({ orders: [order("5003")], items: { 5003: [line("7003", "5003")] } });
  const ordersState = freshOrders();
  const broken = { set: async () => { throw new Error("eBay refused"); }, end: async () => { throw new Error("eBay refused"); } };
  const out = await applyWhatnotOrders({ whatnot, syncState: syncState(), ordersState, ebayMap: new Map([["111", 2]]), listingIdFor: listingIdFinder([]), enabled: true, changeEbay: broken });
  assert.match(out.failed[0].reason, /eBay refused/);
  assert.strictEqual(ordersState.orders["5003"], undefined);
  const ebay = fakeEbay();
  await applyWhatnotOrders({ whatnot, syncState: syncState(), ordersState, ebayMap: new Map([["111", 2]]), listingIdFor: listingIdFinder([]), enabled: true, changeEbay: ebay });
  assert.deepStrictEqual(ebay.calls, ["set:111:1"]);
});

test("Whatnot -> eBay: cancelled orders and items not synced from eBay change nothing", async () => {
  const whatnot = fakeWhatnot({
    orders: [order("5004", "cancelled"), order("5005")],
    items: { 5004: [line("7004", "5004")], 5005: [{ id: "7005", order_id: "5005", product_id: "12345", quantity: 1 }] },
  });
  const ebay = fakeEbay();
  await applyWhatnotOrders({ whatnot, syncState: syncState(), ordersState: freshOrders(), ebayMap: new Map([["111", 3]]), listingIdFor: listingIdFinder([]), enabled: true, changeEbay: ebay });
  assert.deepStrictEqual(ebay.calls, []);
});

test("Whatnot -> eBay: a Whatnot API error is reported, not thrown, and eBay is not touched", async () => {
  const ebay = fakeEbay();
  const out = await applyWhatnotOrders({ whatnot: fakeWhatnot({ failOrders: true }), syncState: syncState(), ordersState: freshOrders(), ebayMap: new Map([["111", 3]]), listingIdFor: listingIdFinder([]), enabled: true, changeEbay: ebay });
  assert.deepStrictEqual(ebay.calls, []);
  assert.match(out.failed[0].reason, /Whatnot orders/);
});

test("eBay -> Whatnot: an ended eBay item sets Whatnot to 0", async () => {
  const whatnot = fakeWhatnot({ variants: { 900: [{ id: "v900", inventory: { available_quantity: 1 } }] } });
  const logged = [];
  const state = syncState({ quantity: 1, released: true });
  const out = await pushWhatnotQuantities({ whatnot, syncState: state, ebayMap: new Map([["222", 4]]), listingIdFor: listingIdFinder([]), whyGone: async () => "ended", logChange: (e) => logged.push(e) });
  assert.deepStrictEqual(whatnot.calls.inventory, [{ variant_id: "v900", quantity: 0 }]);
  assert.deepStrictEqual(out.lowered, [{ sku: "ebay-111", from: 1, to: 0 }]);
  assert.strictEqual(state.items["ebay-111"].quantity, 0);
  assert.strictEqual(logged[0].whatnot, "quantity");
});

test("eBay -> Whatnot: a lower eBay quantity lowers Whatnot to match", async () => {
  const whatnot = fakeWhatnot({ variants: { 900: [{ id: "v900", inventory: { available_quantity: 3 } }] } });
  await pushWhatnotQuantities({ whatnot, syncState: syncState({ quantity: 3 }), ebayMap: new Map([["111", 2]]), listingIdFor: listingIdFinder([]) });
  assert.deepStrictEqual(whatnot.calls.inventory, [{ variant_id: "v900", quantity: 2 }]);
});

test("eBay -> Whatnot: an item held at 0 is never raised; only a released item is", async () => {
  const held = fakeWhatnot({ variants: { 900: [{ id: "v900", inventory: { available_quantity: 0 } }] } });
  await pushWhatnotQuantities({ whatnot: held, syncState: syncState(), ebayMap: new Map([["111", 3]]), listingIdFor: listingIdFinder([]) });
  assert.deepStrictEqual(held.calls.inventory, []);
  const released = fakeWhatnot({ variants: { 900: [{ id: "v900", inventory: { available_quantity: 0 } }] } });
  await pushWhatnotQuantities({ whatnot: released, syncState: syncState({ released: true }), ebayMap: new Map([["111", 3]]), listingIdFor: listingIdFinder([]) });
  assert.deepStrictEqual(released.calls.inventory, [{ variant_id: "v900", quantity: 3 }]);
});

test("eBay -> Whatnot: not zeroed when eBay still calls the listing active, or the eBay read looked bad", async () => {
  const variants = { 900: [{ id: "v900", inventory: { available_quantity: 2 } }] };
  const a = fakeWhatnot({ variants });
  const outA = await pushWhatnotQuantities({ whatnot: a, syncState: syncState(), ebayMap: new Map(), listingIdFor: listingIdFinder([]), whyGone: async () => "active" });
  assert.deepStrictEqual(a.calls.inventory, []);
  assert.strictEqual(outA.held.length, 1);
  const b = fakeWhatnot({ variants });
  await pushWhatnotQuantities({ whatnot: b, syncState: syncState(), ebayMap: new Map(), listingIdFor: listingIdFinder([]), blocked: "eBay returned no listings", whyGone: async () => "ended" });
  assert.deepStrictEqual(b.calls.inventory, []);
});

test("Whatnot steps never create, price or publish: only GET reads and /inventory/set", async () => {
  const whatnot = fakeWhatnot({ orders: [order("5006")], items: { 5006: [line("7006", "5006")] }, variants: { 900: [{ id: "v900", inventory: { available_quantity: 2 } }] } });
  const ebayMap = new Map([["111", 2]]);
  await applyWhatnotOrders({ whatnot, syncState: syncState(), ordersState: freshOrders(), ebayMap, listingIdFor: listingIdFinder([]), enabled: true, changeEbay: fakeEbay() });
  await pushWhatnotQuantities({ whatnot, syncState: syncState(), ebayMap, listingIdFor: listingIdFinder([]) });
  assert.ok(whatnot.calls.requests.every((r) => r.startsWith("GET ")));
  assert.deepStrictEqual(whatnot.calls.inventory, [{ variant_id: "v900", quantity: 1 }]);
});

test("sync script: a Whatnot failure is logged and the run carries on", async () => {
  const { whatnotSalesStep, whatnotQuantityStep } = require("./inventory-count-sync");
  const log = console.log; console.log = () => {};
  try {
    const broken = { request: async () => { throw new Error("network down"); }, syncInventory: async () => { throw new Error("network down"); } };
    const ebay = { map: new Map([["111", 3]]), fetcher: {} };
    const ctx = await whatnotSalesStep({ ebay, tenantId: "t", products: [], config: { whatnotSalesLowerEbay: true }, deps: { whatnot: broken, syncState: syncState(), ordersState: freshOrders(), saveOrders: () => {}, changeEbay: fakeEbay(), logChange: () => {} } });
    const out = await whatnotQuantityStep({ whatnot: ctx, ebay, tenantId: "t", blocked: null, deps: { saveSync: () => {}, logChange: () => {}, whyGone: async () => "unknown" } });
    assert.ok(out.failed.length >= 2);
    assert.deepStrictEqual(out.lowered, []);
    assert.strictEqual(ebay.map.get("111"), 3);
  } finally { console.log = log; }
});
