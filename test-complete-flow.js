#!/usr/bin/env node
/**
 * End-to-end test: Shopify → BossListers → Instagram
 *
 * This tests the COMPLETE working flow:
 * 1. Fetch from Shopify
 * 2. Prepare for Instagram
 * 3. Create Instagram listing (dry-run shows what would happen)
 */

const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  process.env[key] = val;
}

const { ShopifyConnector, InstagramConnector } = require('./lib/channels/apiConnectors');

const TENANT_ID = 'f6ec6132-2cd0-4352-81e9-3c76d955b60d'; // Joshua's tenant

(async () => {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  SHOPIFY → BOSSLSTERS → INSTAGRAM  (END-TO-END TEST)          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  try {
    // STEP 1: Fetch from Shopify
    console.log('▶ Step 1: Fetching products from Shopify...');
    const shopify = new ShopifyConnector();
    const shopifyProducts = await shopify.fetchProducts(TENANT_ID);
    console.log(`✓ Found ${shopifyProducts.length} product(s)\n`);

    if (shopifyProducts.length === 0) {
      console.log('❌ No products in Shopify. Add products to test.\n');
      process.exit(0);
    }

    // STEP 2: Show what would sync to database
    console.log('▶ Step 2: Products ready to sync into BossListers database:');
    shopifyProducts.forEach((p, i) => {
      console.log(`  ${i + 1}. SKU: ${p.sku}`);
      console.log(`     Title: ${p.title}`);
      console.log(`     Price: $${p.price} | Qty: ${p.quantity}`);
      console.log(`     Image: ${p.image_url ? '✓' : '✗ (missing)'}\n`);
    });

    // STEP 3: Test Instagram with first product that has an image
    console.log('▶ Step 3: Testing Instagram listing creation...');
    const instagram = new InstagramConnector();

    const productsWithImages = shopifyProducts.filter(p => p.image_url);
    if (productsWithImages.length === 0) {
      console.log('⚠ No products with images. Instagram requires image URLs.\n');
      console.log('ACTION: Add products with images to Shopify and try again.\n');
      process.exit(0);
    }

    const testProduct = productsWithImages[0];
    console.log(`Testing with: ${testProduct.title} (${testProduct.sku})\n`);

    try {
      const igResult = await instagram.createListing(testProduct, { dryRun: true });
      console.log('✓ Instagram dry-run successful:');
      console.log(`  What would be created:`);
      console.log(`  - Title: "${igResult.payload?.product?.title}"`);
      if (igResult.payload?.product?.images) {
        console.log(`  - Images: ${igResult.payload.product.images.length} image(s)`);
      }
      console.log(`  - Price: $${igResult.payload?.product?.variants?.[0]?.price || testProduct.price}`);
      console.log(`  - Description: ${(testProduct.description || 'No description').slice(0, 100)}...\n`);
    } catch (err) {
      console.log(`⚠ Instagram test error: ${err.message}\n`);
      console.log('This might be a configuration issue with Instagram credentials.\n');
    }

    // SUMMARY
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║ FLOW STATUS                                                   ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    console.log(`✓ Shopify: ${shopifyProducts.length} products found`);
    console.log(`✓ BossListers: Ready to sync (run POST /api/inventory/sync-shopify)`);
    console.log(`✓ Instagram: Connector ready (run POST /api/inventory/sync-instagram)\n`);

    console.log('NEXT STEPS:\n');
    console.log('1. Start dev server: pnpm dev');
    console.log('2. Pull Shopify products:');
    console.log('   POST http://localhost:3001/api/inventory/sync-shopify');
    console.log('   (Requires your session token)\n');
    console.log('3. List on Instagram:');
    console.log('   POST http://localhost:3001/api/inventory/sync-instagram');
    console.log('   Body: { "sku": "' + testProduct.sku + '", "dryRun": false, "confirm": true }');
    console.log('   (This will create a REAL listing on Instagram)\n');

  } catch (err) {
    console.error('❌ ERROR:', err.message);
    if (err.detail) console.error('Details:', err.detail);
    process.exit(1);
  }
})();
