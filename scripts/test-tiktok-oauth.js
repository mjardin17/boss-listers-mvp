const test = require("node:test");
const assert = require("node:assert");

process.env.TIKTOK_CLIENT_KEY = "awtestclientkey";
process.env.TIKTOK_CLIENT_SECRET = "tiktok-client-secret";
process.env.APP_URL = "https://app.example.com";
delete require.cache[require.resolve("../lib/socialMediaAuth")];
const { getAuthorizationUrl, getAccessToken, refreshAccessToken, tokenResult } = require("../lib/socialMediaAuth");

test("Connect TikTok opens TikTok's v2 consent screen with client_key and comma scopes", () => {
  const u = new URL(getAuthorizationUrl("tiktok", "state123.user1"));
  assert.strictEqual(u.origin + u.pathname, "https://www.tiktok.com/v2/auth/authorize/");
  assert.strictEqual(u.searchParams.get("client_key"), "awtestclientkey");
  assert.strictEqual(u.searchParams.get("client_id"), null);
  assert.strictEqual(u.searchParams.get("scope"), "user.info.basic,video.publish");
  assert.strictEqual(u.searchParams.get("redirect_uri"), "https://app.example.com/api/oauth/tiktok/callback");
  assert.strictEqual(u.searchParams.get("response_type"), "code");
  assert.strictEqual(u.searchParams.get("state"), "state123.user1");
  assert.doesNotMatch(u.toString(), /tiktok-client-secret/);
});

test("other platforms still send client_id", () => {
  process.env.INSTAGRAM_CLIENT_ID = "ig";
  const u = new URL(getAuthorizationUrl("youtube", "s"));
  assert.ok(u.searchParams.has("client_id"));
});

function withFetch(answer, fn) {
  const real = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => { calls.push({ url: String(url), body: new URLSearchParams(opts.body) }); return { ok: answer.status < 300, status: answer.status, json: async () => answer.body }; };
  return fn(calls).finally(() => { global.fetch = real; });
}

test("code exchange posts to TikTok's v2 token endpoint and keeps open_id and scopes", () =>
  withFetch({ status: 200, body: { access_token: "act.1", refresh_token: "rft.1", expires_in: 86400, open_id: "oid", scope: "user.info.basic,video.publish" } }, async (calls) => {
    const t = await getAccessToken("tiktok", "the-code");
    assert.strictEqual(calls[0].url, "https://open.tiktokapis.com/v2/oauth/token/");
    assert.strictEqual(calls[0].body.get("client_key"), "awtestclientkey");
    assert.strictEqual(calls[0].body.get("grant_type"), "authorization_code");
    assert.strictEqual(t.accessToken, "act.1");
    assert.strictEqual(t.openId, "oid");
    assert.deepStrictEqual(t.scopes, ["user.info.basic", "video.publish"]);
    assert.ok(t.expiresAt > Date.now());
  }));

test("a TikTok error answered with HTTP 200 is still an error", () =>
  withFetch({ status: 200, body: { error: "invalid_grant", error_description: "Authorization code is expired." } }, async () => {
    await assert.rejects(getAccessToken("tiktok", "old"), /Authorization code is expired/);
  }));

test("refresh keeps the old refresh token when TikTok doesn't send a new one", () =>
  withFetch({ status: 200, body: { access_token: "act.2", expires_in: 86400 } }, async (calls) => {
    const t = await refreshAccessToken("tiktok", "rft.old");
    assert.strictEqual(calls[0].body.get("grant_type"), "refresh_token");
    assert.strictEqual(t.refreshToken, "rft.old");
  }));

test("a token answer without expires_in gives no expiry rather than NaN", () => {
  assert.strictEqual(tokenResult("x", { access_token: "a" }).expiresAt, null);
});
