const test = require("node:test");
const assert = require("node:assert");
const { postPhotoByUrl, itemPostCaption, PUBLISH_CONFIRM, clearFacebookPageTokenCache } = require("../lib/socialMediaPosters");

const ENV = { IG_ACCESS_TOKEN: "ig-secret-token", FB_ACCESS_TOKEN: "fb-secret-token", FB_PAGE_ID: "1315311881667461" };
const IMG = "https://i.ebayimg.com/images/g/abc/s-l1600.jpg";
const PAGE_LOOKUP = "https://graph.facebook.com/v25.0/1315311881667461?fields=access_token";

test.beforeEach(() => clearFacebookPageTokenCache());

function fakeFetch(answers) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    const auth = opts.headers && opts.headers.Authorization;
    calls.push({ url: String(url), method: opts.method || "GET", auth, body: opts.body ? JSON.parse(opts.body) : null });
    const next = answers.shift();
    if (!next) throw new Error(`unexpected call to ${url}`);
    return { ok: next.status < 300, status: next.status, json: async () => next.body };
  };
  fn.calls = calls;
  return fn;
}

const LIVE = { live: true, confirm: PUBLISH_CONFIRM, pollMs: 0 };

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

test("facebook live: a system-user token is swapped for the Page token, then one photo post on the Page", async () => {
  const f = fakeFetch([
    { status: 200, body: { access_token: "page-token", id: "1315311881667461" } },
    { status: 200, body: { id: "111", post_id: "1315311881667461_222" } },
  ]);
  const r = await postPhotoByUrl("facebook", { imageUrl: IMG, caption: "Hi" }, { env: ENV, fetchImpl: f, ...LIVE });
  assert.strictEqual(r.success, true);
  assert.strictEqual(f.calls[0].url, PAGE_LOOKUP);
  assert.strictEqual(f.calls[0].auth, "Bearer fb-secret-token");
  assert.strictEqual(f.calls[1].url, "https://graph.facebook.com/v25.0/1315311881667461/photos");
  assert.strictEqual(f.calls[1].auth, "Bearer page-token");
  assert.deepStrictEqual(f.calls[1].body, { url: IMG, caption: "Hi" });
  assert.strictEqual(r.url, "https://www.facebook.com/1315311881667461_222");
  assert.doesNotMatch(JSON.stringify(r), /page-token|fb-secret-token/);
});

test("facebook live: the Page token is looked up once and reused", async () => {
  const f = fakeFetch([
    { status: 200, body: { access_token: "page-token" } },
    { status: 200, body: { id: "111" } },
    { status: 200, body: { id: "112" } },
  ]);
  await postPhotoByUrl("facebook", { imageUrl: IMG, caption: "One" }, { env: ENV, fetchImpl: f, ...LIVE });
  const r = await postPhotoByUrl("facebook", { imageUrl: IMG, caption: "Two" }, { env: ENV, fetchImpl: f, ...LIVE });
  assert.strictEqual(r.success, true);
  assert.strictEqual(f.calls.length, 3);
  assert.strictEqual(f.calls[2].auth, "Bearer page-token");
});

test("facebook live: a Page token supplied directly still works when the lookup returns nothing", async () => {
  const f = fakeFetch([
    { status: 400, body: { error: { message: "(#100) Tried accessing nonexisting field (access_token)" } } },
    { status: 200, body: { id: "111" } },
  ]);
  const r = await postPhotoByUrl("facebook", { imageUrl: IMG, caption: "Hi" }, { env: ENV, fetchImpl: f, ...LIVE });
  assert.strictEqual(r.success, true);
  assert.strictEqual(f.calls[1].auth, "Bearer fb-secret-token");
});

test("instagram live: create container, wait until finished, then publish", async () => {
  const f = fakeFetch([
    { status: 200, body: { id: "c1" } },
    { status: 200, body: { status_code: "IN_PROGRESS" } },
    { status: 200, body: { status_code: "FINISHED" } },
    { status: 200, body: { id: "m1" } },
    { status: 200, body: { permalink: "https://www.instagram.com/p/xyz/" } },
  ]);
  const r = await postPhotoByUrl("instagram", { imageUrl: IMG, caption: "Hi" }, { env: ENV, fetchImpl: f, ...LIVE });
  assert.strictEqual(r.success, true);
  assert.deepStrictEqual(f.calls[0].body, { image_url: IMG, caption: "Hi" });
  assert.match(f.calls[1].url, /\/c1\?fields=status_code/);
  assert.deepStrictEqual(f.calls[3].body, { creation_id: "c1" });
  assert.strictEqual(r.mediaId, "m1");
  assert.strictEqual(r.url, "https://www.instagram.com/p/xyz/");
});

test("instagram live: a processing error stops before publishing", async () => {
  const f = fakeFetch([
    { status: 200, body: { id: "c1" } },
    { status: 200, body: { status_code: "ERROR", status: "bad image" } },
  ]);
  const r = await postPhotoByUrl("instagram", { imageUrl: IMG, caption: "Hi" }, { env: ENV, fetchImpl: f, ...LIVE });
  assert.strictEqual(r.success, false);
  assert.match(r.error, /could not process the photo \(bad image\)/);
  assert.ok(!f.calls.some((c) => c.url.includes("media_publish")));
});

test("instagram live: gives up after the wait limit instead of publishing blind", async () => {
  const f = fakeFetch([
    { status: 200, body: { id: "c1" } },
    { status: 200, body: { status_code: "IN_PROGRESS" } },
    { status: 200, body: { status_code: "IN_PROGRESS" } },
  ]);
  const r = await postPhotoByUrl("instagram", { imageUrl: IMG, caption: "Hi" }, { env: ENV, fetchImpl: f, ...LIVE, maxPolls: 2 });
  assert.strictEqual(r.success, false);
  assert.match(r.error, /still processing the photo; nothing was published/);
  assert.ok(!f.calls.some((c) => c.url.includes("media_publish")));
});

test("a platform error comes back as a failure, never a throw", async () => {
  const f = fakeFetch([
    { status: 200, body: { access_token: "page-token" } },
    { status: 400, body: { error: { message: "Invalid image" } } },
  ]);
  const r = await postPhotoByUrl("facebook", { imageUrl: IMG, caption: "Hi" }, { env: ENV, fetchImpl: f, ...LIVE });
  assert.strictEqual(r.success, false);
  assert.match(r.error, /Invalid image/);
});

test("a non-public image address is refused before anything is sent", async () => {
  const f = fakeFetch([]);
  const r = await postPhotoByUrl("facebook", { imageUrl: "http://localhost/x.jpg", caption: "Hi" }, { env: ENV, fetchImpl: f, ...LIVE });
  assert.strictEqual(r.success, false);
  assert.strictEqual(f.calls.length, 0);
});