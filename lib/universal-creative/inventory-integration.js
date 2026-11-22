#!/usr/bin/env node
/**
 * Universal Creative Production Connector — BossListers Inventory Integration
 *
 * Connects Commercial Maker to BossListers inventory where authorized.
 * Turns inventory into professional advertising content:
 *
 *   BossListers Inventory → Product Information → Product Images →
 *   Marketing Research → Commercial Script → Scenes → Voiceover →
 *   Animation → Rendering → Commercial Package
 *
 * Supports individual product and batch inventory commercial generation.
 * Uses actual inventory data only — never invents product specifications,
 * pricing, discounts, or claims. Supports manual product entry when
 * inventory integration is unavailable.
 *
 * Render-only: never auto-lists, auto-posts, or invents prices.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { makeCommercialUnified } = require("./orchestrator.js");
const { registerAsset } = require("./asset-factory.js");

const DEFAULT_BATCH_SIZE = 10;

/**
 * Fetch commercial-ready items from BossListers inventory.
 * Tries Supabase inventory first, falls back to stockList.
 */
async function fetchCommercialReadyItems(options = {}) {
  const { limit = DEFAULT_BATCH_SIZE, includeSold = false } = options;

  // Try Supabase inventory (system of record)
  try {
    const { createClient } = require("@supabase/supabase-js");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      let query = supabase
        .from("products")
        .select("sku, title, description, price, image_url, condition, handle, category")
        .limit(limit);

      if (!includeSold) {
        query = query.eq("status", "active");
      }

      const { data, error } = await query;
      if (!error && data) {
        return {
          ok: true,
          source: "supabase",
          items: data.map((p) => ({
            sku: p.sku,
            title: p.title,
            description: p.description || "",
            price: p.price,
            image_url: p.image_url,
            condition: p.condition,
            handle: p.handle,
            category: p.category,
          })),
        };
      }
    }
  } catch {
    // Supabase not available — fall through to stockList
  }

  // Fall back to local stockList
  try {
    const stockList = require("../stockList.js");
    if (stockList && typeof stockList.getStockList === "function") {
      const items = stockList.getStockList().slice(0, limit);
      return {
        ok: true,
        source: "stockList",
        items: items.map((p) => ({
          sku: p.sku || p.id,
          title: p.title,
          description: p.description || "",
          price: p.price,
          image_url: p.image_url,
          condition: p.condition,
          handle: p.handle,
          category: p.category,
        })),
      };
    }
  } catch {
    // stockList not available
  }

  return {
    ok: false,
    error: "No inventory source available — use manual product entry",
    source: "none",
  };
}

/**
 * Generate a commercial for a single inventory item.
 */
async function generateCommercialForItem(item, options = {}) {
  const {
    mode,
    dir,
    noLearn = false,
    explore = false,
    autoImprove = false,
    learningStore,
  } = options;

  const product = {
    sku: item.sku,
    title: item.title,
    description: item.description,
    price: item.price,
    image_url: item.image_url,
    condition: item.condition,
    handle: item.handle,
    cta: item.cta || "Shop now",
    platform: item.platform || "instagram",
    category: item.category,
  };

  // Validate: never invent prices or specs
  if (!product.title) {
    return { ok: false, error: "Item has no title — cannot generate commercial" };
  }
  if (!product.image_url) {
    return { ok: false, error: "Item has no image — cannot generate commercial" };
  }
  if (product.price !== undefined && (isNaN(product.price) || product.price <= 0)) {
    return { ok: false, error: "Item has invalid price — cannot generate commercial" };
  }

  return makeCommercialUnified({
    mode,
    product,
    dir,
    noLearn,
    explore,
    autoImprove,
    learningStore,
  });
}

/**
 * Generate commercials for a batch of inventory items.
 * Processes items sequentially with error isolation — one failure
 * doesn't stop the batch.
 */
