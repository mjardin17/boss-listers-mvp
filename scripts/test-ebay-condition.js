// Item condition: eBay is the source of truth for every eBay-listed item.
// The old import read GetMyeBaySelling, which never says the condition, and saved "Unknown".
const test = require("node:test");
const assert = require("node:assert");
const {
  conditionFromTradingItem, conditionFromId, conditionFromInventoryEnum, isMissingCondition, pickConditionChecks,
} = require("../lib/ebayCondition");
const { metaCondition } = require("../lib/metaFeed");

test("GetItem: the condition name eBay shows the buyer is kept as is", () => {
  assert.strictEqual(conditionFromTradingItem({ ConditionID: 1000, ConditionDisplayName: "New with tags" }), "New with tags");
  assert.strictEqual(conditionFromTradingItem({ ConditionID: 1500, ConditionDisplayName: "  New without box " }), "New without box");
});

test("GetItem: only a condition number still gives a name", () => {
  assert.strictEqual(conditionFromTradingItem({ ConditionID: 3000 }), "Used");
  assert.strictEqual(conditionFromTradingItem({ ConditionID: "1000" }), "New");
  assert.strictEqual(conditionFromId(7000), "For parts or not working");
  assert.strictEqual(conditionFromId(12345), null);
});

test("GetItem: an ungraded trading card keeps its card condition", () => {
  const item = { ConditionID: 4000, ConditionDisplayName: "Ungraded", ConditionDescriptors: { ConditionDescriptor: { Name: 40001, Value: 400010 } } };
  assert.strictEqual(conditionFromTradingItem(item), "Ungraded - Near mint or better");
  const list = { ConditionID: 4000, ConditionDisplayName: "Ungraded", ConditionDescriptors: { ConditionDescriptor: [{ Name: "40001", Value: "400011" }] } };
  assert.strictEqual(conditionFromTradingItem(list), "Ungraded - Excellent");
  assert.strictEqual(conditionFromTradingItem({ ConditionID: 4000, ConditionDisplayName: "Ungraded" }), "Ungraded");
});

test("GetItem: no condition at all is null, never a made-up word", () => {
  assert.strictEqual(conditionFromTradingItem({}), null);
  assert.strictEqual(conditionFromTradingItem(null), null);
  assert.strictEqual(conditionFromTradingItem({ ConditionDisplayName: "" }), null);
});

test("Inventory API condition words become readable names", () => {
  assert.strictEqual(conditionFromInventoryEnum("NEW"), "New");
  assert.strictEqual(conditionFromInventoryEnum("USED"), "Used");
  assert.strictEqual(conditionFromInventoryEnum("NEW_OTHER"), "New other");
  assert.strictEqual(conditionFromInventoryEnum("USED_EXCELLENT"), "Used - Excellent");
  assert.strictEqual(conditionFromInventoryEnum("FOR_PARTS_OR_NOT_WORKING"), "For parts or not working");
  assert.strictEqual(conditionFromInventoryEnum("UNKNOWN"), null);
  assert.strictEqual(conditionFromInventoryEnum(undefined), null);
});

test("missing means empty or the old placeholder", () => {
  for (const c of [null, undefined, "", " ", "Unknown", "UNKNOWN", "unknown"]) assert.strictEqual(isMissingCondition(c), true, String(c));
  for (const c of ["New", "Used", "Ungraded - Excellent"]) assert.strictEqual(isMissingCondition(c), false, c);
});

test("which listings get a condition check: missing first, live only, capped", () => {
  const live = new Set(["1", "2", "3", "4"]);
  const products = [
    { id: "a", ebay_listing_id: "1", condition: "Unknown" },
    { id: "b", ebay_listing_id: "2", condition: "New" },
    { id: "c", ebay_listing_id: "3", condition: null },
    { id: "d", ebay_listing_id: "9", condition: null }, // not live on eBay: skip
    { id: "e", ebay_listing_id: null, condition: null }, // not on eBay at all: skip
  ];
  const picked = pickConditionChecks(products, live, { now: 0, max: 25, slots: 1 });
  // With one slot a day, every live listing is due today; missing ones come first.
  assert.deepStrictEqual(picked.map((p) => p.id), ["a", "c", "b"]);
  assert.deepStrictEqual(pickConditionChecks(products, live, { now: 0, max: 1, slots: 1 }).map((p) => p.id), ["a"]);
});

test("a known condition is re-checked about once a day, not every run", () => {
  const live = new Set(Array.from({ length: 96 }, (_, i) => String(1000 + i)));
  const products = [...live].map((id) => ({ id, ebay_listing_id: id, condition: "New" }));
  const seen = new Map();
  const QUARTER = 15 * 60 * 1000;
  for (let run = 0; run < 96; run++) {
    for (const p of pickConditionChecks(products, live, { now: run * QUARTER })) seen.set(p.id, (seen.get(p.id) || 0) + 1);
  }
  assert.strictEqual(seen.size, 96);
  assert.ok([...seen.values()].every((n) => n === 1));
});

test("Facebook and Instagram read eBay card conditions as used", () => {
  assert.strictEqual(metaCondition("Ungraded - Near mint or better"), "used");
  assert.strictEqual(metaCondition("Graded"), "used");
  assert.strictEqual(metaCondition("New with box"), "new");
  assert.strictEqual(metaCondition("Unknown"), null);
});

test("the old eBay import no longer saves 'Unknown' and never wipes a saved condition", async () => {
  process.env.SUPABASE_URL = "https://mock.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "mock";
  const { EbayInventoryFetcher } = require("../lib/ebayInventoryFetcher");
  const { InventorySyncService } = require("../lib/inventorySyncService");
  const fetcher = new EbayInventoryFetcher();
  const legacy = fetcher._normalizeLegacyItem({ ItemID: "123", Title: "Thing", Quantity: 1, SellingStatus: { QuantitySold: 0 } });
  assert.strictEqual(legacy.condition, null);
  const named = fetcher._normalizeLegacyItem({ ItemID: "124", Title: "Thing", Quantity: 1, ConditionDisplayName: "New with tags", SellingStatus: { QuantitySold: 0 } });
  assert.strictEqual(named.condition, "New with tags");

  const service = new InventorySyncService();
  const bodies = [];
  service._rest = async (path, opts = {}) => {
    if ((opts.method || "GET") === "GET") return [{ id: "row-1" }];
    bodies.push(JSON.parse(opts.body));
    return [{ id: "row-1" }];
  };
  await service._upsertProduct("tenant", { sku: "ebay-123", title: "Thing", quantity: 1, condition: null });
  assert.strictEqual("condition" in bodies[0], false);
  await service._upsertProduct("tenant", { sku: "ebay-124", title: "Thing", quantity: 1, condition: "Used" });
  assert.strictEqual(bodies[1].condition, "Used");
});
