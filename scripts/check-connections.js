#!/usr/bin/env node
// scripts/check-connections.js
// Read-only status report for all 9 marketplace connectors wired in
// lib/channels/apiConnectors.js. Calls each connector's testConnection() —
// a status probe only (connector.js's own contract: no connector may
// report "connected" without a real testConnection() call succeeding, and
// none of them create/update/delete anything from this call). App-credential
// presence is reported by env var NAME only — this script never prints a
// credential value.
//
// Run: node scripts/check-connections.js

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

const CONNECTORS = [
  { label: "eBay", Cls: EbayConnector },
  { label: "Etsy", Cls: EtsyConnector },
  { label: "Facebook", Cls: FacebookConnector },
  { label: "Instagram", Cls: InstagramConnector },
  { label: "Bonanza", Cls: BonanzaConnector },
  { label: "Shopify", Cls: ShopifyConnector },
  { label: "WooCommerce", Cls: WooCommerceConnector },
  { label: "Amazon", Cls: AmazonConnector },
  { label: "TikTok Shop", Cls: TikTokShopConnector },
];

const TIMEOUT_MS = 15_000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function main() {
  const rows = [];

  for (const { label, Cls } of CONNECTORS) {
    const envNames = Cls.ENV || [];
    const missing = envNames.filter((n) => !process.env[n]);
    const credsPresent = envNames.length > 0 && missing.length === 0;

    let probe;
    try {
      const connector = new Cls();
      probe = await withTimeout(connector.testConnection(), TIMEOUT_MS);
    } catch (err) {
      probe = { status: "error", detail: err.message };
    }

    rows.push({ marketplace: label, envNames, credsPresent, missing, status: probe.status, detail: probe.detail });
  }

  const col = (s, n) => String(s).padEnd(n);
  console.log(col("marketplace", 14) + col("app creds present?", 34) + col("probe result", 24) + "detail");
  console.log("-".repeat(140));
  for (const r of rows) {
    const credsCol = r.envNames.length === 0
      ? "n/a"
      : r.credsPresent
        ? "yes"
        : `no (missing: ${r.missing.join(", ")})`;
    console.log(col(r.marketplace, 14) + col(credsCol, 34) + col(r.status, 24) + r.detail);
  }

  process.exitCode = 0;
}

main();
