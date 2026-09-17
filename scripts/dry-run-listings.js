#!/usr/bin/env node
// scripts/dry-run-listings.js
// Attempts createListing() in dry-run mode (never live — every connector
// here either defaults dryRun:true, or has no way to go live without an
// explicit options.confirm==='PUBLISH_LIVE'/'PUBLISH_LIVE' that this script
// never sets) against all 9 marketplace connectors with one test product.
// Reports which would actually post and the real error for any that fail.
//
// Run: node scripts/dry-run-listings.js

const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const {
  EbayConnector,
  EtsyConnector,
  FacebookConnector,
  InstagramConnector,
  BonanzaConnector,
  ShopifyConnector,
  WooCommerceConnector,
  AmazonConnector,
  TikTokShopConnector,
} = require("../lib/channels/apiConnectors");

// The real tenant_id (from tenant_members, NOT the auth user_id — see
// pages/api/channels/ebay/create-listing.js, which resolves tenantId from
// session.tenantId, already the tenant, not the raw user_id).
const TENANT_ID = "f6ec6132-2cd0-4352-81e9-3c76d955b60d";

const product = {
  title: "TEST PRODUCT — dry run only",
  description: "This is a dry-run test listing. Do not publish.",
  price: 19.99,
  quantity: 1,
  sku: "DRYRUN-TEST-001",
  images: ["https://via.placeholder.com/400x300?text=Dry+Run+Test"],
  imageUrl: "https://via.placeholder.com/400x300?text=Dry+Run+Test",
  condition: "Used",
};

const policies = {
  fulfillmentPolicyId: "dry-run-placeholder",
  paymentPolicyId: "dry-run-placeholder",
  returnPolicyId: "dry-run-placeholder",
};

async function attempt(label, fn) {
  try {
    const result = await fn();
    console.log(`\n=== ${label}: SUCCESS ===`);
    console.log(JSON.stringify(result, null, 2).slice(0, 800));
    return { label, ok: true };
  } catch (err) {
    console.log(`\n=== ${label}: FAILED ===`);
    console.log(`  code: ${err.code || "n/a"}`);
    console.log(`  message: ${err.message}`);
    return { label, ok: false, code: err.code, message: err.message };
  }
}

async function main() {
  const results = [];

  results.push(await attempt("eBay", () =>
    new EbayConnector().createListing(product, policies, { dryRun: true, tenantId: TENANT_ID })
  ));

  results.push(await attempt("Etsy", () =>
    new EtsyConnector().createListing(product, { dryRun: true, tenantId: TENANT_ID })
  ));

  results.push(await attempt("Facebook", () =>
    new FacebookConnector().createListing(product, { dryRun: true })
  ));

  results.push(await attempt("Instagram", () =>
    new InstagramConnector().createListing(product, { dryRun: true })
  ));

  results.push(await attempt("Bonanza", () =>
    new BonanzaConnector().createListing(product, { dryRun: true })
  ));

  results.push(await attempt("WooCommerce", () =>
    new WooCommerceConnector().createListing(product, { dryRun: true })
  ));

  results.push(await attempt("Amazon", () =>
    new AmazonConnector().createListing(product, { dryRun: true, tenantId: TENANT_ID })
  ));

  results.push(await attempt("TikTok Shop", () =>
    new TikTokShopConnector().createListing(product, { dryRun: true, tenantId: TENANT_ID })
  ));

  results.push(await attempt("Shopify", () =>
    new ShopifyConnector().createListing({ ...product, tenantId: TENANT_ID })
  ));

  console.log("\n\n=== SUMMARY ===");
  const col = (s, n) => String(s).padEnd(n);
  console.log(col("marketplace", 14) + col("would post?", 14) + "detail");
  console.log("-".repeat(100));
  for (const r of results) {
    console.log(col(r.label, 14) + col(r.ok ? "yes" : "no", 14) + (r.ok ? "dry-run accepted" : `${r.code || ""}: ${r.message}`));
  }
}

main();
