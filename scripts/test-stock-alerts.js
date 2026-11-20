const test = require("node:test");
const assert = require("node:assert/strict");
const { validateThreshold, formatStockAlertEmail, DEFAULT_STOCK_ALERT_THRESHOLD } = require("../lib/stockAlerts");

test("default threshold is two units", () => {
  assert.equal(DEFAULT_STOCK_ALERT_THRESHOLD, 2);
});

test("threshold accepts zero and positive whole numbers", () => {
  assert.deepEqual(validateThreshold(0), { ok: true, threshold: 0 });
  assert.deepEqual(validateThreshold("5"), { ok: true, threshold: 5 });
});

test("threshold rejects fractions, negatives, non-numbers and excessive values", () => {
  for (const value of [-1, 1.5, "abc", "", "   ", 10001, null, false]) {
    assert.equal(validateThreshold(value).ok, false, String(value));
  }
});

test("email copy distinguishes sold out from low stock and includes SKU", () => {
  const low = formatStockAlertEmail({ product_title: "Hot Wheels", sku: "HW-1", quantity: 2, threshold: 2 });
  assert.match(low.subject, /Low stock/);
  assert.match(low.text, /SKU: HW-1/);
  const out = formatStockAlertEmail({ product_title: "Pokémon card", sku: "PK-1", quantity: 0, threshold: 2 });
  assert.match(out.subject, /Out of stock/);
  assert.match(out.text, /now out of stock/);
});