async function generateBatchCommercials(options = {}) {
  const {
    limit = DEFAULT_BATCH_SIZE,
    includeSold = false,
    mode,
    dir,
    onProgress,
    noLearn = false,
    explore = false,
    autoImprove = false,
    learningStore,
  } = options;

  // Fetch inventory
  const inventory = await fetchCommercialReadyItems({ limit, includeSold });
  if (!inventory.ok) {
    return { ok: false, error: inventory.error, source: inventory.source };
  }

  const results = {
    total: inventory.items.length,
    succeeded: 0,
    failed: 0,
    items: [],
    source: inventory.source,
    startedAt: new Date().toISOString(),
  };

  for (const item of inventory.items) {
    try {
      const result = await generateCommercialForItem(item, {
        mode,
        dir,
        noLearn,
        explore,
        autoImprove,
        learningStore,
      });

      if (result.ok) {
        results.succeeded++;
        // Register the commercial as a shared asset
        if (result.path && fs.existsSync(result.path)) {
          try {
            registerAsset({
              sourceFile: result.path,
              assetType: "product-photo",
              projectId: item.sku,
              productionId: result.mode,
              sourceApplication: "commercial-maker",
              originalFileName: result.name,
              tags: ["commercial", item.category || "general", result.mode],
              submittedBy: "inventory-integration",
            });
          } catch {
            // Asset registration failure shouldn't fail the commercial
          }
        }
      } else {
        results.failed++;
      }

      results.items.push({
        sku: item.sku,
        title: item.title,
        ok: result.ok,
        commercialName: result.ok ? result.name : null,
        error: result.ok ? null : result.error,
        mode: result.mode,
      });

      if (onProgress) {
        onProgress(results);
      }
    } catch (err) {
      results.failed++;
      results.items.push({
        sku: item.sku,
        title: item.title,
        ok: false,
        commercialName: null,
        error: err instanceof Error ? err.message : String(err),
        mode: null,
      });
    }
  }

  results.completedAt = new Date().toISOString();
  results.successRate = results.total > 0
    ? Math.round((results.succeeded / results.total) * 100)
    : 0;

  return { ok: true, ...results };
}

/**
 * Manual product entry — create a commercial from manually provided
 * product information when inventory integration is unavailable.
 * Never invents specifications, pricing, or claims.
 */
async function generateCommercialFromManualEntry(productInfo, options = {}) {
  const {
    mode,
    dir,
    noLearn = false,
    explore = false,
    autoImprove = false,
    learningStore,
  } = options;

  // Validate manual entry — all fields must come from the user
  if (!productInfo.title) {
    return { ok: false, error: "Manual entry requires a product title" };
  }

  const product = {
    sku: productInfo.sku || `manual-${Date.now()}`,
    title: productInfo.title,
    description: productInfo.description || "",
    price: productInfo.price, // may be undefined — don't invent
    image_url: productInfo.image_url,
    condition: productInfo.condition,
    handle: productInfo.handle,
    cta: productInfo.cta || "Shop now",
    platform: productInfo.platform || "instagram",
    category: productInfo.category,
  };

  // Warn if missing optional fields but don't block
  if (!product.image_url) {
    return { ok: false, error: "Manual entry requires a product image URL" };
  }

  return makeCommercialUnified({
    mode,
    product,
    dir,
    noLearn,
    explore,
    autoImprove,
    learningStore,
  });
}

/**
 * Get available inventory sources.
 */
function getInventorySources() {
  const sources = [];

  try {
    const { createClient } = require("@supabase/supabase-js");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      sources.push({
        id: "supabase",
        name: "Supabase Inventory",
        type: "database",
        available: true,
        description: "System of record for BossListers inventory",
      });
    }
  } catch {
    sources.push({
      id: "supabase",
      name: "Supabase Inventory",
      type: "database",
      available: false,
      description: "Supabase client not available",
    });
  }

  try {
    require("../stockList.js");
    sources.push({
      id: "stockList",
      name: "Local Stock List",
      type: "file",
      available: true,
      description: "Local stock list fallback",
    });
  } catch {
    sources.push({
      id: "stockList",
      name: "Local Stock List",
      type: "file",
      available: false,
      description: "stockList module not available",
    });
  }

  sources.push({
    id: "manual",
    name: "Manual Product Entry",
    type: "manual",
    available: true,
    description: "Enter product information manually",
  });

  return sources;
}

/**
 * Get integration status.
 */
function getIntegrationStatus() {
  const sources = getInventorySources();
  return {
    inventorySources: sources,
    commercialMakerAvailable: true,
    sharedAssetFactoryAvailable: true,
    renderOnly: true,
    neverInventsPrices: true,
    autoPostDisabled: true,
  };
}

module.exports = {
  fetchCommercialReadyItems,
  generateCommercialForItem,
  generateBatchCommercials,
  generateCommercialFromManualEntry,
  getInventorySources,
  getIntegrationStatus,
  DEFAULT_BATCH_SIZE,
};
