/**
 * Unit tests for InventorySyncService
 * Tests database upsert (SELECT -> UPDATE/INSERT), sync logging, and marketplace linking
 */

const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { InventorySyncService } = require("../inventorySyncService");

const MOCK_SUPABASE_URL = "https://mock.supabase.co";
const MOCK_SERVICE_KEY = "mock-service-key";

describe("InventorySyncService", () => {
  let service;
  let originalFetch;

  beforeEach(() => {
    process.env.SUPABASE_URL = MOCK_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = MOCK_SERVICE_KEY;

    originalFetch = global.fetch;
    service = new InventorySyncService();
  });

  test("syncEbayProducts: should upsert multiple products via SELECT -> UPDATE/INSERT", async () => {
    const products = [
      {
        sku: "SKU001",
        title: "Product 1",
        quantity: 5,
        price: 29.99,
        condition: "New",
        source: "ebay",
      },
      {
        sku: "SKU002",
        title: "Product 2",
        quantity: 3,
        price: 49.99,
        condition: "Used",
        source: "ebay",
      },
    ];

    // Mock responses:
    // For SKU001: SELECT returns [] (new), INSERT returns created row
    // For SKU002: SELECT returns [{ id: "existing-id" }] (existing), PATCH returns updated row
    global.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      const method = options.method || "GET";

      if (urlStr.includes("/products") && method === "GET") {
        if (urlStr.includes("SKU001")) {
          return { ok: true, status: 200, text: async () => JSON.stringify([]) };
        }
        return { ok: true, status: 200, text: async () => JSON.stringify([{ id: "uuid-existing" }]) };
      }

      if (urlStr.includes("/products") && method === "POST") {
        return { ok: true, status: 201, text: async () => JSON.stringify([{ id: "uuid-created" }]) };
      }

      if (urlStr.includes("/products") && method === "PATCH") {
        return { ok: true, status: 200, text: async () => JSON.stringify([{ id: "uuid-existing" }]) };
      }

      return { ok: true, status: 200, text: async () => JSON.stringify([]) };
    };

    const result = await service.syncEbayProducts("tenant-123", products);

    assert.equal(result.created, 1);
    assert.equal(result.updated, 1);
    assert.equal(result.errors.length, 0);

    global.fetch = originalFetch;
  });

  test("syncEbayProducts: should detect duplicate SKUs in batch", async () => {
    const products = [
      {
        sku: "DUPLICATE",
        title: "First",
        quantity: 1,
        price: 10,
      },
      {
        sku: "DUPLICATE",
        title: "Second",
        quantity: 1,
        price: 15,
      },
    ];

    global.fetch = async (url, options = {}) => {
      const method = options.method || "GET";
      if (method === "GET") {
        return { ok: true, status: 200, text: async () => JSON.stringify([]) };
      }
      return { ok: true, status: 201, text: async () => JSON.stringify([{ id: "uuid-123" }]) };
    };

    const result = await service.syncEbayProducts("tenant-123", products, {
      deduplicate: true,
    });

    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].reason, "Duplicate in batch");

    global.fetch = originalFetch;
  });

  test("syncEbayProducts: dryRun mode should not write to DB", async () => {
    const products = [
      {
        sku: "DRY-001",
        title: "Dry Run Product",
        quantity: 2,
        price: 19.99,
      },
    ];

    let writeAttempted = false;
    global.fetch = async (url, options = {}) => {
      const method = options.method || "GET";
      if (method === "POST" || method === "PATCH" || method === "DELETE") {
        writeAttempted = true;
      }
      return { ok: true, status: 200, text: async () => JSON.stringify([]) };
    };

    const result = await service.syncEbayProducts("tenant-123", products, {
      dryRun: true,
    });

    assert.equal(result.dryRun, true);
    assert.equal(result.created, 1);
    assert.equal(writeAttempted, false, "dryRun should never issue write requests");

    global.fetch = originalFetch;
  });

  test("getLastSyncStatus: should return the last sync log entry", async () => {
    const mockLog = {
      id: 1,
      run_id: "00000000-0000-0000-0000-000000000000",
      started_at: new Date().toISOString(),
      status: "success",
      items_upserted: 42,
    };

    global.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify([mockLog]),
    });

    const result = await service.getLastSyncStatus("tenant-123");

    assert.equal(result.status, "success");
    assert.equal(result.items_upserted, 42);

    global.fetch = originalFetch;
  });

  test("recordSyncLog: should write valid sync log with UUID run_id and ignore missing fields", async () => {
    const syncResult = {
      created: 10,
      updated: 5,
      errors: [],
      conflicts: [],
    };

    let sentBody = null;
    global.fetch = async (url, options = {}) => {
      sentBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify([{ id: 1, status: "success", ...sentBody }]),
      };
    };

    const result = await service.recordSyncLog("tenant-123", syncResult);

    assert.equal(result.status, "success");
    assert.ok(sentBody.run_id, "run_id must be populated");
    assert.equal(typeof sentBody.run_id, "string");
    assert.equal(sentBody.tenant_id, undefined, "tenant_id should be dropped since table doesn't have it");
    assert.equal(sentBody.items_created, undefined, "items_created should be dropped");

    global.fetch = originalFetch;
  });
});
