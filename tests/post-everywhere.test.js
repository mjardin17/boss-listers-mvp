const test = require("node:test");
const assert = require("node:assert");
const { buildManualPackage, MANUAL_PLATFORMS } = require("../lib/channels/manualPackage");

test("Post Everywhere System", async (t) => {
  const testProduct = {
    sku: "TEST-001",
    title: "Nike Air Max",
    brand: "Nike",
    price: 89.99,
    condition: "Like New",
    description: "Excellent condition, barely worn",
    size: "10",
    image_url: "https://example.com/image.jpg",
  };

  await t.test("Generates Facebook package", () => {
    const pkg = buildManualPackage(testProduct, "facebook");
    assert.strictEqual(pkg.platform, "facebook");
    assert.ok(pkg.fields.title);
    assert.ok(pkg.fields.description);
    assert.strictEqual(pkg.fields.price, "89.99");
    assert.ok(pkg.postUrl.includes("facebook.com"));
  });

  await t.test("Generates Poshmark package with brand-forward title", () => {
    const pkg = buildManualPackage(testProduct, "poshmark");
    assert.strictEqual(pkg.platform, "poshmark");
    assert.ok(pkg.fields.title.includes("Nike"));
    assert.ok(pkg.fields.title.includes("Air Max"));
    assert.ok(pkg.postUrl.includes("poshmark.com"));
  });

  await t.test("Generates Craigslist package (plain text)", () => {
    const pkg = buildManualPackage(testProduct, "craigslist");
    assert.strictEqual(pkg.platform, "craigslist");
    assert.ok(pkg.fields.title.length <= 70);
    assert.ok(pkg.postUrl.includes("craigslist.org"));
  });

  await t.test("Generates Mercari package (keyword-dense)", () => {
    const pkg = buildManualPackage(testProduct, "mercari");
    assert.strictEqual(pkg.platform, "mercari");
    assert.ok(pkg.fields.keywords.length > 0);
    assert.ok(pkg.postUrl.includes("mercari.com"));
  });

  await t.test("Generates Pinterest package", () => {
    const pkg = buildManualPackage(testProduct, "pinterest");
    assert.strictEqual(pkg.platform, "pinterest");
    assert.ok(pkg.fields.title);
    assert.ok(pkg.fields.description);
    assert.ok(pkg.postUrl.includes("pinterest.com"));
  });

  await t.test("Respects platform-specific title length limits", () => {
    const longTitle = "A".repeat(500);
    const product = { ...testProduct, title: longTitle };

    Object.keys(MANUAL_PLATFORMS).forEach((platform) => {
      const pkg = buildManualPackage(product, platform);
      const max = MANUAL_PLATFORMS[platform].titleMax;
      assert.ok(pkg.fields.title.length <= max, `${platform} title exceeds limit`);
    });
  });

  await t.test("Respects platform-specific description length limits", () => {
    const longDesc = "B".repeat(10000);
    const product = { ...testProduct, description: longDesc };

    Object.keys(MANUAL_PLATFORMS).forEach((platform) => {
      const pkg = buildManualPackage(product, platform);
      const max = MANUAL_PLATFORMS[platform].descriptionMax;
      assert.ok(pkg.fields.description.length <= max, `${platform} description exceeds limit`);
    });
  });

  await t.test("Includes shipping info based on platform", () => {
    const fbPkg = buildManualPackage(testProduct, "facebook");
    assert.ok(fbPkg.fields.shippingText.includes("Shipping"));

    const clPkg = buildManualPackage(testProduct, "craigslist");
    assert.ok(clPkg.fields.shippingText.includes("Local pickup"));
  });

  await t.test("Includes photo checklist", () => {
    const pkg = buildManualPackage(testProduct, "facebook");
    assert.ok(Array.isArray(pkg.photoChecklist));
    assert.ok(pkg.photoChecklist.length > 0);
  });

  await t.test("Includes tone guide for each platform", () => {
    const fbPkg = buildManualPackage(testProduct, "facebook");
    assert.ok(fbPkg.toneGuide.includes("casual"));

    const clPkg = buildManualPackage(testProduct, "craigslist");
    assert.ok(clPkg.toneGuide.includes("plain"));

    const poshPkg = buildManualPackage(testProduct, "poshmark");
    assert.ok(poshPkg.toneGuide.includes("brand"));
  });

  await t.test("Builds keywords from product data", () => {
    const pkg = buildManualPackage(testProduct, "facebook");
    const keywords = pkg.fields.keywords;
    assert.ok(keywords.length > 0);
  });

  await t.test("All platforms have required fields", () => {
    Object.keys(MANUAL_PLATFORMS).forEach((platform) => {
      const spec = MANUAL_PLATFORMS[platform];
      assert.ok(spec.label, `${platform} missing label`);
      assert.ok(spec.titleMax > 0, `${platform} missing titleMax`);
      assert.ok(spec.descriptionMax > 0, `${platform} missing descriptionMax`);
      assert.ok(spec.postUrl, `${platform} missing postUrl`);
      assert.ok(spec.tone, `${platform} missing tone`);
      assert.ok(spec.categoryHint, `${platform} missing categoryHint`);
    });
  });

  await t.test("Message format for content script is correct", () => {
    const pkg = buildManualPackage(testProduct, "facebook");
    const message = {
      action: "FILL_LISTING",
      fields: pkg.fields,
      categorySuggestion: pkg.fields.categorySuggestion,
      autoSubmit: true,
    };

    assert.strictEqual(message.action, "FILL_LISTING");
    assert.ok(message.fields);
    assert.ok(message.fields.title);
    assert.ok(message.fields.price);
    assert.ok(message.fields.description);
    assert.strictEqual(message.autoSubmit, true);
  });

  await t.test("Handles missing optional fields", () => {
    const minimalProduct = {
      sku: "MIN-001",
      title: "Item",
      price: 10,
    };

    Object.keys(MANUAL_PLATFORMS).forEach((platform) => {
      const pkg = buildManualPackage(minimalProduct, platform);
      assert.ok(pkg.fields.title);
      assert.ok(pkg.fields.price);
    });
  });

  await t.test("Handles price as number and string", () => {
    const productNum = { sku: "P1", title: "Item", price: 99.99 };
    const productStr = { sku: "P2", title: "Item", price: "99.99" };

    const pkg1 = buildManualPackage(productNum, "facebook");
    const pkg2 = buildManualPackage(productStr, "facebook");

    assert.strictEqual(pkg1.fields.price, "99.99");
    assert.strictEqual(pkg2.fields.price, "99.99");
  });

  await t.test("Truncates long titles gracefully", () => {
    const longProduct = {
      sku: "LONG-001",
      title: "A".repeat(500),
      price: 10,
    };

    const pkg = buildManualPackage(longProduct, "facebook");
    assert.ok(pkg.fields.title.endsWith("…"));
    assert.ok(pkg.fields.title.length <= MANUAL_PLATFORMS.facebook.titleMax);
  });

  await t.test("Includes SKU reference in description footer", () => {
    const product = {
      sku: "REF-123",
      title: "Item",
      price: 10,
      description: "Test item",
    };

    const pkg = buildManualPackage(product, "facebook");
    assert.ok(pkg.fields.description.includes("REF-123"));
  });

  await t.test("All critical platforms present", () => {
    const requiredPlatforms = ["facebook", "poshmark", "craigslist", "mercari", "pinterest", "amazon", "woocommerce"];
    requiredPlatforms.forEach((platform) => {
      assert.ok(MANUAL_PLATFORMS[platform], `Missing platform: ${platform}`);
    });
  });

  await t.test("Generates Amazon Seller Central package", () => {
    const pkg = buildManualPackage(testProduct, "amazon");
    assert.strictEqual(pkg.platform, "amazon");
    assert.ok(pkg.fields.title);
    assert.ok(pkg.fields.title.length <= 200);
    assert.ok(pkg.postUrl.includes("sellercentral.amazon.com"));
  });

  await t.test("Generates WooCommerce package", () => {
    const pkg = buildManualPackage(testProduct, "woocommerce");
    assert.strictEqual(pkg.platform, "woocommerce");
    assert.ok(pkg.fields.title);
    assert.ok(pkg.fields.title.length <= 100);
    assert.ok(pkg.postUrl.includes("wp-admin"));
  });
});
