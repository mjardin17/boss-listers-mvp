#!/usr/bin/env node
// scripts/bitwarden-setup.js
// Pre-creates folders and EMPTY login templates (name + website only —
// username/password left blank) in Bitwarden for every real platform
// touched tonight, so the only thing left to do is open each item and
// type the actual credential in. Never reads, writes, or sees a real
// password itself — only names and URLs.
//
// Run from PowerShell, in the same session where BW_SESSION is already set:
//   node scripts/bitwarden-setup.js

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const FOLDERS = [
  "Boss Listers - Marketplaces",
  "Boss Listers - Infrastructure",
  "Jardin's Outpost - Store"
];

const ITEMS = [
  { name: "eBay", uri: "https://www.ebay.com", folder: "Boss Listers - Marketplaces" },
  { name: "Etsy", uri: "https://www.etsy.com", folder: "Boss Listers - Marketplaces" },
  { name: "Bonanza (seller account)", uri: "https://www.bonanza.com", folder: "Boss Listers - Marketplaces" },
  { name: "Bonanza (developer account)", uri: "https://api.bonanza.com", folder: "Boss Listers - Marketplaces" },
  { name: "Shopify", uri: "https://www.shopify.com", folder: "Boss Listers - Marketplaces" },
  { name: "WooCommerce", uri: "", folder: "Boss Listers - Marketplaces" },

  { name: "Supabase", uri: "https://supabase.com", folder: "Boss Listers - Infrastructure" },
  { name: "GitHub", uri: "https://github.com", folder: "Boss Listers - Infrastructure" },
  { name: "Vercel", uri: "https://vercel.com", folder: "Boss Listers - Infrastructure" },
  { name: "Cloudflare", uri: "https://dash.cloudflare.com", folder: "Boss Listers - Infrastructure" },
  { name: "Stripe", uri: "https://dashboard.stripe.com", folder: "Boss Listers - Infrastructure" },

  { name: "Jardin's Outpost - Facebook Page", uri: "https://facebook.com", folder: "Jardin's Outpost - Store" },
  { name: "Jardin's Outpost - Instagram (@jardinoutpost)", uri: "https://instagram.com", folder: "Jardin's Outpost - Store" },
  { name: "jardinsoutpost@gmail.com", uri: "https://mail.google.com", folder: "Jardin's Outpost - Store" },
  { name: "Meta Commerce Manager", uri: "https://business.facebook.com/commerce_manager", folder: "Jardin's Outpost - Store" }
];

function findBwExecutable() {
  const candidates = [
    path.join(process.env.APPDATA || "", "npm", "bw.cmd"),
    path.join(process.env.APPDATA || "", "npm", "bw.ps1")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return "bw";
}

function bw(args) {
  const bwPath = findBwExecutable();
  return execFileSync(bwPath, args, {
    encoding: "utf-8",
    env: process.env,
    shell: bwPath.endsWith(".ps1") || bwPath.endsWith(".cmd")
  }).trim();
}

function requireSession() {
  if (!process.env.BW_SESSION) {
    console.error("BW_SESSION is not set in this shell.");
    console.error('Run: $env:BW_SESSION = (& "$env:APPDATA\\npm\\bw.ps1" unlock --raw)');
    console.error("Then re-run this script in the SAME PowerShell window.");
    process.exit(1);
  }
}

function encode(obj) {
  // bw's own `encode` command reads JSON on stdin and base64-encodes it
  // the same way its client does internally, so `bw create` accepts it.
  const { spawnSync } = require("child_process");
  const bwPath = findBwExecutable();
  const result = spawnSync(bwPath, ["encode"], {
    input: JSON.stringify(obj),
    encoding: "utf-8",
    env: process.env,
    shell: bwPath.endsWith(".ps1") || bwPath.endsWith(".cmd")
  });
  if (result.status !== 0) {
    throw new Error(`bw encode failed: ${result.stderr || result.error}`);
  }
  return result.stdout.trim();
}

function main() {
  requireSession();

  console.log("Fetching existing folders...");
  const existingFolders = JSON.parse(bw(["list", "folders"]));
  const folderIdByName = {};
  for (const f of existingFolders) {
    folderIdByName[f.name] = f.id;
  }

  for (const folderName of FOLDERS) {
    if (folderIdByName[folderName]) {
      console.log(`Folder already exists: ${folderName}`);
      continue;
    }
    console.log(`Creating folder: ${folderName}`);
    const payload = encode({ name: folderName });
    const created = JSON.parse(bw(["create", "folder", payload]));
    folderIdByName[folderName] = created.id;
  }

  console.log("Fetching existing items to avoid duplicates...");
  const existingItems = JSON.parse(bw(["list", "items"]));
  const existingNames = new Set(existingItems.map((i) => i.name));

  let createdCount = 0;
  for (const item of ITEMS) {
    if (existingNames.has(item.name)) {
      console.log(`Item already exists, skipping: ${item.name}`);
      continue;
    }

    const folderId = folderIdByName[item.folder];
    const payload = encode({
      organizationId: null,
      folderId: folderId || null,
      type: 1, // login
      name: item.name,
      notes: null,
      login: {
        uris: item.uri ? [{ uri: item.uri }] : [],
        username: "",
        password: ""
      }
    });

    bw(["create", "item", payload]);
    console.log(`Created empty template: ${item.name}`);
    createdCount += 1;
  }

  console.log("");
  console.log(`Done. ${createdCount} new item templates created, ${ITEMS.length - createdCount} already existed.`);
  console.log("Open Bitwarden and fill in the username/password for each — everything else is already set up.");
}

main();
