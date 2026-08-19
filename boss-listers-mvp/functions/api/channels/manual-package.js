// functions/api/channels/manual-package.js
// Cloudflare Pages Function: generate platform-specific listing packages for trading cards
// POST /api/channels/manual-package
// body: { product: {...} | sku: "ABC", platforms: ["facebook","mercari"], saveToVault: boolean }
// → { ok, packages: [...], vaultStatus }   or CSV download with ?format=csv
//
// `product` may be passed inline (unsaved drafts) or by `sku` (loaded from Supabase).
// If saveToVault=true, credentials from the vault are attached (for later automated posting).

import { buildManualPackage, packagesToCsv, MANUAL_PLATFORMS } from '../../lib/channels/manualPackage.js';
import { listInventory } from '../../lib/supabaseInventory.js';
import { getVault } from '../../lib/vault/credentialVault.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function csvResponse(csv, sku) {
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="listing-package-${sku || 'draft'}.csv"`,
    },
  });
}

export async function onRequestPost({ request, env, data }) {
  try {
    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
    }

    const body = await request.json();
    const { product: inlineProduct, sku, platforms, saveToVault } = body || {};
    const targets = Array.isArray(platforms) && platforms.length
      ? platforms
      : Object.keys(MANUAL_PLATFORMS);

    let product = inlineProduct;
    if (!product && sku) {
      const rows = await listInventory();
      product = rows.find((r) => r.sku === sku);
      if (!product) {
        return jsonResponse({ ok: false, error: `SKU not found in inventory: ${sku}` }, 404);
      }
    }
    if (!product) {
      return jsonResponse({ ok: false, error: 'Provide either `product` or `sku`' }, 400);
    }

    const packages = targets.map((p) => buildManualPackage(product, p));

    // Optionally attach vault credentials for automated posting later
    let vaultStatus = null;
    if (saveToVault) {
      const vault = getVault();
      vaultStatus = await vault.getStatus();
      // Attach vault availability info to packages (not actual credentials)
      packages.forEach((pkg) => {
        pkg.vaultAvailable = vaultStatus.connected.includes(pkg.platformId || pkg.platform);
      });
    }

    const format = new URL(request.url).searchParams.get('format');
    if (format === 'csv') {
      return csvResponse(packagesToCsv(packages), product.sku || 'draft');
    }

    return jsonResponse({ ok: true, packages, vaultStatus }, 200);
  } catch (err) {
    console.error('[api/channels/manual-package]', err.message);
    return jsonResponse({ ok: false, error: err.message }, err.statusCode || 500);
  }
}
