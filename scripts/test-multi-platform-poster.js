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

// ---- live posting is explicit, needs a real price, and never fakes a result ----

test("live posting without a price fails every selected platform and calls nothing", async () => {
  let calls = 0;
  const poster = new MultiPlatformPoster();
  poster.shopify = { createListing: async () => { calls++; return {}; } };
  const out = await poster.postToAllPlatforms("t1", { sku: "S", title: "T", price: 0 }, ["shopify"], { live: true });
  assert.strictEqual(out.shopify.success, false);
  assert.match(out.shopify.error, /price/i);
  assert.strictEqual(calls, 0);
});

test("live posting passes dryRun:false and confirm, and keeps the platform's own id/url", async () => {
  let seen;
  const poster = new MultiPlatformPoster();
  poster.instagram = { createListing: async (p, o) => { seen = o; return { ok: true, published: true, listingId: "IG1", url: "https://instagram.test/p/IG1" }; } };
  const out = await poster.postToAllPlatforms("t1", { sku: "S", title: "T", price: 12, image_url: "https://img.test/a.jpg" }, ["instagram"], { live: true });
  assert.deepStrictEqual([seen.dryRun, seen.confirm], [false, "PUBLISH_LIVE"]);
  assert.deepStrictEqual(out.instagram, { success: true, listingId: "IG1", url: "https://instagram.test/p/IG1" });
});

test("a live platform that returns no id is not reported as posted", async () => {
  const poster = new MultiPlatformPoster();
  poster.shopify = { createListing: async () => ({}) };
  const out = await poster.postToAllPlatforms("t1", { sku: "S", title: "T", price: 5 }, ["shopify"], { live: true });
  assert.strictEqual(out.shopify.success, false);
});

test("live eBay uses a resolved category + the seller's policies, with arguments in the right order", async () => {
  let args;
  const poster = new MultiPlatformPoster();
  poster.ebay = {
    _getAccessToken: async () => "TOKEN",
    createListing: async (...a) => { args = a; return { ok: true, published: true, listingId: "E1", url: "https://www.ebay.com/itm/E1" }; },
  };
  poster.ebayInputs = {
    suggestCategoryId: async () => ({ categoryId: "123" }),
    resolvePolicies: async (t) => { assert.strictEqual(t, "TOKEN"); return { fulfillment_policy_id: "f", payment_policy_id: "p", return_policy_id: "r", merchant_location_key: "loc" }; },
  };
  const out = await poster.postToAllPlatforms("t1", { sku: "S", title: "T", price: 9, condition: "like_new", image_url: "https://img.test/a.jpg" }, ["ebay"], { live: true });
  const [product, policies, options] = args;
  assert.strictEqual(product.category_id, "123");
  assert.deepStrictEqual(product.image_urls, ["https://img.test/a.jpg"]);
  assert.strictEqual(product.condition, "LIKE_NEW");
  assert.strictEqual(policies.merchant_location_key, "loc");
  assert.deepStrictEqual([options.dryRun, options.confirm], [false, "PUBLISH_LIVE"]);
  assert.strictEqual(out.ebay.success, true);
});

test("live eBay with no https photo or unreadable policies fails honestly and never calls createListing", async () => {
  let created = 0;
  const poster = new MultiPlatformPoster();
  poster.ebay = { _getAccessToken: async () => "T", createListing: async () => { created++; return {}; } };
  poster.ebayInputs = { suggestCategoryId: async () => ({ categoryId: "1" }), resolvePolicies: async () => { throw new Error("eBay account is missing: return_policy_id"); } };
  const out = await poster.postToAllPlatforms("t1", { sku: "S", title: "T", price: 9, image_url: "https://img.test/a.jpg" }, ["ebay"], { live: true });
  assert.strictEqual(out.ebay.success, false);
  assert.match(out.ebay.error, /return_policy_id/);
  assert.strictEqual(created, 0);
});

// ---- /api/inventory/post-to-platforms core: the live flag passes through ----

const { postSavedProduct } = require("../lib/postSavedProduct");
const { LIVE_CONFIRM } = require("../lib/liveConfirm");

function recordingPoster() {
  const calls = [];
  return {
    calls,
    postToAllPlatforms: async (tenantId, product, platforms, options) => {
      calls.push({ tenantId, sku: product.sku, platforms, options });
      return Object.fromEntries(platforms.map((p) => [p, { success: false, dryRun: !options.live, note: "stub" }]));
    },
  };
}
const loadProduct = async (sku) => ({ sku, title: "Gengar PSA 10", price: 120, image_url: "https://x.test/a.jpg" });

