#!/usr/bin/env node
/**
 * Add White Castle shorts to BossListers inventory
 * Then push to Shopify + Instagram
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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT_ID = 'f6ec6132-2cd0-4352-81e9-3c76d955b60d';

async function rest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Supabase ${options.method || "GET"} ${path} failed (${res.status}): ${detail}`);
  }
  return res.status === 204 ? null : res.json();
}

(async () => {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  ADD WHITE CASTLE SHORTS TO BOSSLSTERS                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  try {
    // Add product to BossListers inventory
    console.log('Adding White Castle Women\'s Boy Shorts to inventory...\n');

    const product = {
      tenant_id: TENANT_ID,
      sku: 'WC-SHORTS-2024',
      title: 'White Castle Women\'s Boy Shorts',
      description: 'White Castle branded women\'s boy shorts. 95% Polyester 5% Spandex. Machine wash cold.',
      price: 14.99,
      quantity: 7,
      condition: 'new',
      status: 'active',
      source: 'manual',
      published: true,
    };

    const result = await rest('/products', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(product),
    });

    console.log('✓ Product added to BossListers:\n');
    console.log(`  SKU: ${result.sku}`);
    console.log(`  Title: ${result.title}`);
    console.log(`  Price: $${result.price}`);
    console.log(`  Quantity: ${result.quantity}\n`);

    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  NEXT STEPS                                                   ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log('1. Start the dev server:\n');
    console.log('   pnpm dev\n');

    console.log('2. Push to Shopify:\n');
    console.log('   curl -X POST http://localhost:3001/api/inventory/sync-shopify-outbound \\');
    console.log('     -H "Authorization: Bearer YOUR_SESSION_TOKEN" \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"sku": "WC-SHORTS-2024", "dryRun": false, "confirm": true}\'\n');

    console.log('3. Push to Instagram:\n');
    console.log('   curl -X POST http://localhost:3001/api/inventory/sync-instagram \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"sku": "WC-SHORTS-2024", "dryRun": false, "confirm": true}\'\n');

    console.log('Product is now in BossListers. Ready to ship to platforms.\n');

  } catch (err) {
    console.error('❌ ERROR:', err.message);
    process.exit(1);
  }
})();
