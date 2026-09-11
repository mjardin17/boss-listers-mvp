/**
 * Unit tests for InventorySyncService
 * Tests database upsert, sync logging, and marketplace linking
 */

const { InventorySyncService } = require("../inventorySyncService");

// Mock fetch
global.fetch = jest.fn();

const MOCK_SUPABASE_URL = "https://mock.supabase.co";
const MOCK_SERVICE_KEY = "mock-service-key";

describe("InventorySyncService", () => {
  let service;

  beforeEach(() => {
    process.env.SUPABASE_URL = MOCK_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = MOCK_SERVICE_KEY;

    service = new InventorySyncService();
    jest.clearAllMocks();
  });

  describe("syncEbayProducts", () => {
    it("should upsert multiple products", async () => {
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

      // Mock product upsert responses
      global.fetch.mockImplementation((url, options) => {
        if (url.includes("/products")) {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: () => Promise.resolve([{ id: "uuid-123", synced_at: new Date().toISOString() }]),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 204,
        });
      });

      const result = await service.syncEbayProducts("tenant-123", products);

      expect(result.created + result.updated).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect duplicate SKUs in batch", async () => {
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

      global.fetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve([{ id: "uuid-123" }]),
      });

      const result = await service.syncEbayProducts("tenant-123", products, {
        deduplicate: true,
      });

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].reason).toBe("Duplicate in batch");
    });

    it("should handle products without SKU", async () => {
      const products = [
        {
          title: "No SKU Product",
          quantity: 1,
          price: 10,
        },
      ];

      const result = await service.syncEbayProducts("tenant-123", products);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe("Missing SKU");
    });

    it("should throw error if tenantId is missing", async () => {
      await expect(
        service.syncEbayProducts(null, [])
      ).rejects.toThrow("tenantId");
    });
  });

  describe("getLastSyncStatus", () => {
    it("should return the last sync log entry", async () => {
      const mockLog = {
        id: 1,
        started_at: new Date().toISOString(),
        status: "success",
        items_upserted: 42,
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([mockLog]),
      });

      const result = await service.getLastSyncStatus("tenant-123");

      expect(result.status).toBe("success");
      expect(result.items_upserted).toBe(42);
    });

    it("should return null if no sync logs exist", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const result = await service.getLastSyncStatus("tenant-123");

      expect(result).toBeNull();
    });
  });

  describe("getSyncHistory", () => {
    it("should return recent sync logs", async () => {
      const mockLogs = [
        {
          id: 3,
          started_at: new Date().toISOString(),
          status: "success",
          items_upserted: 50,
        },
        {
          id: 2,
          started_at: new Date(Date.now() - 15 * 60000).toISOString(),
          status: "success",
          items_upserted: 45,
        },
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLogs),
      });

      const result = await service.getSyncHistory("tenant-123", 50);

      expect(result).toHaveLength(2);
      expect(result[0].items_upserted).toBe(50);
    });
  });

  describe("getInventoryCountsByMarketplace", () => {
    it("should count products per marketplace", async () => {
      const mockListings = [
        { marketplace: "ebay", product_id: "prod-1" },
        { marketplace: "ebay", product_id: "prod-2" },
        { marketplace: "etsy", product_id: "prod-3" },
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockListings),
      });

      const result = await service.getInventoryCountsByMarketplace("tenant-123");

      expect(result.ebay).toBe(2);
      expect(result.etsy).toBe(1);
    });
  });

  describe("recordSyncLog", () => {
    it("should create a sync log entry", async () => {
      const syncResult = {
        created: 10,
        updated: 5,
        errors: [],
        conflicts: [],
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 1,
              tenant_id: "tenant-123",
              status: "success",
            },
          ]),
      });

      const result = await service.recordSyncLog("tenant-123", syncResult);

      expect(result.status).toBe("success");
    });

    it("should mark sync as partial if errors exist", async () => {
      const syncResult = {
        created: 10,
        updated: 5,
        errors: [{ sku: "BAD", error: "Some error" }],
        conflicts: [],
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 1,
              status: "partial",
            },
          ]),
      });

      const result = await service.recordSyncLog("tenant-123", syncResult);

      expect(result.status).toBe("partial");
    });
  });
});
