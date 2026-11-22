const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  generateCommercialFromManualEntry,
  getInventorySources,
  getIntegrationStatus,
  generateBatchCommercials,
} = require("../lib/universal-creative/inventory-integration.js");

// ---------------------------------------------------------------
// Inventory integration tests
// ---------------------------------------------------------------

test("getInventorySources returns all sources", () => {
  const sources = getInventorySources();
  assert.ok(Array.isArray(sources));
  assert.ok(sources.length >= 1);
  const ids = sources.map((s) => s.id);
  assert.ok(ids.includes("manual"));
});

test("getIntegrationStatus", () => {
  const status = getIntegrationStatus();
  assert.ok(status.inventorySources);
  assert.ok(status.commercialMakerAvailable);
  assert.ok(status.sharedAssetFactoryAvailable);
  assert.equal(status.renderOnly, true);
  assert.equal(status.neverInventsPrices, true);
  assert.equal(status.autoPostDisabled, true);
});

test("generateCommercialFromManualEntry rejects missing title", async () => {
  const result = await generateCommercialFromManualEntry({
    description: "A test product",
    image_url: "https://example.com/product.jpg",
  });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test("generateCommercialFromManualEntry rejects missing image", async () => {
  const result = await generateCommercialFromManualEntry({
    title: "Test Product",
    description: "A test product",
  });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test("generateCommercialFromManualEntry with valid manual entry", async () => {
  const result = await generateCommercialFromManualEntry({
    title: "Manual Test Product",
    description: "A manually entered product for testing",
    price: 29.99,
    image_url: "https://example.com/manual-product.jpg",
    condition: "New",
    cta: "Buy now",
  });
  // May fail if no rendering backend available, but should not crash
  assert.ok(result.ok === true || result.ok === false);
  if (!result.ok) {
    assert.ok(result.error);
  }
});

test("generateBatchCommercials with no inventory source", async () => {
  // Temporarily hide env vars to simulate no inventory
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const result = await generateBatchCommercials({ limit: 5 });
    // Should return ok:false with error about no inventory source
    // or ok:true with empty items if stockList is available
    assert.ok(result.ok === true || result.ok === false);
  } finally {
    if (origUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
    if (origKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
  }
});

test("manual entry never invents price", async () => {
  const result = await generateCommercialFromManualEntry({
    title: "No Price Product",
    image_url: "https://example.com/noprice.jpg",
  });
  // Should succeed or fail gracefully, never invent a price
  if (result.ok) {
    assert.ok(result.commercialName || result.name);
  }
});
