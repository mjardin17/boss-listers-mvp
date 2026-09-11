/**
 * Unit tests for EbayInventoryFetcher
 * Tests eBay API interaction, pagination, and data normalization
 */

const { EbayInventoryFetcher } = require("../ebayInventoryFetcher");

// Mock EbayConnector
jest.mock("../channels/apiConnectors", () => ({
  EbayConnector: jest.fn().mockImplementation(() => ({
    _getAccessToken: jest
      .fn()
      .mockResolvedValue("mock_access_token"),
  })),
}));

// Mock fetch
global.fetch = jest.fn();

describe("EbayInventoryFetcher", () => {
  let fetcher;

  beforeEach(() => {
    fetcher = new EbayInventoryFetcher();
    jest.clearAllMocks();
  });

  describe("fetchAllListings", () => {
    it("should fetch all listings with pagination", async () => {
      const mockInventories = [
        {
          sku: "SKU001",
          quantity: 5,
          price: { value: "29.99" },
          listing: { title: "Item 1" },
        },
        {
          sku: "SKU002",
          quantity: 3,
          price: { value: "49.99" },
          listing: { title: "Item 2" },
        },
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          inventories: mockInventories,
          total: 2,
        }),
      });

      const results = await fetcher.fetchAllListings("tenant-123");

      expect(results).toHaveLength(2);
      expect(results[0].sku).toBe("SKU001");
      expect(results[1].price).toBe(49.99);
    });

    it("should handle pagination for large inventories", async () => {
      // First page
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          inventories: Array(100)
            .fill(null)
            .map((_, i) => ({
              sku: `SKU${String(i).padStart(4, "0")}`,
              quantity: 1,
              price: { value: "10.00" },
              listing: { title: `Item ${i}` },
            })),
          total: 150,
        }),
      });

      // Second page
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          inventories: Array(50)
            .fill(null)
            .map((_, i) => ({
              sku: `SKU${String(100 + i).padStart(4, "0")}`,
              quantity: 1,
              price: { value: "10.00" },
              listing: { title: `Item ${100 + i}` },
            })),
          total: 150,
        }),
      });

      const results = await fetcher.fetchAllListings("tenant-123");

      expect(results).toHaveLength(150);
      expect(global.fetch).toHaveBeenCalledTimes(2); // Two pages
    });

    it("should throw error if tenantId is missing", async () => {
      await expect(fetcher.fetchAllListings(null, {})).rejects.toThrow(
        "tenantId is required"
      );
    });

    it("should normalize condition codes", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          inventories: [
            {
              sku: "SKU001",
              quantity: 1,
              condition: "NEW",
              listing: { title: "New Item" },
            },
            {
              sku: "SKU002",
              quantity: 1,
              condition: "USED",
              listing: { title: "Used Item" },
            },
          ],
          total: 2,
        }),
      });

      const results = await fetcher.fetchAllListings("tenant-123");

      expect(results[0].condition).toBe("New");
      expect(results[1].condition).toBe("Used");
    });
  });

  describe("fetchProductBySku", () => {
    it("should fetch a single product by SKU", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sku: "SKU001",
          quantity: 5,
          price: { value: "29.99" },
          listing: { title: "Test Item" },
        }),
      });

      const result = await fetcher.fetchProductBySku(
        "tenant-123",
        "SKU001"
      );

      expect(result.sku).toBe("SKU001");
      expect(result.quantity).toBe(5);
    });

    it("should return null for 404 (product not found)", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await fetcher.fetchProductBySku(
        "tenant-123",
        "NONEXISTENT"
      );

      expect(result).toBeNull();
    });

    it("should throw error for API failures", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      await expect(
        fetcher.fetchProductBySku("tenant-123", "SKU001")
      ).rejects.toThrow("HTTP 500");
    });
  });

  describe("_normalizeInventoryItem", () => {
    it("should normalize eBay inventory format", () => {
      const item = {
        sku: "TEST-SKU-001",
        quantity: 10,
        price: { value: "99.99" },
        product: {
          title: "Test Product",
          description: "Test Description",
          condition: "NEW",
          imageUrls: ["https://example.com/img1.jpg"],
          categoryId: "12345",
        },
        listingId: "987654321",
      };

      const normalized = fetcher._normalizeInventoryItem(item);

      expect(normalized).toEqual({
        sku: "TEST-SKU-001",
        title: "Test Product",
        description: "Test Description",
        quantity: 10,
        price: 99.99,
        condition: "New",
        imageUrl: "https://example.com/img1.jpg",
        imageUrls: ["https://example.com/img1.jpg"],
        ebayListingId: "987654321",
        ebayCategoryId: "12345",
        lastUpdated: expect.any(String),
        source: "ebay",
        ebayRaw: expect.any(Object),
      });
    });

    it("should handle missing optional fields", () => {
      const item = {
        sku: "MINIMAL",
        quantity: 1,
      };

      const normalized = fetcher._normalizeInventoryItem(item);

      expect(normalized.sku).toBe("MINIMAL");
      expect(normalized.quantity).toBe(1);
      expect(normalized.imageUrl).toBeNull();
      expect(normalized.title).toBe("(No title provided)");
    });
  });
});
