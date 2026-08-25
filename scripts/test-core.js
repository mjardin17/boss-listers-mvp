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
