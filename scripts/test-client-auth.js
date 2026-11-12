const test = require("node:test");
const assert = require("node:assert");

// clientAuth runs in the browser; give it a small fake window, localStorage and fetch.
function setup({ session, responses }) {
  const store = new Map();
  if (session) store.set("boss_auth_session", JSON.stringify(session));
  global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  global.window = { location: { href: "/storefronts" } };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), auth: options.headers?.Authorization, body: options.body });
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch: " + url);
    return { status: next.status, ok: next.status < 400, json: async () => next.body, clone() { return this; } };
  };
  delete require.cache[require.resolve("../lib/clientAuth")];
  return { auth: require("../lib/clientAuth"), calls, saved: () => JSON.parse(store.get("boss_auth_session") || "null") };
}
const SESSION = { accessToken: "old", refreshToken: "r1", email: "owner@example.com" };

test("an expired login is renewed once and the request is retried, with no trip to the login page", async () => {
  const { auth, calls, saved } = setup({
    session: SESSION,
    responses: [
      { status: 401, body: { ok: false, error: "Unauthorized" } },
      { status: 200, body: { access_token: "new", refresh_token: "r2" } },
      { status: 200, body: { ok: true } },
    ],
  });
  const res = await auth.authedFetch("/api/storefronts");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(calls[0].auth, "Bearer old");
  assert.match(calls[1].url, /^https:\/\/proj\.supabase\.co\/auth\/v1\/token\?grant_type=refresh_token$/);
  assert.deepStrictEqual(JSON.parse(calls[1].body), { refresh_token: "r1" });
  assert.strictEqual(calls[2].auth, "Bearer new");
  assert.deepStrictEqual(saved(), { accessToken: "new", refreshToken: "r2", email: "owner@example.com" });
  assert.strictEqual(global.window.location.href, "/storefronts");
});

test("if the renewal is refused, the session is cleared and the login page opens", async () => {
  const { auth, saved } = setup({
    session: SESSION,
    responses: [{ status: 401, body: { error: "Unauthorized" } }, { status: 400, body: { error: "invalid_grant" } }],
  });
  const res = await auth.authedFetch("/api/storefronts");
  assert.strictEqual(res.status, 401);
  assert.strictEqual(saved(), null);
  assert.strictEqual(global.window.location.href, "/login");
});

test("with no saved renewal token it goes straight to the login page", async () => {
  const { auth, calls } = setup({ session: { accessToken: "old" }, responses: [{ status: 401, body: { error: "Unauthorized" } }] });
  await auth.authedFetch("/api/storefronts");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(global.window.location.href, "/login");
});

test("several requests failing together share one renewal (the token can only be used once)", async () => {
  const { auth, calls } = setup({
    session: SESSION,
    responses: [
      { status: 401, body: { error: "Unauthorized" } },
      { status: 401, body: { error: "Unauthorized" } },
      { status: 200, body: { access_token: "new", refresh_token: "r2" } },
      { status: 200, body: { ok: true } },
      { status: 200, body: { ok: true } },
    ],
  });
  const [a, b] = await Promise.all([auth.authedFetch("/api/a"), auth.authedFetch("/api/b")]);
  assert.strictEqual(a.status, 200);
  assert.strictEqual(b.status, 200);
  assert.strictEqual(calls.filter((c) => c.url.includes("grant_type=refresh_token")).length, 1);
});

test("a 'no tenant' 401 is still left alone: no renewal, no logout", async () => {
  const { auth, calls, saved } = setup({ session: SESSION, responses: [{ status: 401, body: { error: "Invalid session or no tenant" } }] });
  const res = await auth.authedFetch("/api/x");
  assert.strictEqual(res.status, 401);
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(saved(), SESSION);
});

test("a still-failing retry after a good renewal logs out instead of looping", async () => {
  const { auth, calls } = setup({
    session: SESSION,
    responses: [
      { status: 401, body: { error: "Unauthorized" } },
      { status: 200, body: { access_token: "new", refresh_token: "r2" } },
      { status: 401, body: { error: "Unauthorized" } },
    ],
  });
  const res = await auth.authedFetch("/api/x");
  assert.strictEqual(res.status, 401);
  assert.strictEqual(calls.length, 3);
  assert.strictEqual(global.window.location.href, "/login");
});
