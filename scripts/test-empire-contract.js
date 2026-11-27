// Empire OS contract (lib/empireContract.js): the hub's view of Boss Listers.
// No server, no database, no selling site: dependencies are injected.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const c = require("../lib/empireContract");

const KEY = "test-shared-key";
const env = { EMPIRE_SHARED_KEY: KEY, SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-secret", PLATFORM_OWNER_TENANT_ID: "tenant-1", EBAY_CLIENT_ID: "ebay-secret-id" };

test("key: off without EMPIRE_SHARED_KEY (503), missing or wrong header 401, right key ok", () => {
  assert.deepStrictEqual(c.checkEmpireKey({ "x-empire-key": KEY }, {}).status, 503);
  assert.strictEqual(c.checkEmpireKey({}, env).status, 401);
  assert.strictEqual(c.checkEmpireKey({ "x-empire-key": "nope" }, env).status, 401);
  assert.strictEqual(c.checkEmpireKey({ "x-empire-key": KEY }, env).ok, true);
  assert.strictEqual(c.checkEmpireKey({ "x-empire-key": [KEY] }, env).ok, true);
});

test("health: Empire OS shape, says what is set up, never a value", () => {
  const h = c.buildHealth({ env, now: new Date("2026-11-16T12:00:00Z") });
  assert.strictEqual(h.status, "healthy");
  assert.strictEqual(h.details.module, "bosslisters");
  assert.strictEqual(h.checkedAt, "2026-11-16T12:00:00.000Z");
  assert.ok(h.details.routes.includes("/empire/listings"));
  const text = JSON.stringify(h);
  for (const secret of [KEY, "service-secret", "ebay-secret-id", "tenant-1"]) assert.ok(!text.includes(secret), `health leaked ${secret}`);
});

test("health: degraded without the key or Supabase, unhealthy without a writable data folder", () => {
  const h = c.buildHealth({ env: {} });
  assert.strictEqual(h.status, "degraded");
  assert.strictEqual(h.details.checks.empireKeyConfigured, false);
  assert.ok(h.details.problems.some((p) => p.includes("EMPIRE_SHARED_KEY")));
  assert.strictEqual(c.buildHealth({ env, dataDirWritable: false }).status, "unhealthy");
});

test("event: needs a topic; accepted ones are kept (newest first)", () => {
  assert.strictEqual(c.acceptEvent({}).status, 400);
  assert.strictEqual(c.acceptEvent(null).status, 400);
  const ok = c.acceptEvent({ topic: "render.completed", source: "empire-os", payload: { big: "x".repeat(10) } });
  assert.deepStrictEqual(ok, { status: 202, body: { accepted: true, topic: "render.completed" } });
  assert.strictEqual(c.recentEvents()[0].topic, "render.completed");
  assert.ok(!("payload" in c.recentEvents()[0]));
});

const products = [
  { sku: "IH-1", title: "Canvas tote", price: 12, quantity: 2, condition: "used", image_url: "https://x/a.jpg", status: "draft", source: "manual", approved_at: null, updated_at: "2026-11-16" },
  { sku: "ebay-1", title: "Hot Wheels", price: 5, quantity: 1, condition: "new", image_url: "https://x/b.jpg", status: "active", source: "ebay", ebay_listing_id: "1", updated_at: "2026-11-15", description: "long text" },
  { sku: "IH-2", title: "Lamp", price: 0, quantity: 1, status: "draft", source: "manual", updated_at: "2026-11-14" },
];

test("listings: summary by stage plus newest items, for the owner's tenant only", async () => {
  let askedFor = null;
  const r = await c.listingsReport({ tenantId: "tenant-1", listStock: async (t) => { askedFor = t; return products; }, limit: 2 });
  assert.strictEqual(askedFor, "tenant-1");
  assert.strictEqual(r.total, 3);
  assert.strictEqual(r.items.length, 2);
  assert.deepStrictEqual(r.items.map((i) => i.stage), ["needs_review", "listed"]);
  assert.strictEqual(r.summary.listed.items, 1);
  assert.strictEqual(r.summary.intake.items, 1);
  assert.ok(!("description" in r.items[1]), "only the panel fields are sent");
  const onlyIntake = await c.listingsReport({ tenantId: "t", listStock: async () => products, stage: "intake" });
  assert.deepStrictEqual(onlyIntake.items.map((i) => i.sku), ["IH-2"]);
  assert.ok(onlyIntake.items[0].missing.includes("your price"));
});

test("platforms: credentials present or not, names only, no probing", () => {
  const r = c.platformsReport(env);
  assert.strictEqual(r.probed, false);
  const ebay = r.platforms.find((p) => p.marketplace === "ebay");
  assert.strictEqual(ebay.credsPresent, false);
  assert.ok(ebay.missing.includes("EBAY_REFRESH_TOKEN"));
  assert.ok(!JSON.stringify(r).includes("ebay-secret-id"));
  assert.strictEqual(r.platforms.length, Object.keys(c.PLATFORM_ENV).length);
});

test("platform env names match the real connectors", () => {
  // Connectors live in lib/channels/apiConnectors.js or their own file next to it.
  const dir = path.join(__dirname, "..", "lib", "channels");
  const src = fs.readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  // A connector may need more names to list than to connect (static LISTING_ENV).
  for (const names of Object.values(c.PLATFORM_ENV)) {
    const list = JSON.stringify(names).replace(/,/g, ", ");
    assert.ok(src.includes(`static ENV = ${list}`) || src.includes(`static LISTING_ENV = ${list}`), names.join(","));
  }
});

test("stock add: dryRun checks only and saves nothing", async () => {
  let calls = 0;
  const r = await c.addStockItem({ tenantId: "tenant-1", input: { title: "Desk lamp", price: 15, quantity: 1, dryRun: true }, insertStockItem: async () => { calls++; }, now: 1000 });
  assert.strictEqual(calls, 0);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.dryRun, true);
  assert.strictEqual(r.body.wouldCreate.status, "draft");
  assert.strictEqual(r.body.wouldCreate.published, false);
  assert.ok(!("tenant_id" in r.body.wouldCreate));
});

