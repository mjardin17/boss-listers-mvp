/**
 * Unit tests for EbayInventoryFetcher
 * Tests eBay API interaction, pagination, and data normalization
 */

require("dotenv").config({ path: ".env.local" });
const test = require("node:test");
const assert = require("node:assert/strict");
const { EbayInventoryFetcher } = require("../ebayInventoryFetcher");

function createFetcher() {
  const fetcher = new EbayInventoryFetcher();
  fetcher.connector = {
    _getAccessToken: async () => ({ accessToken: "mock_access_token", token: "mock_access_token" }),
  };
  return fetcher;
}

function mockLegacyFetch() {
  return {
    ok: true,
    text: async () => '<GetMyeBaySellingResponse><Ack>Success</Ack><ItemArray></ItemArray></GetMyeBaySellingResponse>',
  };
}

test("EbayInventoryFetcher - fetchAllListings should fetch all listings with pagination", async () => {
  const fetcher = createFetcher();

  const mockInventories = [
    {
      sku: "SKU001",
      listingId: "L1",
      quantity: 5,
      price: { value: "29.99" },
      product: { title: "Item 1" },
    },
    {
      sku: "SKU002",
      listingId: "L2",
      quantity: 3,
      price: { value: "49.99" },
      product: { title: "Item 2" },
    },
  ];

  const origFetch = global.fetch;
  global.fetch = async (url) => {
    if (typeof url === "string" && url.includes("ws/api.dll")) return mockLegacyFetch();
    return {
      ok: true,
      json: async () => ({
        inventories: mockInventories,
        total: 2,
      }),
    };
  };

  try {
    const results = await fetcher.fetchAllListings("tenant-123");
    assert.equal(results.length, 2);
    assert.equal(results[0].sku, "SKU001");
    assert.equal(results[1].price, 49.99);
  } finally {
    global.fetch = origFetch;
  }
});

test("EbayInventoryFetcher - fetchAllListings should handle pagination for large inventories", async () => {
  const fetcher = createFetcher();

  let page = 0;
  const origFetch = global.fetch;
  global.fetch = async (url) => {
    if (typeof url === "string" && url.includes("ws/api.dll")) return mockLegacyFetch();
    page++;
    if (page === 1) {
      return {
        ok: true,
        json: async () => ({
          inventories: Array(100)
            .fill(null)
            .map((_, i) => ({
              sku: `SKU${String(i).padStart(4, "0")}`,
              listingId: `L_${i}`,
              quantity: 1,
              price: { value: "10.00" },
              product: { title: `Item ${i}` },
            })),
          total: 150,
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        inventories: Array(50)
          .fill(null)
          .map((_, i) => ({
            sku: `SKU${String(100 + i).padStart(4, "0")}`,
            listingId: `L_${100 + i}`,
            quantity: 1,
            price: { value: "10.00" },
            product: { title: `Item ${100 + i}` },
          })),
        total: 150,
      }),
    };
  };

  try {
    const results = await fetcher.fetchAllListings("tenant-123");
    assert.equal(results.length, 150);
    assert.equal(page, 2);
  } finally {
    global.fetch = origFetch;
  }
});

test("EbayInventoryFetcher - fetchAllListings should throw error if tenantId is missing", async () => {
  const fetcher = createFetcher();
  await assert.rejects(
    async () => fetcher.fetchAllListings(null, {}),
    /tenantId is required/
  );
});

test("EbayInventoryFetcher - fetchAllListings should normalize condition codes", async () => {
  const fetcher = createFetcher();

  const origFetch = global.fetch;
  global.fetch = async (url) => {
    if (typeof url === "string" && url.includes("ws/api.dll")) return mockLegacyFetch();
    return {
      ok: true,
      json: async () => ({
        inventories: [
          {
            sku: "SKU001",
            listingId: "L1",
            quantity: 1,
            condition: "NEW",
            product: { title: "New Item" },
          },
          {
            sku: "SKU002",
            listingId: "L2",
            quantity: 1,
            condition: "USED",
            product: { title: "Used Item" },
          },
        ],
        total: 2,
      }),
    };
  };

  try {
    const results = await fetcher.fetchAllListings("tenant-123");
    assert.equal(results[0].condition, "New");
    assert.equal(results[1].condition, "Used");
  } finally {
    global.fetch = origFetch;
  }
});

test("EbayInventoryFetcher - fetchProductBySku should fetch a single product by SKU", async () => {
  const fetcher = createFetcher();

  const origFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      sku: "SKU001",
      listingId: "L1",
      quantity: 5,
      price: { value: "29.99" },
      product: { title: "Test Item" },
    }),
  });

  try {
    const result = await fetcher.fetchProductBySku("tenant-123", "SKU001");
    assert.equal(result.sku, "SKU001");
    assert.equal(result.quantity, 5);
  } finally {
    global.fetch = origFetch;
  }
});

test("EbayInventoryFetcher - fetchProductBySku should return null for 404 (product not found)", async () => {
  const fetcher = createFetcher();

  const origFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 404,
  });

  try {
    const result = await fetcher.fetchProductBySku("tenant-123", "NONEXISTENT");
    assert.equal(result, null);
  } finally {
    global.fetch = origFetch;
  }
});

test("EbayInventoryFetcher - fetchProductBySku should throw error for API failures", async () => {
  const fetcher = createFetcher();

  const origFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 500,
    text: async () => "Internal Server Error",
  });

  try {
    await assert.rejects(
      async () => fetcher.fetchProductBySku("tenant-123", "SKU001"),
      /HTTP 500/
    );
  } finally {
    global.fetch = origFetch;
  }
});

test("EbayInventoryFetcher - _normalizeInventoryItem should normalize eBay inventory format", () => {
  const fetcher = createFetcher();
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

  assert.equal(normalized.sku, "TEST-SKU-001");
  assert.equal(normalized.title, "Test Product");
  assert.equal(normalized.description, "Test Description");
  assert.equal(normalized.quantity, 10);
  assert.equal(normalized.price, 99.99);
  assert.equal(normalized.condition, "New");
  assert.equal(normalized.imageUrl, "https://example.com/img1.jpg");
  assert.deepEqual(normalized.imageUrls, ["https://example.com/img1.jpg"]);
  assert.equal(normalized.ebayListingId, "987654321");
  assert.equal(normalized.ebayCategoryId, "12345");
  assert.equal(typeof normalized.lastUpdated, "string");
  assert.equal(normalized.source, "ebay");
  assert.equal(typeof normalized.ebayRaw, "object");
});

test("EbayInventoryFetcher - _normalizeInventoryItem should handle missing optional fields", () => {
  const fetcher = createFetcher();
  const item = {
    sku: "MINIMAL",
    quantity: 1,
  };

  const normalized = fetcher._normalizeInventoryItem(item);

  assert.equal(normalized.sku, "MINIMAL");
  assert.equal(normalized.quantity, 1);
  assert.equal(normalized.imageUrl, null);
  assert.equal(normalized.title, "(No title provided)");
});
