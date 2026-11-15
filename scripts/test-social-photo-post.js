const test = require("node:test");
const assert = require("node:assert");
const { postPhotoByUrl, itemPostCaption, PUBLISH_CONFIRM } = require("../lib/socialMediaPosters");

const ENV = { IG_ACCESS_TOKEN: "ig-secret-token", FB_ACCESS_TOKEN: "fb-secret-token", FB_PAGE_ID: "1315311881667461" };
const IMG = "https://i.ebayimg.com/images/g/abc/s-l1600.jpg";

function fakeFetch(answers) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
    const next = answers.shift();
    if (!next) throw new Error(`unexpected call to ${url}`);
    return { ok: next.status < 300, status: next.status, json: async () => next.body };
  };
  fn.calls = calls;
  return fn;
}

test("caption: title, price, real shipping and a link to the item on the store", () => {
  const c = itemPostCaption({ title: "Bluey Cars Set", price: 15.99, shipping_cost: 7.99, slug: "bluey-cars" }, "https://jardinsoutpost.pages.dev");
  assert.match(c, /Bluey Cars Set/);
  assert.match(c, /\$15\.99/);
  assert.match(c, /\+ \$7\.99 shipping/);
  assert.match(c, /https:\/\/jardinsoutpost\.pages\.dev\/product\/bluey-cars/);
  assert.doesNotMatch(c, /free/i);
});

test("caption: no fixed shipping price never says free", () => {
  const c = itemPostCaption({ title: "Socks", price: 19.99, shipping_cost: null, slug: "socks" }, "https://jardinsoutpost.pages.dev");
  assert.match(c, /shipping calculated at checkout/i);
  assert.doesNotMatch(c, /free/i);
});

test("preview by default: nothing is sent", async () => {
  const f = fakeFetch([]);
  const r = await postPhotoByUrl("facebook", { imageUrl: IMG, caption: "Hi" }, { env: ENV, fetchImpl: f });
  assert.strictEqual(r.dryRun, true);
  assert.strictEqual(r.success, false);
  assert.strictEqual(f.calls.length, 0);
});

test("live without the confirm word still sends nothing", async () => {
  const f = fakeFetch([]);
  const r = await postPhotoByUrl("instagram", { imageUrl: IMG, caption: "Hi" }, { env: ENV, fetchImpl: f, live: true });
  assert.strictEqual(r.dryRun, true);
  assert.strictEqual(f.calls.length, 0);
});

test("facebook live: one photo post on the Page", async () => {
  const f = fakeFetch([{ status: 200, body: { id: "111", post_id: "1315311881667461_222" } }]);
  const r = await postPhotoByUrl("facebook", { imageUrl: IMG, caption: "Hi" }, { env: ENV, fetchImpl: f, live: true, confirm: PUBLISH_CONFIRM });
  assert.strictEqual(r.success, true);
  assert.strictEqual(f.calls[0].url, "https://graph.facebook.com/v25.0/1315311881667461/photos");
  assert.deepStrictEqual(f.calls[0].body, { url: IMG, caption: "Hi" });
  assert.strictEqual(r.url, "https://www.facebook.com/1315311881667461_222");
});

test("instagram live: create container, then publish", async () => {
  const f = fakeFetch([
    { status: 200, body: { id: "c1" } },
    { status: 200, body: { id: "m1" } },
    { status: 200, body: { permalink: "https://www.instagram.com/p/xyz/" } },
  ]);
  const r = await postPhotoByUrl("instagram", { imageUrl: IMG, caption: "Hi" }, { env: ENV, fetchImpl: f, live: true, confirm: PUBLISH_CONFIRM });
  assert.strictEqual(r.success, true);
  assert.deepStrictEqual(f.calls[0].body, { image_url: IMG, caption: "Hi" });
  assert.deepStrictEqual(f.calls[1].body, { creation_id: "c1" });
  assert.strictEqual(r.url, "https://www.instagram.com/p/xyz/");
});

test("a platform error comes back as a failure, never a throw", async () => {
  const f = fakeFetch([{ status: 400, body: { error: { message: "Invalid image" } } }]);
  const r = await postPhotoByUrl("facebook", { imageUrl: IMG, caption: "Hi" }, { env: ENV, fetchImpl: f, live: true, confirm: PUBLISH_CONFIRM });
  assert.strictEqual(r.success, false);
  assert.match(r.error, /Invalid image/);
});

test("a non-public image address is refused before anything is sent", async () => {
  const f = fakeFetch([]);
  const r = await postPhotoByUrl("facebook", { imageUrl: "http://localhost/x.jpg", caption: "Hi" }, { env: ENV, fetchImpl: f, live: true, confirm: PUBLISH_CONFIRM });
  assert.strictEqual(r.success, false);
  assert.strictEqual(f.calls.length, 0);
});
