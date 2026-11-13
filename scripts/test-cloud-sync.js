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
function world({ live = {}, items = {}, products = [], ebayFails = false, rpc = () => [{ applied: true }], lastRun = null, patchFails = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url);
    const call = opts.headers && opts.headers["X-EBAY-API-CALL-NAME"];
    calls.push({ url: u, call, body: opts.body });
    if (u.includes("/identity/v1/oauth2/token")) return reply(200, { access_token: "access" });
    if (u.endsWith("/rpc/get_decrypted_marketplace_token")) return reply(200, JSON.stringify("refresh"));
    if (u.includes("/rest/v1/products") && opts.method === "PATCH") return patchFails ? reply(500, { message: "nope" }) : reply(204, "");
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
      const [status, qty, sold, condition = ""] = items[id] || ["Active", 1, 0];
      if (status === "FAIL") return reply(200, "<GetItemResponse><Ack>Failure</Ack></GetItemResponse>");
      return reply(200, `<GetItemResponse><Ack>Success</Ack><Item><ItemID>${id}</ItemID><Quantity>${qty}</Quantity>${condition}<SellingStatus><ListingStatus>${status}</ListingStatus><QuantitySold>${sold}</QuantitySold></SellingStatus></Item></GetItemResponse>`);
    }
    if (call === "ReviseInventoryStatus") return reply(200, "<ReviseInventoryStatusResponse><Ack>Success</Ack></ReviseInventoryStatusResponse>");
    if (call === "EndFixedPriceItem") return reply(200, "<EndFixedPriceItemResponse><Ack>Success</Ack></EndFixedPriceItemResponse>");
    throw new Error("unexpected call: " + u + " " + call);
  };
  return { fetchImpl, calls };
}
const product = (sku, listingId, quantity, base = quantity) => ({ id: sku, sku, quantity, status: quantity > 0 ? "active" : "out_of_stock", ebay_listing_id: listingId, last_ebay_quantity: base });

async function run(w, config = CONFIG, env = ENV, now) {
  const { runSync } = await load("core.mjs");
  const planner = await load("plan.mjs");
  return runSync({ fetchImpl: w.fetchImpl, parseXml: (t) => parser.parse(t), env, config, planner, now });
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

// ---- Item condition: eBay is the source; the sync fills a missing one and re-checks each about once a day.
const cond = (id, name) => `<ConditionID>${id}</ConditionID><ConditionDisplayName>${name}</ConditionDisplayName>`;
const withCondition = (p, condition) => ({ ...p, condition });
const patches = (w) => w.calls.filter((c) => c.url.includes("/rest/v1/products?id=eq.") && c.body && !c.url.includes("select="));
const known = (n) => many(n).map((p) => withCondition(p, "New"));
const AN_HOUR_WITH_NO_ROTATION = 0; // slot 0: none of the test listings 1000-1019 or 555 fall due

test("a listing saved as Unknown gets its real condition from eBay; nothing on eBay changes", async () => {
  const w = world({
    live: { ...manyLive(20), 555: [1, 0] },
    items: { 555: ["Active", 1, 0, cond(1000, "New with tags")] },
    products: [...known(20), withCondition(product("hoodie", "555", 1), "Unknown")],
  });
  const out = await run(w, CONFIG, ENV, AN_HOUR_WITH_NO_ROTATION);
  assert.strictEqual(out.status, "success");
  assert.deepStrictEqual(out.conditions.updated, [{ sku: "hoodie", from: "Unknown", to: "New with tags" }]);
  const sent = patches(w);
  assert.strictEqual(sent.length, 1);
  assert.match(sent[0].url, /products\?id=eq\.hoodie&tenant_id=eq\.tenant-1/);
  assert.deepStrictEqual(JSON.parse(sent[0].body), { condition: "New with tags" });
  assert.strictEqual(w.calls.filter((c) => c.call === "ReviseInventoryStatus" || c.call === "EndFixedPriceItem").length, 0);
});

test("a card keeps its card condition, and a condition that already matches is not rewritten", async () => {
  const card = "<ConditionID>4000</ConditionID><ConditionDisplayName>Ungraded</ConditionDisplayName><ConditionDescriptors><ConditionDescriptor><Name>40001</Name><Value>400011</Value></ConditionDescriptor></ConditionDescriptors>";
  const w = world({
    live: { ...manyLive(20), 555: [1, 0], 556: [1, 0] },
    items: { 555: ["Active", 1, 0, card], 556: ["Active", 1, 0, cond(1000, "New")] },
    products: [...known(20), withCondition(product("card", "555", 1), null), withCondition(product("same", "556", 1), "")],
  });
  const out = await run(w, CONFIG, ENV, AN_HOUR_WITH_NO_ROTATION);
  assert.deepStrictEqual(out.conditions.updated, [{ sku: "card", from: null, to: "Ungraded - Excellent" }, { sku: "same", from: "", to: "New" }]);
  const w2 = world({ live: { ...manyLive(20), 556: [1, 0] }, items: { 556: ["Active", 1, 0, cond(1000, "New")] }, products: [...known(20), withCondition(product("same", "556", 1), "New")] });
  const all = 24 * 60 * 60 * 1000;
  for (let t = 0; t < all; t += 15 * 60 * 1000) await run(w2, CONFIG, ENV, t);
  assert.strictEqual(patches(w2).length, 0);
  // Over one day every known listing is looked at once (21 listings, 96 runs).
  assert.strictEqual(w2.calls.filter((c) => c.call === "GetItem").length, 21);
});

test("a failed condition read or save is reported but never fails the stock sync", async () => {
  const w = world({
    live: { ...manyLive(20), 555: [1, 0], 556: [1, 0] },
    items: { 555: ["FAIL", 1, 0], 556: ["Active", 1, 0, cond(3000, "Used")] },
    products: [...known(20), withCondition(product("a", "555", 1), "Unknown"), withCondition(product("b", "556", 1), "Unknown")],
    patchFails: true,
  });
  const out = await run(w, CONFIG, ENV, AN_HOUR_WITH_NO_ROTATION);
  assert.strictEqual(out.status, "success");
  assert.deepStrictEqual(out.conditions.updated, []);
  assert.deepStrictEqual(out.conditions.failed.map((f) => f.sku), ["a", "b"]);
});

test("no condition is looked up when the eBay read is blocked", async () => {
  const w = world({ live: {}, products: [withCondition(product("x", "555", 1), "Unknown")] });
  const out = await run(w);
  assert.strictEqual(out.status, "failed");
  assert.strictEqual(w.calls.filter((c) => c.call === "GetItem").length, 0);
});
