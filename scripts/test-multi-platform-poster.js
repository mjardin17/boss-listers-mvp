const test = require("node:test");
const assert = require("node:assert");
const { MultiPlatformPoster, toPlatformResult } = require("../lib/multiPlatformPoster");

test("a dry-run result is never reported as posted", () => {
  const r = toPlatformResult({ ok: true, dry_run: true, published: false });
  assert.strictEqual(r.success, false);
  assert.match(r.note, /Dry run/);
});

test("a response with no listing id or url is not reported as posted", () => {
  assert.strictEqual(toPlatformResult({ ok: true }).success, false);
});

test("an offer that was created but not published is not reported as posted", () => {
  const r = toPlatformResult({ ok: true, published: false, offerId: "123", note: "Offer created but not published" });
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.listingId, "123");
});

test("a real live result keeps the platform's own id and url", () => {
  const r = toPlatformResult({ ok: true, published: true, listingId: "L1", url: "https://example.test/L1" });
  assert.deepStrictEqual(r, { success: true, listingId: "L1", url: "https://example.test/L1" });
});

test("an ok:false result and a thrown error both report failure", async () => {
  assert.strictEqual(toPlatformResult({ ok: false, error: "nope" }).success, false);
  const poster = new MultiPlatformPoster();
  poster.etsy = { createListing: async () => { throw new Error("boom"); } };
  const out = await poster.postToAllPlatforms("t1", { sku: "S", title: "T", price: 1 }, ["etsy"]);
  assert.deepStrictEqual(out.etsy, { success: false, error: "boom" });
});

test("default posting is an explicit dry run and nothing is reported as posted", async () => {
  delete process.env.MULTI_PLATFORM_LIVE;
  const seen = [];
  const stub = (name) => ({ createListing: async (...args) => { seen.push([name, args]); return { ok: true, dry_run: true }; } });
  const poster = new MultiPlatformPoster();
  for (const p of ["ebay", "etsy", "amazon", "tiktok", "shopify", "facebook", "bonanza", "woocommerce", "instagram"]) poster[p] = stub(p);
  const out = await poster.postToAllPlatforms("t1", { sku: "S", title: "T", price: 1, description: "d" }, ["ebay", "shopify"]);
  assert.strictEqual(out.ebay.success, false);
  assert.strictEqual(out.shopify.success, false);
  assert.strictEqual(seen.length, 2, "unselected platforms must not be called");
  const ebayArgs = seen.find(([n]) => n === "ebay")[1];
  assert.strictEqual(ebayArgs.length, 3, "eBay createListing takes (product, policies, options)");
  assert.strictEqual(ebayArgs[2].dryRun, true);
});

test("an unknown platform is reported, not ignored", async () => {
  const out = await new MultiPlatformPoster().postToAllPlatforms("t1", {}, ["myspace"]);
  assert.strictEqual(out.myspace.success, false);
});
