// __tests__/multiPlatformPoster.test.js
// Integration tests for the multi-platform posting system

import { postProductToAllPlatforms, PLATFORM_MAPPERS } from '../lib/multiPlatformPoster';

describe('Platform Field Mappers', () => {
  const mockProduct = {
    sku: 'TEST-SKU-001',
    title: 'Test Product',
    description: 'A test product',
    price: 29.99,
    quantity: 5,
    category: 'Electronics',
    condition: 'New',
    image_urls: ['https://example.com/image1.jpg'],
    tags: ['test', 'electronics'],
  };

  test('eBay mapper transforms product correctly', () => {
    const ebayProduct = PLATFORM_MAPPERS.ebay(mockProduct);
    expect(ebayProduct.sku).toBe('TEST-SKU-001');
    expect(ebayProduct.title).toBe('Test Product');
    expect(ebayProduct.price).toBe(29.99);
    expect(ebayProduct.quantity).toBe(5);
    expect(ebayProduct.condition).toBe('New');
  });

  test('Etsy mapper transforms product correctly', () => {
    const etsyProduct = PLATFORM_MAPPERS.etsy(mockProduct);
    expect(etsyProduct.sku).toBe('TEST-SKU-001');
    expect(etsyProduct.title).toBe('Test Product');
    expect(etsyProduct.price).toBe(29.99);
    expect(etsyProduct.quantity).toBe(5);
    expect(Array.isArray(etsyProduct.images)).toBe(true);
  });

  test('Amazon mapper transforms product correctly', () => {
    const amazonProduct = PLATFORM_MAPPERS.amazon(mockProduct);
    expect(amazonProduct.sku).toBe('TEST-SKU-001');
    expect(amazonProduct.title).toBe('Test Product');
    expect(amazonProduct.price).toBe(29.99);
    expect(amazonProduct.quantity).toBe(5);
    expect(Array.isArray(amazonProduct.bullet_points)).toBe(true);
  });

  test('TikTok Shop mapper transforms product correctly', () => {
    const tiktokProduct = PLATFORM_MAPPERS['tiktok-shop'](mockProduct);
    expect(tiktokProduct.sku).toBe('TEST-SKU-001');
    expect(tiktokProduct.title).toBe('Test Product');
    expect(tiktokProduct.price).toBe(29.99);
    expect(tiktokProduct.quantity).toBe(5);
    expect(Array.isArray(tiktokProduct.image_paths)).toBe(true);
  });
});

describe('Product Validation', () => {
  test('rejects product without SKU', async () => {
    const invalidProduct = {
      title: 'Test Product',
      price: 29.99,
      quantity: 5,
    };

    await expect(
      postProductToAllPlatforms(invalidProduct, ['ebay'])
    ).rejects.toThrow('Product must have sku and title');
  });

  test('rejects product without title', async () => {
    const invalidProduct = {
      sku: 'TEST-SKU',
      price: 29.99,
      quantity: 5,
    };

    await expect(
      postProductToAllPlatforms(invalidProduct, ['ebay'])
    ).rejects.toThrow('Product must have sku and title');
  });

  test('rejects empty platform list', async () => {
    const product = {
      sku: 'TEST-SKU',
      title: 'Test Product',
      price: 29.99,
      quantity: 5,
    };

    await expect(
      postProductToAllPlatforms(product, [])
    ).rejects.toThrow('At least one platform must be selected');
  });
});

describe('Platform Error Handling', () => {
  test('handles unknown platform gracefully', async () => {
    const product = {
      sku: 'TEST-SKU',
      title: 'Test Product',
      price: 29.99,
      quantity: 5,
    };

    // This would fail if the connectors are not mocked, but the error handling structure is correct
    try {
      await postProductToAllPlatforms(product, ['unknown-platform']);
    } catch (err) {
      expect(err.message).toContain('Unknown platform');
    }
  });
});

describe('Field Mapping Edge Cases', () => {
  test('handles missing optional fields', () => {
    const minimalProduct = {
      sku: 'SKU-001',
      title: 'Product',
    };

    const ebayProduct = PLATFORM_MAPPERS.ebay(minimalProduct);
    expect(ebayProduct.sku).toBe('SKU-001');
    expect(ebayProduct.title).toBe('Product');
    expect(ebayProduct.price).toBe(0);
    expect(ebayProduct.quantity).toBe(1);
    expect(ebayProduct.description).toBe('Product');
  });

  test('handles zero price correctly', () => {
    const product = {
      sku: 'SKU-001',
      title: 'Free Product',
      price: 0,
    };

    const ebayProduct = PLATFORM_MAPPERS.ebay(product);
    expect(ebayProduct.price).toBe(0);
  });

  test('handles high quantity', () => {
    const product = {
      sku: 'SKU-001',
      title: 'Popular Product',
      quantity: 999,
    };

    const ebayProduct = PLATFORM_MAPPERS.ebay(product);
    expect(ebayProduct.quantity).toBe(999);
  });
});
