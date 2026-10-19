const test = require("node:test");
const assert = require("node:assert");
const { classify, inspectMetaToken, refreshInstagramToken, exchangeFacebookPageToken, checkAll } = require("../lib/metaTokenHealth");

const DAY = 86400;
const nowSec = () => Math.floor(Date.now() / 1000);
const jsonRes = (body) => ({ ok: true, json: async () => body });

test("classify: expired, invalid, expiring and ok", () => {
  assert.strictEqual(classify({ valid: false, expired: true }), "expired");
  assert.strictEqual(classify({ valid: false, expired: false }), "invalid");
  assert.strictEqual(classify({ valid: true, daysLeft: 3 }), "expiring");
  assert.strictEqual(classify({ valid: true, daysLeft: 40 }), "ok");
  assert.strictEqual(classify({ valid: true, daysLeft: null }), "ok"); // never-expiring page token
});

test("inspectMetaToken: never-expiring token (expires_at 0) has null daysLeft", async () => {
  const f = async () => jsonRes({ data: { is_valid: true, type: "PAGE", expires_at: 0 } });
  const r = await inspectMetaToken({ token: "t", appId: "1", appSecret: "s", fetchImpl: f });
  assert.deepStrictEqual([r.valid, r.type, r.daysLeft], [true, "PAGE", null]);
});

test("inspectMetaToken: expired token reports expired and never leaks the token", async () => {
  const f = async () => jsonRes({ data: { is_valid: false, expires_at: nowSec() - 100, error: { message: "Session has expired" } } });
  const r = await inspectMetaToken({ token: "SECRET123", appId: "1", appSecret: "s", fetchImpl: f });
  assert.strictEqual(r.expired, true);
  assert.ok(!JSON.stringify(r).includes("SECRET123"));
});

test("inspectMetaToken: counts days left on a valid expiring token", async () => {
  const f = async () => jsonRes({ data: { is_valid: true, type: "USER", expires_at: nowSec() + 10 * DAY } });
  const r = await inspectMetaToken({ token: "t", appId: "1", appSecret: "s", fetchImpl: f });
  assert.ok(r.daysLeft >= 9 && r.daysLeft <= 10);
});

test("inspectMetaToken: missing credentials returns a clear error instead of throwing", async () => {
  const r = await inspectMetaToken({ token: "", appId: "1", appSecret: "s", fetchImpl: async () => { throw new Error("no call"); } });
  assert.strictEqual(r.valid, false);
  assert.match(r.error, /missing/i);
});

test("inspectMetaToken: network failure is reported, not thrown", async () => {
  const r = await inspectMetaToken({ token: "t", appId: "1", appSecret: "s", fetchImpl: async () => { throw new Error("offline"); } });
  assert.strictEqual(r.valid, false);
  assert.match(r.error, /offline/);
});

test("refreshInstagramToken: returns the new token and lifetime", async () => {
  const f = async (url) => { assert.match(url, /refresh_access_token/); return jsonRes({ access_token: "NEW", expires_in: 5184000 }); };
  const r = await refreshInstagramToken("OLD", f);
  assert.deepStrictEqual([r.ok, r.token, r.expiresInDays], [true, "NEW", 60]);
});

test("refreshInstagramToken: Meta error becomes ok:false", async () => {
  const f = async () => jsonRes({ error: { message: "Cannot refresh" } });
  const r = await refreshInstagramToken("OLD", f);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /Cannot refresh/);
});

test("checkAll: reports facebook and instagram with status", async () => {
  const f = async (url) => {
    if (url.includes("debug_token")) return jsonRes({ data: { is_valid: false, expires_at: nowSec() - 5 } });
    return jsonRes({ data: {} });
  };
  const env = { FB_ACCESS_TOKEN: "a", FB_APP_ID: "1", FB_APP_SECRET: "s", IG_ACCESS_TOKEN: "b" };
  const out = await checkAll(env, f);
  assert.deepStrictEqual(out.map((x) => x.platform), ["facebook", "instagram"]);
  assert.strictEqual(out[0].status, "expired");
});

test("exchangeFacebookPageToken: swaps a user token for the never-expiring Page token", async () => {
  const f = async (url) => {
    if (url.includes("fb_exchange_token")) return jsonRes({ access_token: "LONG_USER" });
    assert.match(url, /me\/accounts/);
    assert.match(url, /access_token=LONG_USER/);
    return jsonRes({ data: [{ id: "111", access_token: "OTHER_PAGE" }, { id: "222", access_token: "PAGE_TOKEN" }] });
  };
  const r = await exchangeFacebookPageToken({ userToken: "SHORT", appId: "1", appSecret: "s", pageId: "222", fetchImpl: f });
  assert.deepStrictEqual([r.ok, r.token], [true, "PAGE_TOKEN"]);
});

test("exchangeFacebookPageToken: configured Page not in the account list is an error", async () => {
  const f = async (url) => url.includes("fb_exchange_token")
    ? jsonRes({ access_token: "LONG_USER" })
    : jsonRes({ data: [{ id: "111", access_token: "X" }] });
  const r = await exchangeFacebookPageToken({ userToken: "SHORT", appId: "1", appSecret: "s", pageId: "222", fetchImpl: f });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /222/);
});

test("exchangeFacebookPageToken: Meta rejecting the exchange becomes ok:false", async () => {
  const f = async () => jsonRes({ error: { message: "Session has expired" } });
  const r = await exchangeFacebookPageToken({ userToken: "SHORT", appId: "1", appSecret: "s", pageId: "222", fetchImpl: f });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /Session has expired/);
});

test("exchangeFacebookPageToken: missing inputs fail without calling Meta", async () => {
  const f = async () => { throw new Error("should not be called"); };
  const r = await exchangeFacebookPageToken({ userToken: "", appId: "1", appSecret: "s", pageId: "222", fetchImpl: f });
  assert.strictEqual(r.ok, false);
});
