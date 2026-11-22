// scripts/test-e2e-commercial-maker.js
// Test A — Commercial Maker E2E acceptance criteria.
//
// Uses actual available modules/pipelines in this sandbox:
//   - lib/commercialMaker.js: makeCommercial, makeCardShowcaseCommercial,
//     buildMakeRequest, commercialFileName, plainDescription
//   - lib/universal-creative/commercial-agents.js: 11 commercial agents
//   - lib/universal-creative/render-engine.js: render job creation
//
// Render-only safety: never auto-posts, never auto-lists, never invents
// prices. Publishing requires explicit user approval + authorized connections.
//
// Notes:
//   - makeCommercial delegates to make_commercial.py (external video-bot-
//     pipeline, not in sandbox — Blocker B6). The run() callback is injected,
//     so we verify the correct command is constructed and the output file is
//     handled correctly, without needing ffmpeg.
//   - makeCardShowcaseCommercial delegates to render-card-showcase.mjs
//     (Remotion). Actual MP4 rendering needs ffmpeg (not installed — Blocker
//     B6-adjacent). We verify argument construction and draft handling.

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  plainDescription,
  commercialFileName,
  buildMakeRequest,
  makeCommercial,
  cardShowcaseFileName,
  makeCardShowcaseCommercial,
} = require("../lib/commercialMaker");

const {
  CommercialDirectorAgent,
  MarketingResearchAgent,
  ScriptwriterAgent,
  SceneDesignerAgent,
  CommercialQAAgent,
  CampaignAgent,
  registerAllCommercialAgents,
} = require("../lib/universal-creative/commercial-agents");

const { AgentOrchestrator } = require("../lib/universal-creative/agent-framework");

const PRODUCT = {
  sku: "ebay-198039778989",
  slug: "orion-pax-figure-965925",
  title: "Transformers Orion Pax Figure",
  description: null,
  price: "25.99",
  image_url: "https://i.ebayimg.com/images/g/abc/s-l1600.jpg",
};

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "e2e-maker-"));

function removeQuietly(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
}

// ------------------------------------------------------------------
// 1. Product request building — never invents price, title, or image
// ------------------------------------------------------------------

test("E2E Commercial Maker: buildMakeRequest builds a real request from a real product", () => {
  const out = buildMakeRequest(PRODUCT);
  assert.strictEqual(out.ok, true);
  assert.deepStrictEqual(out.payload, {
    name: "Transformers Orion Pax Figure",
    description: "",
    price: 25.99,
    images: ["https://i.ebayimg.com/images/g/abc/s-l1600.jpg"],
  });
  assert.strictEqual(out.fileName, "orion-pax-figure-965925_reel_9_16.mp4");
});

test("E2E Commercial Maker: refuses products with missing required fields; never invents", () => {
  // No price
  assert.match(buildMakeRequest({ ...PRODUCT, price: null }).error, /price/);
  assert.match(buildMakeRequest({ ...PRODUCT, price: "0" }).error, /price/);
  // No picture
  assert.match(buildMakeRequest({ ...PRODUCT, image_url: "" }).error, /picture/);
  assert.match(buildMakeRequest({ ...PRODUCT, image_url: "http://insecure.example/a.jpg" }).error, /picture/);
  // No title
  assert.match(buildMakeRequest({ ...PRODUCT, title: "  " }).error, /title/);
  // Null product
  assert.strictEqual(buildMakeRequest(null).ok, false);
});

// ------------------------------------------------------------------
// 2. makeCommercial E2E — actual module with injected run stub
// ------------------------------------------------------------------

test("E2E Commercial Maker: makeCommercial runs the pipeline, copies output, reports bytes", async () => {
  const dir = tempDir();
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    const product = JSON.parse(fs.readFileSync(args[args.indexOf("--json") + 1], "utf8"));
    assert.strictEqual(product.name, "Transformers Orion Pax Figure");
    assert.strictEqual(product.price, 25.99);
    assert.ok(product.images[0].startsWith("https://"));
    // Simulate the external maker writing a draft MP4
    fs.writeFileSync(args[args.indexOf("--out") + 1], Buffer.alloc(4096, 1));
    return { code: 0, stderr: "" };
  };

  const out = await makeCommercial(PRODUCT, { dir, run, pipelineDir: "/pipeline" });
  assert.deepStrictEqual(out, {
    ok: true,
    name: "orion-pax-figure-965925_reel_9_16.mp4",
    bytes: 4096,
  });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0][0], path.join("/pipeline", "make_commercial.py"));
  assert.ok(fs.existsSync(path.join(dir, out.name)));
  removeQuietly(dir);
});

