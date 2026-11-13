const test = require("node:test");
const assert = require("node:assert");
const { buildMetaFeed, META_COLUMNS } = require("../lib/metaFeed");

const item = (over) => ({ sku: "ebay-1", slug: "blue-toy-car-1", title: "Blue toy car", description: null, price: "19.99", image_url: "https://i.ebayimg.com/a.jpg", condition: "New", available: 2, ...over });
const opts = { productUrl: (p) => `https://shop.example.com/item/${p.slug}`, brand: "Jardins Outpost" };
const rows = (csv) => csv.trim().split("\n").slice(1);

test("one line per item, in the columns Meta asks for", () => {
  const out = buildMetaFeed([item()], opts);
  assert.strictEqual(out.csv.split("\n")[0], META_COLUMNS.join(","));
  assert.strictEqual(rows(out.csv)[0], "ebay-1,Blue toy car,Blue toy car,in stock,new,19.99 USD,https://shop.example.com/item/blue-toy-car-1,https://i.ebayimg.com/a.jpg,Jardins Outpost");
  assert.deepStrictEqual(out.skipped, []);
});

test("sold out items stay in the feed as out of stock, so the shop hides them by itself", () => {
  assert.match(rows(buildMetaFeed([item({ available: 0 })], opts).csv)[0], /,out of stock,/);
});

test("a link to eBay is refused: Meta only takes pages on the seller's own website", () => {
  assert.throws(() => buildMetaFeed([item()], { ...opts, productUrl: () => "https://www.ebay.com/itm/123" }), /own website/);
  assert.throws(() => buildMetaFeed([item()], { ...opts, productUrl: () => "http://shop.example.com/x" }), /https/);
});

test("items Meta would reject are left out and listed with the reason, never guessed", () => {
  const out = buildMetaFeed([
    item(),
    item({ sku: "no-photo", image_url: "" }),
    item({ sku: "no-price", price: 0 }),
    item({ sku: "odd-condition", condition: "Unknown" }),
    item({ sku: "no-title", title: " " }),
  ], opts);
  assert.strictEqual(rows(out.csv).length, 1);
  assert.deepStrictEqual(out.skipped, [
    { sku: "no-photo", why: "no photo" },
    { sku: "no-price", why: "no price" },
    { sku: "odd-condition", why: "condition \"Unknown\" is not new, used or refurbished" },
    { sku: "no-title", why: "no name" },
  ]);
});

test("conditions are mapped to Meta's three words", () => {
  const cond = (c) => rows(buildMetaFeed([item({ condition: c })], opts).csv)[0].split(",")[4];
  assert.strictEqual(cond("New with tags"), "new");
  assert.strictEqual(cond("new in box"), "new");
  assert.strictEqual(cond("Like new"), "used");
  assert.strictEqual(cond("Used"), "used");
  assert.strictEqual(cond("Pre-owned"), "used");
  assert.strictEqual(cond("Seller refurbished"), "refurbished");
});

test("commas, quotes and line breaks in a name cannot break the file, and long text is cut", () => {
  const out = buildMetaFeed([item({ title: 'Car, "fast" one\nred', description: "x".repeat(6000) })], opts);
  const line = out.csv.trim().split("\n").slice(1).join("\n");
  assert.ok(line.includes('"Car, ""fast"" one red"'));
  assert.ok(line.length < 5400);
  const formula = buildMetaFeed([item({ title: "=SUM(A1)" })], opts);
  assert.ok(rows(formula.csv)[0].startsWith("ebay-1,'=SUM(A1)"));
});