test("post-to-platforms dry-runs by default", async () => {
  const poster = recordingPoster();
  const out = await postSavedProduct({ tenantId: "t1", body: { productSKU: "S1", platforms: ["ebay"] }, loadProduct, poster });
  assert.strictEqual(out.status, 200);
  assert.strictEqual(out.json.live, false);
  assert.deepStrictEqual(poster.calls[0].options, { live: false });
});

test("post-to-platforms goes live only with confirmLive PUBLISH_LIVE", async () => {
  const poster = recordingPoster();
  const out = await postSavedProduct({ tenantId: "t1", body: { productSKU: "S1", platforms: ["ebay"], confirmLive: LIVE_CONFIRM }, loadProduct, poster });
  assert.strictEqual(out.json.live, true);
  assert.deepStrictEqual(poster.calls[0], { tenantId: "t1", sku: "S1", platforms: ["ebay"], options: { live: true } });
});

test("a truthy but wrong live flag stays a dry run", async () => {
  for (const body of [{ live: true }, { confirmLive: true }, { confirmLive: "yes" }, { confirmLive: "publish_live" }]) {
    const poster = recordingPoster();
    const out = await postSavedProduct({ tenantId: "t1", body: { productSKU: "S1", ...body }, loadProduct, poster });
    assert.strictEqual(out.json.live, false, JSON.stringify(body));
    assert.strictEqual(poster.calls[0].options.live, false);
  }
});

test("Shopify is retired: reported, never sent to the poster", async () => {
  const poster = recordingPoster();
  const out = await postSavedProduct({ tenantId: "t1", body: { productSKU: "S1", platforms: ["shopify", "ebay"], confirmLive: LIVE_CONFIRM }, loadProduct, poster });
  assert.deepStrictEqual(poster.calls[0].platforms, ["ebay"]);
  assert.strictEqual(out.json.results.shopify.success, false);
  assert.strictEqual(out.json.results.shopify.retired, true);
  const only = recordingPoster();
  const out2 = await postSavedProduct({ tenantId: "t1", body: { productSKU: "S1", platforms: ["shopify"] }, loadProduct, poster: only });
  assert.strictEqual(only.calls.length, 0);
  assert.strictEqual(out2.json.successCount, 0);
});

test("missing sku and unknown product are rejected before posting", async () => {
  const poster = recordingPoster();
  assert.strictEqual((await postSavedProduct({ tenantId: "t1", body: {}, loadProduct, poster })).status, 400);
  assert.strictEqual((await postSavedProduct({ tenantId: "t1", body: { productSKU: "nope" }, loadProduct: async () => null, poster })).status, 404);
  assert.strictEqual(poster.calls.length, 0);
});

test("live eBay through the real poster sends PUBLISH_LIVE to the connector (mocked, nothing posted)", async () => {
  const poster = new MultiPlatformPoster();
  const seen = [];
  poster.ebay = {
    _getAccessToken: async () => "tok",
    createListing: async (product, policies, opts) => { seen.push({ product, policies, opts }); return { ok: true, published: true, listingId: "MOCK1" }; },
  };
  poster.ebayInputs = { suggestCategoryId: async () => ({ categoryId: "183454" }), resolvePolicies: async () => ({ fulfillmentPolicyId: "f" }) };
  const out = await postSavedProduct({ tenantId: "t1", body: { productSKU: "S1", platforms: ["ebay"], confirmLive: LIVE_CONFIRM }, loadProduct, poster });
  assert.strictEqual(seen.length, 1);
  assert.deepStrictEqual(seen[0].opts, { tenantId: "t1", dryRun: false, confirm: "PUBLISH_LIVE" });
  assert.strictEqual(out.json.results.ebay.success, true);

  seen.length = 0;
  const dry = await postSavedProduct({ tenantId: "t1", body: { productSKU: "S1", platforms: ["ebay"] }, loadProduct, poster });
  assert.strictEqual(seen[0].opts.dryRun, true);
  assert.strictEqual(seen[0].opts.confirm, undefined);
  assert.strictEqual(dry.json.live, false);
});

test("Post and Add Product pages send confirmLive only on the live path, and offer no Shopify", () => {
  const fs = require("fs");
  const path = require("path");
  for (const rel of ["pages/post.js", "pages/inventory/add-product.js"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
    assert.match(src, /\.\.\.\(live \? \{ confirmLive: LIVE_CONFIRM \} : \{\}\)/, `${rel} must send confirmLive only when live`);
    assert.match(src, /window\.confirm\(/, `${rel} must ask before publishing live`);
    assert.doesNotMatch(src, /id: "shopify"/, `${rel} must not offer Shopify`);
  }
});
