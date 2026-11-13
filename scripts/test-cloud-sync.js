const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { pathToFileURL } = require("url");
const { execFileSync } = require("child_process");
const { XMLParser } = require("fast-xml-parser");

const dir = path.join(__dirname, "..", "supabase", "functions", "ebay-sync");
const load = (name) => import(pathToFileURL(path.join(dir, name)).href);
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", isArray: (name) => name === "Item" });
const ENV = { supabaseUrl: "https://proj.supabase.co", serviceKey: "service", ebayClientId: "id", ebayClientSecret: "secret" };
const CONFIG = { ownerTenantId: "tenant-1", digitalSkus: ["EBOOK"], ebayWritesEnabled: false };
const reply = (status, body) => ({ ok: status < 400, status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)), json: async () => body });

// A fake world: eBay's live list, what GetItem says about each listing, and the BossListers products.
function world({ live = {}, items = {}, products = [], ebayFails = false, rpc = () => [{ applied: true }], lastRun = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url);
    const call = opts.headers && opts.headers["X-EBAY-API-CALL-NAME"];
    calls.push({ url: u, call, body: opts.body });
    if (u.includes("/identity/v1/oauth2/token")) return reply(200, { access_token: "access" });
    if (u.endsWith("/rpc/get_decrypted_marketplace_token")) return reply(200, JSON.stringify("refresh"));
    if (u.includes("/rest/v1/products")) return reply(200, products);
    if (u.endsWith("/rpc/set_inventory_count")) return reply(200, rpc(JSON.parse(opts.body)));
    if (u.includes("/rest/v1/sync_logs?select=")) return reply(200, lastRun ? [{ started_at: lastRun }] : []);
    if (u.endsWith("/rest/v1/sync_logs")) return reply(201, "");
    if (call === "GetMyeBaySelling") {
      if (ebayFails) return reply(200, "<GetMyeBaySellingResponse><Ack>Failure</Ack></GetMyeBaySellingResponse>");
      const xml = Object.entries(live).map(([id, [qty, sold]]) => `<Item><ItemID>${id}</ItemID><Quantity>${qty}</Quantity><SellingStatus><QuantitySold>${sold}</QuantitySold></SellingStatus></Item>`).join("");
      return reply(200, `<GetMyeBaySellingResponse><Ack>Success</Ack><ActiveList><ItemArray>${xml}</ItemArray><PaginationResult><TotalNumberOfPages>1</TotalNumberOfPages></PaginationResult></ActiveList></GetMyeBaySellingResponse>`);
    }
    if (call === "GetItem") {
      const id = /<ItemID>(\d+)<\/ItemID>/.exec(opts.body)[1];
      const [status, qty, sold] = items[id] || ["Active", 1, 0];
      return reply(200, `<GetItemResponse><Ack>Success</Ack><Item><ItemID>${id}</ItemID><Quantity>${qty}</Quantity><SellingStatus><ListingStatus>${status}</ListingStatus><QuantitySold>${sold}</QuantitySold></SellingStatus></Item></GetItemResponse>`);
    }
    if (call === "ReviseInventoryStatus") return reply(200, "<ReviseInventoryStatusResponse><Ack>Success</Ack></ReviseInventoryStatusResponse>");
    if (call === "EndFixedPriceItem") return reply(200, "<EndFixedPriceItemResponse><Ack>Success</Ack></EndFixedPriceItemResponse>");
    throw new Error("unexpected call: " + u + " " + call);
  };
  return { fetchImpl, calls };
}
const product = (sku, listingId, quantity, base = quantity) => ({ id: sku, sku, quantity, status: quantity > 0 ? "active" : "out_of_stock", ebay_listing_id: listingId, last_ebay_quantity: base });

async function run(w, config = CONFIG, env = ENV) {
  const { runSync } = await load("core.mjs");
  const planner = await load("plan.mjs");
  return runSync({ fetchImpl: w.fetchImpl, parseXml: (t) => parser.parse(t), env, config, planner });
}
const many = (n) => Array.from({ length: n }, (_, i) => product(`keep-${i}`, String(1000 + i), 1));
const manyLive = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(1000 + i), [1, 0]]));

test("the generated cloud files match their sources", () => {
  execFileSync(process.execPath, [path.join(__dirname, "build-cloud-sync.js"), "--check"], { stdio: "pipe" });
});

test("a listing eBay confirms as sold goes to 0; nothing else is touched", async () => {
  const w = world({
    live: manyLive(20),
    items: { 555: ["Completed", 1, 1] },
    products: [...many(20), product("sold-one", "555", 1), product("EBOOK", "777", 1)],
  });
  const out = await run(w);
  assert.strictEqual(out.status, "success");
  assert.strictEqual(out.ebayLive, 20);
  assert.deepStrictEqual(out.applied, [{ sku: "sold-one", from: 1, to: 0 }]);
  const rpcCalls = w.calls.filter((c) => c.url.endsWith("/rpc/set_inventory_count"));
  assert.strictEqual(rpcCalls.length, 1);
  assert.strictEqual(JSON.parse(rpcCalls[0].body).p_tenant_id, "tenant-1");
  assert.strictEqual(w.calls.filter((c) => c.call === "ReviseInventoryStatus" || c.call === "EndFixedPriceItem").length, 0);
});

