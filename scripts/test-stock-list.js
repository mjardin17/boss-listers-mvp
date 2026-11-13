const test = require("node:test");
const assert = require("node:assert");
const { STAGES, stockStage, missingForApproval, newItemRow, editableFields, summarize } = require("../lib/stockList");

const base = { sku: "IH-1", title: "Canvas tote bag", price: 12, quantity: 2, condition: "used", image_url: "https://x.y/a.jpg", status: "draft", source: "manual", ebay_listing_id: null, approved_at: null };
const item = (over) => ({ ...base, ...over });

test("stage: a new item with something missing is at intake", () => {
  assert.strictEqual(stockStage(item({ price: 0 })), "intake");
  assert.strictEqual(stockStage(item({ image_url: null })), "intake");
  assert.strictEqual(stockStage(item({ condition: "" })), "intake");
});

test("stage: a complete item waits for Josh, and only his approval makes it ready", () => {
  assert.strictEqual(stockStage(item()), "needs_review");
  assert.strictEqual(stockStage(item({ approved_at: "2026-11-12T10:00:00Z" })), "ready");
});

test("stage: live on a selling site is listed; none left is sold; ended is archived", () => {
  assert.strictEqual(stockStage(item({ status: "active", source: "ebay", ebay_listing_id: "123" })), "listed");
  assert.strictEqual(stockStage(item({ status: "out_of_stock", source: "ebay", ebay_listing_id: "123", quantity: 0 })), "sold");
  assert.strictEqual(stockStage(item({ status: "ended" })), "archived");
  assert.strictEqual(stockStage(item({ status: "active", source: "manual" })), "listed");
});

test("stage: an approved item that is edited back to incomplete drops to intake, not ready", () => {
  assert.strictEqual(stockStage(item({ approved_at: "2026-11-12T10:00:00Z", price: 0 })), "intake");
});

test("every stage the page shows is one the rules can produce", () => {
  assert.deepStrictEqual(STAGES.map((s) => s.id), ["intake", "needs_review", "ready", "listed", "sold", "archived"]);
});

test("approval lists exactly what is missing, in plain words", () => {
  assert.deepStrictEqual(missingForApproval(item()), []);
  assert.deepStrictEqual(missingForApproval(item({ price: null, image_url: "", quantity: 0, condition: null, title: " " })), ["a name", "your price", "a photo", "a condition", "a quantity of 1 or more"]);
});

test("a new item is saved as an unlisted draft that the store and the sync both ignore", () => {
  const out = newItemRow({ title: "  Canvas tote bag ", quantity: "2", condition: "used", location: " Shelf A3 " }, { tenantId: "t1", now: 1700000000000 });
  assert.strictEqual(out.ok, true);
  assert.deepStrictEqual(out.row, {
    tenant_id: "t1", sku: "IH-" + (1700000000000).toString(36).toUpperCase(), title: "Canvas tote bag", description: null,
    price: 0, quantity: 2, condition: "used", location: "Shelf A3", image_url: null,
    status: "draft", source: "manual", published: false, approved_at: null,
  });
});

test("a new item needs a name and a sensible quantity; a price is never invented", () => {
  assert.match(newItemRow({ title: "", quantity: 1 }, { tenantId: "t" }).error, /name/);
  assert.match(newItemRow({ title: "x", quantity: -1 }, { tenantId: "t" }).error, /quantity/);
  assert.match(newItemRow({ title: "x", quantity: 1.5 }, { tenantId: "t" }).error, /quantity/);
  assert.match(newItemRow({ title: "x", quantity: 1, price: -3 }, { tenantId: "t" }).error, /price/);
  assert.strictEqual(newItemRow({ title: "x", quantity: 1 }, { tenantId: "t", now: 1 }).row.price, 0);
  assert.strictEqual(newItemRow({ title: "x", quantity: 1, price: "9.50" }, { tenantId: "t", now: 1 }).row.price, 9.5);
});

test("edits: only known fields, cleaned; the count of a listed item is not edited here", () => {
  const unlisted = editableFields(item(), { title: " New name ", price: "15", quantity: "3", location: "Bin 2", condition: "new", status: "active", tenant_id: "other" });
  assert.deepStrictEqual(unlisted, { ok: true, changes: { title: "New name", price: 15, quantity: 3, location: "Bin 2", condition: "new" } });
  const listed = editableFields(item({ status: "active", source: "ebay", ebay_listing_id: "1" }), { quantity: 5 });
  assert.strictEqual(listed.ok, false);
  assert.match(listed.error, /sync/);
  assert.deepStrictEqual(editableFields(item({ status: "active", ebay_listing_id: "1" }), { location: "Bin 9" }), { ok: true, changes: { location: "Bin 9" } });
  assert.strictEqual(editableFields(item(), { price: "abc" }).ok, false);
  assert.strictEqual(editableFields(item(), {}).ok, false);
});

test("changing a ready item's name, price, condition or count sends it back for approval", () => {
  const ready = item({ approved_at: "2026-11-12T10:00:00Z" });
  assert.strictEqual(editableFields(ready, { price: 20 }).changes.approved_at, null);
  assert.strictEqual("approved_at" in editableFields(ready, { location: "Bin 1" }).changes, false);
  assert.strictEqual("approved_at" in editableFields(ready, { price: 12 }).changes, false);
});

test("summary counts items and units per stage", () => {
  const out = summarize([item(), item({ approved_at: "x", quantity: 5 }), item({ status: "ended" }), item({ status: "active", ebay_listing_id: "9", quantity: 1 })]);
  assert.deepStrictEqual(out.needs_review, { items: 1, units: 2 });
  assert.deepStrictEqual(out.ready, { items: 1, units: 5 });
  assert.deepStrictEqual(out.listed, { items: 1, units: 1 });
  assert.deepStrictEqual(out.archived, { items: 1, units: 2 });
  assert.deepStrictEqual(out.intake, { items: 0, units: 0 });
});

const { canBringBack } = require("../lib/stockList");

test("digital items never run out, so their huge counts are left out of the unit totals", () => {
  const out = summarize(
    [item({ sku: "BOOK-1", status: "active", quantity: 999 }), item({ sku: "ebay-1", status: "active", ebay_listing_id: "1", quantity: 2 })],
    { digitalSkus: ["book-1"] },
  );
  assert.deepStrictEqual(out.listed, { items: 2, units: 2 });
});

test("only an in-house item that was put away can be brought back; an ended eBay listing cannot", () => {
  assert.strictEqual(canBringBack(item({ status: "ended" })), true);
  assert.strictEqual(canBringBack(item({ status: "ended", source: "ebay", ebay_listing_id: "5" })), false);
  assert.strictEqual(canBringBack(item({ status: "ended", ebay_listing_id: "5" })), false);
  assert.strictEqual(canBringBack(item()), false);
});
