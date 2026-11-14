const test = require("node:test");
const assert = require("node:assert");
const { XMLParser } = require("fast-xml-parser");
const { shippingFromTradingItem, isMissingShipping, shippingChanges, usdAmount } = require("../lib/ebayShipping");

// Same parser settings as the cloud sync, so these items look exactly like GetItem's.
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", isArray: (name) => name === "Item" });
const item = (shippingXml) => parser.parse(`<GetItemResponse><Item><ItemID>1</ItemID>${shippingXml}</Item></GetItemResponse>`).GetItemResponse.Item[0];
const option = (priority, cost, extra = "") =>
  `<ShippingServiceOptions><ShippingService>USPSGroundAdvantage</ShippingService><ShippingServiceCost currencyID="USD">${cost}</ShippingServiceCost><ShippingServicePriority>${priority}</ShippingServicePriority>${extra}</ShippingServiceOptions>`;

test("a flat shipping price is read in dollars", () => {
  const it = item(`<ShippingDetails><ShippingType>Flat</ShippingType>${option(1, "5.25")}</ShippingDetails>`);
  assert.deepStrictEqual(shippingFromTradingItem(it), { type: "flat", cost: 5.25 });
});

test("the first domestic option (priority 1) is the one used", () => {
  const it = item(`<ShippingDetails><ShippingType>Flat</ShippingType>${option(2, "12.00")}${option(1, "4.75")}</ShippingDetails>`);
  assert.deepStrictEqual(shippingFromTradingItem(it), { type: "flat", cost: 4.75 });
});

test("free shipping on eBay is saved as free with cost 0", () => {
  const it = item(`<ShippingDetails><ShippingType>Flat</ShippingType>${option(1, "0.0", "<FreeShipping>true</FreeShipping>")}</ShippingDetails>`);
  assert.deepStrictEqual(shippingFromTradingItem(it), { type: "free", cost: 0 });
});

test("calculated shipping has no fixed price and is never guessed", () => {
  const it = item(`<ShippingDetails><ShippingType>Calculated</ShippingType>${option(1, "0.0")}</ShippingDetails>`);
  assert.deepStrictEqual(shippingFromTradingItem(it), { type: "calculated", cost: null });
});

test("freight or not specified gives no price", () => {
  assert.deepStrictEqual(shippingFromTradingItem(item("<ShippingDetails><ShippingType>Freight</ShippingType></ShippingDetails>")), { type: "none", cost: null });
});

test("an item without ShippingDetails tells nothing, so nothing is saved", () => {
  assert.strictEqual(shippingFromTradingItem(item("")), null);
  assert.strictEqual(shippingFromTradingItem(null), null);
  assert.strictEqual(shippingChanges({ shipping_type: "flat", shipping_cost: 5 }, null), null);
});

test("a price in another currency is not used", () => {
  assert.strictEqual(usdAmount({ "#text": "5.00", "@_currencyID": "GBP" }), null);
  assert.strictEqual(usdAmount("4.999"), 5);
});

test("only a real change is written", () => {
  assert.strictEqual(shippingChanges({ shipping_type: "flat", shipping_cost: "5.25" }, { type: "flat", cost: 5.25 }), null);
  assert.deepStrictEqual(shippingChanges({ shipping_type: null, shipping_cost: null }, { type: "flat", cost: 5.25 }), { shipping_type: "flat", shipping_cost: 5.25 });
  assert.deepStrictEqual(shippingChanges({ shipping_type: "flat", shipping_cost: 5 }, { type: "calculated", cost: null }), { shipping_type: "calculated", shipping_cost: null });
});

test("a product is missing shipping until it has been read once", () => {
  assert.strictEqual(isMissingShipping({ shipping_type: null }), true);
  assert.strictEqual(isMissingShipping({}), true);
  assert.strictEqual(isMissingShipping({ shipping_type: "calculated" }), false);
});