test("a listing missing from the list but still active on eBay is left alone and reported", async () => {
  const w = world({ live: manyLive(20), items: { 555: ["Active", 1, 0] }, products: [...many(20), product("missing", "555", 1)] });
  const out = await run(w);
  assert.deepStrictEqual(out.applied, []);
  assert.strictEqual(out.held.length, 1);
  assert.match(out.held[0].reason, /active/);
});

test("an empty eBay read changes nothing", async () => {
  const w = world({ live: {}, products: many(20) });
  const out = await run(w);
  assert.match(out.blocked, /no listings/);
  assert.strictEqual(out.status, "failed");
  assert.strictEqual(w.calls.filter((c) => c.url.endsWith("/rpc/set_inventory_count")).length, 0);
});

test("an eBay failure changes nothing and is reported", async () => {
  const w = world({ ebayFails: true, products: many(5) });
  const out = await run(w);
  assert.match(out.blocked, /run failed/);
  assert.strictEqual(w.calls.filter((c) => c.url.endsWith("/rpc/set_inventory_count")).length, 0);
});

test("missing setup stops before any call", async () => {
  const w = world({});
  const out = await run(w, CONFIG, { ...ENV, ebayClientSecret: "" });
  assert.match(out.blocked, /not set up: ebayClientSecret/);
  assert.strictEqual(w.calls.length, 0);
});

test("a sale on another site leaves eBay alone while eBay changes are off", async () => {
  // BossListers says 0 (the store sold it); eBay still shows 1.
  const w = world({ live: { ...manyLive(20), 555: [1, 0] }, products: [...many(20), product("store-sold", "555", 0, 1)] });
  const out = await run(w);
  assert.deepStrictEqual(out.ebayChanged, []);
  assert.deepStrictEqual(out.held.map((h) => h.sku), ["store-sold"]);
});

test("with eBay changes on, a sale on another site ends the eBay listing or lowers its quantity", async () => {
  const w = world({
    live: { ...manyLive(20), 555: [1, 0], 666: [3, 0] },
    products: [...many(20), product("store-sold-last", "555", 0, 1), product("store-sold-one", "666", 2, 3)],
  });
  const out = await run(w, { ...CONFIG, ebayWritesEnabled: true });
  assert.deepStrictEqual(out.ebayChanged, [{ sku: "store-sold-last", set: 0, ended: true }, { sku: "store-sold-one", set: 2, ended: false }]);
  assert.match(w.calls.find((c) => c.call === "EndFixedPriceItem").body, /<ItemID>555<\/ItemID>/);
  assert.match(w.calls.find((c) => c.call === "ReviseInventoryStatus").body, /<ItemID>666<\/ItemID><Quantity>2<\/Quantity>/);
  assert.strictEqual(out.status, "success");
});

test("a change another run already made this minute is not counted as a failure", async () => {
  const w = world({ live: manyLive(20), items: { 555: ["Completed", 1, 1] }, products: [...many(20), product("sold-one", "555", 1)], rpc: () => [{ applied: false, reason: "already applied" }] });
  const out = await run(w);
  assert.deepStrictEqual(out.failed, []);
  assert.strictEqual(out.status, "success");
});

test("one row is written to the log for every run that got as far as the database", async () => {
  const w = world({ live: manyLive(20), products: many(20) });
  await run(w);
  const logs = w.calls.filter((c) => c.url.endsWith("/rest/v1/sync_logs"));
  assert.strictEqual(logs.length, 1);
  const row = JSON.parse(logs[0].body);
  assert.strictEqual(row.status, "success");
  assert.strictEqual(row.items_seen, 20);
});

test("a second call within five minutes does nothing at all", async () => {
  const w = world({ live: manyLive(20), products: many(20), lastRun: new Date(Date.now() - 60_000).toISOString() });
  const out = await run(w);
  assert.strictEqual(out.status, "skipped");
  assert.strictEqual(w.calls.filter((c) => c.url.includes("ebay.com")).length, 0);
  assert.strictEqual(w.calls.filter((c) => c.url.endsWith("/rest/v1/sync_logs")).length, 0);
});

test("a call fifteen minutes after the last run goes ahead", async () => {
  const w = world({ live: manyLive(20), products: many(20), lastRun: new Date(Date.now() - 900_000).toISOString() });
  const out = await run(w);
  assert.strictEqual(out.status, "success");
});
