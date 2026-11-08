const test = require("node:test");
const assert = require("node:assert");
const { readEbayStorefront, readFacebook, readInstagram, listInventorySkus, readOffers, readSold } = require("../lib/storefrontsRead");

const BASE = "https://api.ebay.com";
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const fail = (status, body) => ({ ok: false, status, json: async () => body });

// Fake eBay: serves `skus` in pages of 100 and offers per SKU; records every call.
function fakeEbay({ skus = [], total, offersBySku = {}, failSku = null, orderStatus = 200, orderBody = { orders: [] } } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, headers: opts?.headers || {} });
    if (url.includes("/inventory_item?")) {
      const offset = Number(new URL(url).searchParams.get("offset"));
      const items = skus.slice(offset, offset + 100).map((sku) => ({ sku }));
      return ok({ inventoryItems: items, total: total ?? skus.length });
    }
    if (url.includes("/offer?")) {
      const sku = new URL(url).searchParams.get("sku");
      if (sku === failSku) return fail(500, { errors: [{ message: "boom " + sku }] });
      return ok({ offers: offersBySku[sku] || [] });
    }
    if (url.includes("/fulfillment/v1/order")) {
      return orderStatus === 200 ? ok(orderBody) : fail(orderStatus, orderBody);
    }
    throw new Error("unexpected url " + url);
  };
  return { fetchImpl, calls };
}

test("listInventorySkus: reads every page, not only the first 100", async () => {
  const skus = Array.from({ length: 230 }, (_, i) => `SKU-${i}`);
  const { fetchImpl, calls } = fakeEbay({ skus });
  const r = await listInventorySkus(BASE, {}, fetchImpl);
  assert.strictEqual(r.skus.length, 230);
  assert.strictEqual(r.truncated, false);
  assert.strictEqual(calls.filter((c) => c.url.includes("/inventory_item?")).length, 3);
});

test("listInventorySkus: reports truncated when the safety cap is reached", async () => {
  const skus = Array.from({ length: 5100 }, (_, i) => `S${i}`);
  const { fetchImpl } = fakeEbay({ skus });
  const r = await listInventorySkus(BASE, {}, fetchImpl);
  assert.strictEqual(r.truncated, true);
  assert.strictEqual(r.skus.length, 5000);
});

test("listInventorySkus: an eBay error throws instead of returning an empty list", async () => {
  const fetchImpl = async () => fail(401, { errors: [{ message: "Invalid access token" }] });
  await assert.rejects(() => listInventorySkus(BASE, {}, fetchImpl), /Invalid access token/);
});

test("readOffers: one failing SKU is counted and does not hide the rest", async () => {
  const offersBySku = { A: [{ offerId: "1", sku: "A", status: "PUBLISHED" }], C: [{ offerId: "3", sku: "C", status: "UNPUBLISHED" }] };
  const { fetchImpl } = fakeEbay({ offersBySku, failSku: "B" });
  const r = await readOffers(["A", "B", "C"], BASE, {}, fetchImpl);
  assert.strictEqual(r.unreadable, 1);
  assert.deepStrictEqual(r.offers.map((o) => o.sku).sort(), ["A", "C"]);
});

test("readEbayStorefront: splits active and drafts and reports the unreadable count", async () => {
  const skus = ["A", "B", "C"];
  const offersBySku = {
    A: [{ offerId: "1", sku: "A", status: "PUBLISHED", pricingSummary: { price: { value: "4.99" } }, listing: { listingId: "99" } }],
    B: [{ offerId: "2", sku: "B", status: "UNPUBLISHED" }],
  };
  const { fetchImpl } = fakeEbay({ skus, offersBySku, failSku: "C" });
  const r = await readEbayStorefront({ accessToken: "tok", base: BASE, fetchImpl });
  assert.strictEqual(r.connected, true);
  assert.strictEqual(r.active.length, 1);
  assert.strictEqual(r.active[0].url, "https://www.ebay.com/itm/99");
  assert.strictEqual(r.drafts.length, 1);
  assert.strictEqual(r.unreadable, 1);
  assert.strictEqual(r.truncated, false);
});

