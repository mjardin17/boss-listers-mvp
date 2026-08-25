const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const tsModuleCache = new Map();

function loadTsModule(relativePath, requireMap = {}) {
  const absolutePath = path.join(root, relativePath);
  if (tsModuleCache.has(absolutePath)) return tsModuleCache.get(absolutePath).exports;

  const source = fs.readFileSync(absolutePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText;

  const mod = new Module(absolutePath, module);
  mod.filename = absolutePath;
  mod.paths = Module._nodeModulePaths(path.dirname(absolutePath));
  const originalRequire = mod.require.bind(mod);
  mod.require = (request) => {
    if (request in requireMap) return requireMap[request];
    return originalRequire(request);
  };
  tsModuleCache.set(absolutePath, mod);
  mod._compile(transpiled, absolutePath);
  return mod.exports;
}

test("deal metrics subtract marketplace fees, shipping, and buy cost", () => {
  const { calculateDealMetrics } = loadTsModule("lib/calculations.ts");
  const metrics = calculateDealMetrics(
    {
      itemName: "Demo toy",
      marketplace: "eBay",
      buyCost: 10,
      shippingEstimate: 5
    },
    {
      averageSoldPrice: 40,
      sellThroughRate: 80,
      sampleSales: 12
    }
  );

  assert.equal(metrics.marketplaceFee, 5.2);
  assert.equal(metrics.profit, 19.8);
  assert.equal(metrics.margin, 49.5);
  assert.equal(metrics.roi, 198);
  assert.equal(metrics.decision, "BUY");
});

test("manual sold comp math includes packaging cost", () => {
  const { calculateManualCompOverride } = loadTsModule("lib/pricing/manualCompOverride.ts");
  const result = calculateManualCompOverride({
    soldCompPrice: 50,
    costPaid: 20,
    shippingEstimate: 6,
    packagingCost: 2
  });

  assert.equal(result.resalePrice, 50);
  assert.equal(result.shippingEstimate, 6);
  assert.equal(result.packagingCost, 2);
  assert.equal(result.netProfit, 15.5);
  assert.equal(result.roi, 77.5);
});

test("market data does not fabricate sold comps when no authorized data exists", () => {
  const { getMarketData } = loadTsModule("lib/marketDataService.ts");
  const market = getMarketData({
    upc: "887961123456",
    brand: "Mattel",
    productName: "Hot Wheels Demo Car"
  });

  assert.equal(market.status, "UNAVAILABLE");
  assert.equal(market.soldCount, 0);
  assert.equal(market.averageSold, null);
  assert.deepEqual(market.comps, []);
  assert.match(market.notice, /No authorized sold-comps feed/);
});

test("market data uses only live authorized comps and ignores estimated comps", () => {
  const { getMarketData } = loadTsModule("lib/marketDataService.ts");
  const market = getMarketData(
    { brand: "LEGO", productName: "Demo Set" },
    {
      comps: {
        recentSales: [
          { title: "LEGO Demo Set", price: 30, dateSold: "2026-08-01", estimated: false },
          { title: "LEGO Demo Set", price: 40, dateSold: "2026-08-02", estimated: false },
          { title: "LEGO Demo Set synthetic", price: 999, dateSold: "2026-08-03", estimated: true }
        ]
      }
    }
  );

  assert.equal(market.status, "LIVE");
  assert.equal(market.soldCount, 2);
  assert.equal(market.averageSold, 35);
  assert.equal(market.highestSold, 40);
});

test("scan payload reports review state instead of fake comps when market API is unavailable", () => {
  const marketDataService = loadTsModule("lib/marketDataService.ts");
  const { applyResellerScanAnalysisToPayload } = loadTsModule("lib/arbitrageEngine.ts", {
    "./marketDataService": marketDataService
  });

  const payload = applyResellerScanAnalysisToPayload({
    ok: true,
    analysis: {
      itemTitle: "Mattel Demo Figure",
      brand: "Mattel",
      category: "Toys",
      resolvedCostBasis: 12,
      confidenceScore: 72,
      pricingSource: "unavailable"
    },
    listing: {
      itemTitle: "Mattel Demo Figure",
      thumbnailUrl: "",
      sellThroughRate: "Unavailable",
      averageSalePrice: null,
      profitPotential: null,
      demandLevel: "Unknown",
      sourcingTip: "Manual verification required.",
      comps: []
    },
    scanStatus: { usedVision: false, visionAttempted: false, warning: "" }
  });

  assert.equal(payload.decision, "REVIEW");
  assert.equal(payload.marketComps.length, 0);
  assert.equal(payload.analysis.marketDataUnavailable, true);
  assert.match(payload.analysis.recommendationExplanation, /No authorized sold-comps feed/);
});

test("stock reconciliation locks inventory and delists other channels after sellout", () => {
  const { reconcileSale } = loadTsModule("lib/inventoryEngine/stockReconciliation.ts");
  const listing = {
    internalSku: "BL-DEMO-1",
    quantity: 1,
    platformListingStates: [
      {
        platform: "ebay",
        externalListingId: "E1",
        publishStatus: "ACTIVE",
        syncState: "SYNCED",
        quantityMapped: 1,
        stale: false,
        lastPublishedAt: null
      },
      {
        platform: "mercari",
        externalListingId: "M1",
        publishStatus: "ACTIVE",
        syncState: "SYNCED",
        quantityMapped: 1,
        stale: false,
        lastPublishedAt: null
      }
    ],
    syncMetadata: {
      duplicateSaleProtection: true,
      stockLocked: false,
      lastSyncAt: null,
      lastError: null
    }
  };

  const result = reconcileSale({ listing, soldPlatform: "ebay", soldQuantity: 1 });
  assert.equal(result.quantity, 0);
  assert.equal(result.syncMetadata.stockLocked, true);
  assert.equal(result.platformListingStates[0].publishStatus, "SOLD");
  assert.equal(result.platformListingStates[1].publishStatus, "DELISTED");
  assert.equal(result.platformListingStates.every((state) => state.syncState === "LOCKED"), true);
});

test("video studio: VideoProjectSchema accepts a minimal valid project with real defaults filled in", () => {
  const { VideoProjectSchema } = loadTsModule("lib/video-studio/types.ts");
  const project = VideoProjectSchema.parse({
    id: "proj-1",
    title: "Test Project",
    projectType: "PRODUCT_COMMERCIAL",
    aspectRatio: "9:16",
    scenes: [
      { id: "s1", assetUrl: "https://example.com/a.jpg", assetType: "image", durationSeconds: 3 }
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  });

  assert.equal(project.fps, 30);
  assert.equal(project.renderStatus, "DRAFT");
  assert.equal(project.audio.musicVolume, 0.35);
  assert.equal(project.cta.text, "Shop now");
  assert.equal(project.scenes[0].transition, "fade");
});

test("video studio: VideoProjectSchema rejects a project with zero scenes", () => {
  const { VideoProjectSchema } = loadTsModule("lib/video-studio/types.ts");
  assert.throws(() => {
    VideoProjectSchema.parse({
      id: "proj-2",
      title: "Empty",
      projectType: "PRODUCT_COMMERCIAL",
      aspectRatio: "9:16",
      scenes: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
  });
});

test("video studio: platform presets map each aspect ratio to the correct real dimensions", () => {
  const { PLATFORM_PRESETS, getCanvas } = loadTsModule("lib/video-studio/presets.ts");

  assert.deepEqual(PLATFORM_PRESETS["9:16"], { width: 1080, height: 1920, fps: 30 });
  assert.deepEqual(PLATFORM_PRESETS["1:1"], { width: 1080, height: 1080, fps: 30 });
  assert.deepEqual(PLATFORM_PRESETS["16:9"], { width: 1920, height: 1080, fps: 30 });
  assert.deepEqual(getCanvas("9:16"), PLATFORM_PRESETS["9:16"]);
});

test("video studio: templates are data-driven and getTemplate falls back to the first template on an unknown id", () => {
  const { VIDEO_TEMPLATES, getTemplate } = loadTsModule("lib/video-studio/templates.ts");

  assert.equal(VIDEO_TEMPLATES.length, 6);
  assert.equal(getTemplate("fast-product-sale").name, "Fast Product Sale");
  assert.equal(getTemplate("does-not-exist"), VIDEO_TEMPLATES[0]);
});

test("video studio: buildListingVideoDraft converts a real listing into a scene-per-photo draft with price and CTA preserved", () => {
  const presetsModule = loadTsModule("lib/video-studio/presets.ts");
  const templatesModule = loadTsModule("lib/video-studio/templates.ts");
  const { buildListingVideoDraft } = loadTsModule("lib/video-studio/draft.ts", {
    "./presets": presetsModule,
    "./templates": templatesModule
  });

  const draft = buildListingVideoDraft({
    id: "listing-1",
    inventoryId: "inv-1",
    title: "2007 Bowman Chrome Adrian Peterson Rookie Card",
    description: "HOF rookie card, moderate edge wear.",
    price: 19.99,
    photos: [
      "https://i.ebayimg.com/images/g/NxAAAeSwUnlphyVD/s-l1600.jpg",
      "https://i.ebayimg.com/images/g/RioAAeSw~8dphyVC/s-l1600.jpg"
    ],
    marketplace: "ebay",
    listingUrl: "https://www.ebay.com/itm/123456",
    brand: "Bowman",
    category: "Trading Cards"
  });

  assert.equal(draft.scenes.length, 2);
  assert.equal(draft.projectType, "PRODUCT_COMMERCIAL");
  assert.equal(draft.aspectRatio, "9:16");
  assert.equal(draft.scenes[0].headline, "2007 Bowman Chrome Adrian Peterson Rookie Card");
  assert.equal(draft.scenes[draft.scenes.length - 1].headline, "$19.99");
  assert.equal(draft.cta.destinationUrl, "https://www.ebay.com/itm/123456");
  assert.equal(draft.cta.showQrCode, true);
});

test("video studio: buildListingVideoDraft falls back to a placeholder scene when a listing has no photos", () => {
  const presetsModule = loadTsModule("lib/video-studio/presets.ts");
  const templatesModule = loadTsModule("lib/video-studio/templates.ts");
  const { buildListingVideoDraft } = loadTsModule("lib/video-studio/draft.ts", {
    "./presets": presetsModule,
    "./templates": templatesModule
  });

  const draft = buildListingVideoDraft({
    id: "listing-2",
    title: "No Photo Item",
    photos: [],
    price: null
  });

  assert.equal(draft.scenes.length, 1);
  assert.equal(draft.scenes[0].assetUrl, "/video-studio/placeholder-product.png");
  assert.equal(draft.cta.destinationUrl, "");
  assert.equal(draft.cta.showQrCode, false);
});

test("video studio: buildListingVideoDraft respects the chosen template's project type and CTA default", () => {
  const presetsModule = loadTsModule("lib/video-studio/presets.ts");
  const templatesModule = loadTsModule("lib/video-studio/templates.ts");
  const { buildListingVideoDraft } = loadTsModule("lib/video-studio/draft.ts", {
    "./presets": presetsModule,
    "./templates": templatesModule
  });

  const draft = buildListingVideoDraft(
    { id: "listing-3", title: "Service job photo", photos: ["https://example.com/before.jpg"] },
    "local-service"
  );

  assert.equal(draft.projectType, "SERVICE_COMMERCIAL");
  assert.equal(draft.cta.text, "Get an estimate");
});