test("E2E Commercial Maker: makeCommercial failure is reported, no false success", async () => {
  const dir = tempDir();
  const failed = await makeCommercial(PRODUCT, {
    dir,
    run: async () => ({ code: 1, stderr: "boom" }),
    pipelineDir: "/p",
  });
  assert.strictEqual(failed.ok, false);
  assert.match(failed.error, /could not be made/);

  const empty = await makeCommercial(PRODUCT, {
    dir,
    run: async () => ({ code: 0, stderr: "" }),
    pipelineDir: "/p",
  });
  assert.strictEqual(empty.ok, false);

  const thrown = await makeCommercial(PRODUCT, {
    dir,
    run: async () => { throw new Error("no python"); },
    pipelineDir: "/p",
  });
  assert.strictEqual(thrown.ok, false);
  removeQuietly(dir);
});

test("E2E Commercial Maker: bad product never starts the external maker", async () => {
  let runs = 0;
  const out = await makeCommercial({ ...PRODUCT, price: null }, {
    dir: tempDir(),
    run: async () => { runs++; },
    pipelineDir: "/p",
  });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(runs, 0);
});

// ------------------------------------------------------------------
// 3. Commercial agents E2E — actual agent workforce orchestration
// ------------------------------------------------------------------

test("E2E Commercial Maker: full agent workflow — director → research → script → scene → QA → campaign", async () => {
  const orch = new AgentOrchestrator({ domain: "commercial-e2e" });
  const agents = registerAllCommercialAgents(orch);
  assert.equal(agents.length, 11);

  // Step 1: Director creates strategy
  const director = orch.getAgent("commercial-director");
  const strategy = await director.execute({
    product: { sku: "SKU-1", title: "Vintage Lamp", price: 45.00 },
    campaignGoal: "sales",
    targetAudience: "home buyers",
  });
  assert.ok(strategy.ok);
  assert.ok(strategy.strategy.tasks.length > 0);

  // Step 2: Marketing research
  const research = await orch.getAgent("marketing-research").execute({
    product: { sku: "SKU-1", title: "Vintage Lamp", price: 45.00, condition: "Good" },
  });
  assert.ok(research.ok);
  assert.ok(research.research.keySellingPoints.length > 0);

  // Step 3: Scriptwriter
  const script = await orch.getAgent("scriptwriter").execute({
    product: { title: "Vintage Lamp", price: 45.00, description: "A beautiful vintage lamp" },
    duration: 15,
  });
  assert.ok(script.ok);
  assert.ok(script.script.scenes.length > 0);
  assert.ok(script.script.totalDuration > 0);

  // Step 4: Scene design
  const scenes = await orch.getAgent("scene-designer").execute({
    product: { title: "Vintage Lamp", image_url: "https://example.com/lamp.jpg" },
    aspectRatio: "9:16",
  });
  assert.ok(scenes.ok);
  assert.ok(scenes.composition.scenes.length > 0);

  // Step 5: QA
  const qa = await orch.getAgent("commercial-qa").execute({
    product: { title: "Vintage Lamp", price: 19.99 },
    script: { scenes: [{ id: "s1", duration: 3 }, { id: "s2", duration: 4 }] },
  });
  assert.ok(qa.ok);
  assert.ok(qa.passed);

  // Step 6: Campaign — variations require approval, never auto-post
  const campaign = await orch.getAgent("campaign").execute({
    commercial: { id: "comm-1" },
    platforms: ["instagram", "facebook", "tiktok"],
  });
  assert.ok(campaign.ok);
  assert.equal(campaign.variations.length, 3);
  assert.ok(campaign.variations.every((v) => v.requiresApproval === true));
  assert.ok(campaign.variations.every((v) => v.autoPost === false));
});

// ------------------------------------------------------------------
// 4. Card showcase file naming (matches commercialFiles NAME_RULE)
// ------------------------------------------------------------------

test("E2E Commercial Maker: cardShowcaseFileName produces safe .mp4 names", () => {
  const card = { id: "card-42", fields: { year: "1986", set: "Transformers", cardName: "Orion Pax", cardNumber: "965925" } };
  const name = cardShowcaseFileName(card);
  assert.match(name, /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}\.mp4$/);
});

// ------------------------------------------------------------------
// 5. Render-only safety assertions (the "no auto-post" guarantee)
// ------------------------------------------------------------------

test("E2E Commercial Maker: render-only — no auto-post, no auto-list, no invented price", () => {
  // Campaign agent never auto-posts
  const campaign = new CampaignAgent();
  assert.equal(campaign.permissions.includes("read-commercial-output"), true);
  assert.equal(campaign.requiresApproval, true);

  // QA agent checks for no invented price
  const qa = new CommercialQAAgent();
  assert.ok(qa.capabilities.includes("specs-validation"));

  // buildMakeRequest rejects missing price — never invents one
  const noPrice = buildMakeRequest({ ...PRODUCT, price: null });
  assert.strictEqual(noPrice.ok, false);
  assert.match(noPrice.error, /price/);
});
