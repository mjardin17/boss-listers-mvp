const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildCardCommercial } = require("../lib/cardCommercial");

const feed = [
  { sku: "card-1", title: "1989 Upper Deck Ken Griffey Jr. #1", quantity: 2, location: "Binder A", needsReview: false, frontImage: "/img/griffey-front.jpg" },
  { sku: "card-2", title: "2021 Topps Chrome Shohei Ohtani #150", quantity: 1, location: "Binder B", needsReview: false, frontImage: "/img/ohtani-front.jpg" },
  { sku: "card-3", title: "Unknown card", quantity: 1, location: "Box 2", needsReview: true, frontImage: "/img/unknown.jpg" },
];

test("builds one showcase scene per card that is ready, and skips cards needing review", () => {
  const script = buildCardCommercial(feed);
  const showcases = script.scenes.filter((s) => s.type === "product_showcase");
  assert.equal(showcases.length, 2);
  assert.ok(!JSON.stringify(script).includes("Unknown card"));
});

test("never puts a price in the script; the price comes from the listing", () => {
  const script = buildCardCommercial(feed);
  assert.ok(!JSON.stringify(script).includes("$"));
  assert.ok(script.scenes.every((s) => s.price === undefined));
});

test("uses the card title as the on-screen caption and the front image as the visual", () => {
  const script = buildCardCommercial(feed);
  const first = script.scenes.find((s) => s.type === "product_showcase");
  assert.equal(first.caption, "1989 Upper Deck Ken Griffey Jr. #1");
  assert.deepEqual(first.product_images, ["/img/griffey-front.jpg"]);
});

test("an empty feed gives an honest empty script, not a made-up one", () => {
  const script = buildCardCommercial([]);
  assert.equal(script.scenes.length, 0);
});