test("stock add: saves an unlisted draft for the owner; bad input is refused", async () => {
  let saved = null;
  const r = await c.addStockItem({ tenantId: "tenant-1", input: { title: "Desk lamp", price: 15 }, insertStockItem: async (row) => { saved = row; return { ...row, updated_at: "now" }; } });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(saved.tenant_id, "tenant-1");
  assert.strictEqual(saved.status, "draft");
  assert.strictEqual(saved.published, false);
  assert.match(r.body.note, /Nothing was posted/);
  assert.strictEqual(r.body.item.stage, "intake");
  const bad = await c.addStockItem({ tenantId: "tenant-1", input: { title: "" }, insertStockItem: async () => assert.fail("must not save") });
  assert.strictEqual(bad.status, 400);
});

test("owner tenant: env first, then the config file id", () => {
  assert.strictEqual(c.ownerTenantId({ PLATFORM_OWNER_TENANT_ID: " abc " }, {}), "abc");
  assert.strictEqual(c.ownerTenantId({}, { ownerTenantId: "from-config" }), "from-config");
  assert.strictEqual(c.ownerTenantId({}, {}), null);
});

test("/empire/* is rewritten to the API routes and skips the site's Basic Auth prompt", async () => {
  const cfg = require("../next.config.js");
  const rewrites = await cfg.rewrites();
  assert.deepStrictEqual(rewrites, [{ source: "/empire/:path*", destination: "/api/empire/:path*" }]);
  const mw = fs.readFileSync(path.join(__dirname, "..", "middleware.js"), "utf8");
  assert.match(mw, /\|api\/\|empire\/\)/);
  for (const r of c.EMPIRE_ROUTES) {
    const file = path.join(__dirname, "..", "pages", "api", r.replace(/^\//, "") + ".js");
    assert.ok(fs.existsSync(file), `missing ${file}`);
  }
});
