const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Load public/sw.js the way a browser would: as a script with a `self`, no modules.
function loadWorker() {
  const listeners = {};
  const sandbox = { self: { addEventListener: (name, fn) => { listeners[name] = fn; }, location: { origin: "http://localhost:3001" }, skipWaiting() {}, clients: { claim() {} } }, caches: {}, URL, fetch: () => {}, Promise };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "public", "sw.js"), "utf8"), sandbox);
  return { sandbox, listeners };
}

test("only files with a content hash in their name are kept in the offline cache", () => {
  const { sandbox } = loadWorker();
  const keep = sandbox.isImmutableAsset;
  // Production build: hashed, never changes under the same name.
  assert.strictEqual(keep("/_next/static/chunks/webpack-4e7214a60fad8e88.js"), true);
  assert.strictEqual(keep("/_next/static/chunks/pages/login-1f0c2d3a4b5c6d7e.js"), true);
  assert.strictEqual(keep("/_next/static/css/9a8b7c6d5e4f3a2b.css"), true);
  assert.strictEqual(keep("/_next/static/media/logo.0a1b2c3d.png"), true);
  // Development server: the same name is rewritten on every change, so it must never be cached.
  assert.strictEqual(keep("/_next/static/chunks/webpack.js"), false);
  assert.strictEqual(keep("/_next/static/chunks/main.js"), false);
  assert.strictEqual(keep("/_next/static/chunks/pages/login.js"), false);
  assert.strictEqual(keep("/_next/static/chunks/react-refresh.js"), false);
  assert.strictEqual(keep("/_next/static/development/_buildManifest.js"), false);
  assert.strictEqual(keep("/_next/static/development/_devPagesManifest.json"), false);
  assert.strictEqual(keep("/_next/static/webpack/b14300eac77590d2.webpack.hot-update.json"), false);
  assert.strictEqual(keep("/_next/static/webpack/webpack.b14300eac77590d2.hot-update.js"), false);
});

test("a development file is left to the network: the worker does not answer for it", () => {
  const { listeners } = loadWorker();
  let answered = false;
  listeners.fetch({ request: { method: "GET", mode: "no-cors", url: "http://localhost:3001/_next/static/chunks/webpack.js" }, respondWith() { answered = true; } });
  assert.strictEqual(answered, false);
});

test("the cache name changed, so the old cache full of stale development files is thrown away", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "public", "sw.js"), "utf8");
  const name = /const CACHE_NAME = "([^"]+)"/.exec(source)[1];
  assert.notStrictEqual(name, "boss-listers-v2");
});
