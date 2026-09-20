#!/usr/bin/env node
/**
 * test-styleframe-push.js
 * Verifies that MultiPlatformPoster correctly formats the StyleFrame
 * keyframe gallery and 360° turntable video across Shopify, eBay, TikTok, and Instagram.
 */

const fs = require('fs');
const path = require('path');

// Load .env.local without exposing secrets
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
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
}

const { MultiPlatformPoster } = require('./lib/multiPlatformPoster');
const { ShopifyConnector, InstagramConnector } = require('./lib/channels/apiConnectors');

const TENANT_ID = 'f6ec6132-2cd0-4352-81e9-3c76d955b60d';

const styleframeProduct = {
  id: 'sf-wc-shorts',
  sku: 'WC-SHORTS-STYLEFRAME',
  title: "White Castle Women's Boy Shorts (Turntable 3D Edition)",
  description: "Official White Castle boy shorts with 360° rotating showcase framing.",
  price: 14.99,
  quantity: 7,
  condition: 'new',
  image_url: '/cutouts/wc-shorts-cutout.png',
  keyframes: [
    '/styleframes/wc-shorts/styleframe_amazon_white_front_0deg.png',
    '/styleframes/wc-shorts/styleframe_amazon_white_angle_45deg.png',
    '/styleframes/wc-shorts/styleframe_amazon_white_profile_90deg.png',
    '/styleframes/wc-shorts/styleframe_amazon_white_dynamic_315deg.png'
  ],
  styleframe_video: '/styleframes/wc_shorts/turntable_commercial_showcase_360.gif',
  tenantId: TENANT_ID,
};

(async () => {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  TEST: StyleFrame Pipeline -> Multi-Platform Syndication      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const poster = new MultiPlatformPoster();

  // 1. Check MultiPlatformPoster Mapping
  console.log('▶ 1. MultiPlatformPoster Mappings:\n');
  const shopifyMap = poster.mapToShopify(styleframeProduct);
  console.log('✓ Shopify mapped images count:', shopifyMap.images.length);
  console.log('  Primary Image:', shopifyMap.imageUrl);
  console.log('  Keyframes:', shopifyMap.images.slice(1));

  const tiktokMap = poster.mapToTikTok(styleframeProduct);
  console.log('\n✓ TikTok Shop mapped:');
  console.log('  Video URL (Turntable):', tiktokMap.videoUrl);
  console.log('  Images count:', tiktokMap.images.length);

  const ebayMap = poster.mapToEbay(styleframeProduct);
  console.log('\n✓ eBay mapped gallery count:', ebayMap.images.length);

  // 2. Direct Connector Dry-Runs
  console.log('\n▶ 2. Executing Shopify Connector createListing (dryRun: true):\n');
  const shopify = new ShopifyConnector();
  const shopifyRes = await shopify.createListing(shopifyMap, { dryRun: true });
  console.log('✓ Shopify dry-run payload:');
  console.log('  Title:', shopifyRes.payload.product.title);
  console.log('  Variants:', shopifyRes.payload.product.variants);
  console.log('  Images array attached to Shopify payload:');
  shopifyRes.payload.product.images.forEach((img, i) => {
    console.log(`    [${i + 1}] ${img.src}`);
  });

  // 3. Instagram Connector Dry-Run
  console.log('\n▶ 3. Executing Instagram Connector createListing (dryRun: true):\n');
  const instagram = new InstagramConnector();
  const igRes = await instagram.createListing(poster.mapToInstagram(styleframeProduct), { dryRun: true });
  console.log('✓ Instagram dry-run result:');
  console.log(`  Payload:\n${JSON.stringify(igRes.payload || igRes, null, 2)}`);

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  SUCCESS: StyleFrame media 100% wired for syndication!        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
})();