test("readEbayStorefront: sends the token in the Authorization header", async () => {
  const { fetchImpl, calls } = fakeEbay({ skus: [] });
  await readEbayStorefront({ accessToken: "SECRET-TOKEN", base: BASE, fetchImpl });
  assert.ok(calls.length > 0);
  for (const c of calls) assert.strictEqual(c.headers.Authorization, "Bearer SECRET-TOKEN");
  for (const c of calls) assert.ok(!c.url.includes("SECRET-TOKEN"));
});

test("readSold: a permission error gives the order-read note", async () => {
  const { fetchImpl } = fakeEbay({ orderStatus: 403, orderBody: { errors: [{ message: "insufficient scope" }] } });
  const r = await readSold(BASE, {}, fetchImpl);
  assert.strictEqual(r.available, false);
  assert.match(r.note, /order-read permission/);
});

test("readSold: any other failure does not claim a permission problem", async () => {
  const { fetchImpl } = fakeEbay({ orderStatus: 500, orderBody: { errors: [{ message: "upstream timeout" }] } });
  const r = await readSold(BASE, {}, fetchImpl);
  assert.strictEqual(r.available, false);
  assert.doesNotMatch(r.note, /permission/);
});

test("readSold: returns orders when the read works", async () => {
  const body = { orders: [{ orderId: "O1", pricingSummary: { total: { value: "9.99" } }, orderFulfillmentStatus: "FULFILLED", lineItems: [{ title: "Book" }] }] };
  const { fetchImpl } = fakeEbay({ orderBody: body });
  const r = await readSold(BASE, {}, fetchImpl);
  assert.strictEqual(r.available, true);
  assert.deepStrictEqual(r.orders, [{ orderId: "O1", total: "9.99", status: "FULFILLED", items: ["Book"] }]);
});

test("readFacebook: token goes in headers and never in the URL", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, headers: opts?.headers || {} });
    if (url.endsWith("?fields=name,link,access_token")) return ok({ name: "Jardin", link: "https://fb", access_token: "PAGE-TOKEN" });
    return ok({ data: [{ id: "p1", message: "hi", created_time: "2026-11-06", permalink_url: "x", full_picture: "img" }] });
  };
  const r = await readFacebook({ pageId: "123", token: "USER-TOKEN", fetchImpl });
  assert.strictEqual(r.connected, true);
  assert.strictEqual(r.posts.length, 1);
  assert.strictEqual(calls[0].headers.Authorization, "Bearer USER-TOKEN");
  assert.strictEqual(calls[1].headers.Authorization, "Bearer PAGE-TOKEN");
  for (const c of calls) assert.ok(!c.url.includes("access_token="), "no access_token in query string");
});

test("readFacebook: a Meta error reports not connected with a generic message", async () => {
  const fetchImpl = async () => fail(400, { error: { message: "Invalid OAuth access token USER-TOKEN" } });
  const r = await readFacebook({ pageId: "123", token: "USER-TOKEN", fetchImpl });
  assert.strictEqual(r.connected, false);
  assert.strictEqual(r.error, "Facebook Page check failed");
  assert.ok(!JSON.stringify(r).includes("USER-TOKEN"));
});

test("readInstagram: token goes in headers and a missing token is not connected", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, headers: opts?.headers || {} });
    if (url.includes("/me?")) return ok({ username: "jardinsoutpost" });
    return ok({ data: [] });
  };
  const r = await readInstagram({ token: "IG-TOKEN", fetchImpl });
  assert.strictEqual(r.username, "jardinsoutpost");
  for (const c of calls) {
    assert.strictEqual(c.headers.Authorization, "Bearer IG-TOKEN");
    assert.ok(!c.url.includes("IG-TOKEN"));
  }
  assert.deepStrictEqual(await readInstagram({ token: "", fetchImpl }), { connected: false });
});
