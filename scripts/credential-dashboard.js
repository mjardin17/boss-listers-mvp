#!/usr/bin/env node
// scripts/credential-dashboard.js
// Reads which platform credentials are actually saved in Josh's Bitwarden
// vault (via the bw CLI, using $env:BW_SESSION — never touches the master
// password or the vault's encryption) and cross-references that against
// what was actually live-tested in this codebase, so "saved" and "working"
// don't get confused with each other.
//
// Run from PowerShell, in the same session where BW_SESSION is already set:
//   node scripts/credential-dashboard.js
//
// This does NOT unlock the vault, does NOT print secret values, and only
// ever reads item NAMES/URIs from `bw list items` — never a stored password.

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Same shape as CLAUDE.md's "Current State — Boss Listers" platform table,
// as of the 2026-08-24 rewrite. Update this alongside CLAUDE.md when a
// platform's real status changes — this is a second copy on purpose (a
// script shouldn't parse markdown), but it should never drift far from it.
const PLATFORM_STATUS = [
  { key: "ebay", label: "eBay", matchWords: ["ebay"], codeReady: true, liveTested: true, note: "OAuth live-tested 2026-08-24" },
  { key: "etsy", label: "Etsy", matchWords: ["etsy"], codeReady: true, liveTested: false, note: "App-level connected, shop OAuth not completed" },
  { key: "bonanza", label: "Bonanza", matchWords: ["bonanza", "bonapitit"], codeReady: true, liveTested: false, note: "Code matches real API as of tonight; needs BONANZA_DEV_ID/CERT_ID + fetchToken approval" },
  { key: "facebook", label: "Facebook (Marketplace API)", matchWords: ["facebook", "meta"], codeReady: true, liveTested: false, note: "App creds valid; needs FB_ACCESS_TOKEN/FB_PAGE_ID + Meta partner approval" },
  { key: "instagram", label: "Instagram", matchWords: ["instagram"], codeReady: false, liveTested: true, note: "Token confirmed live tonight (@godsandgloryai) but no connector calls it in this project" },
  { key: "supabase", label: "Supabase", matchWords: ["supabase"], codeReady: true, liveTested: true, note: "Live database, verified tonight" },
  { key: "github", label: "GitHub", matchWords: ["github"], codeReady: true, liveTested: true, note: "Pushes verified tonight" },
  { key: "stripe", label: "Stripe", matchWords: ["stripe"], codeReady: true, liveTested: false, note: "Billing route rebuilt tonight; no live STRIPE_API_KEY set" },
  { key: "shopify", label: "Shopify", matchWords: ["shopify"], codeReady: true, liveTested: false, note: "Not used — no store" },
  { key: "woocommerce", label: "WooCommerce", matchWords: ["woocommerce", "woo commerce"], codeReady: true, liveTested: false, note: "Not used — no store" },
];

function findBwExecutable() {
  const candidates = [
    "bw", // on PATH, if it ever gets added
    path.join(process.env.APPDATA || "", "npm", "bw.cmd"),
    path.join(process.env.APPDATA || "", "npm", "bw.ps1"),
  ];
  for (const candidate of candidates) {
    if (candidate === "bw") continue; // tried last, via execFileSync's own PATH lookup
    if (fs.existsSync(candidate)) return candidate;
  }
  return "bw";
}

function listVaultItems() {
  if (!process.env.BW_SESSION) {
    console.error("BW_SESSION is not set in this shell.");
    console.error('Run: $env:BW_SESSION = (& "$env:APPDATA\\npm\\bw.ps1" unlock --raw)');
    console.error("Then re-run this script in the SAME PowerShell window.");
    process.exit(1);
  }

  const bwPath = findBwExecutable();
  let raw;
  try {
    raw = execFileSync(bwPath, ["list", "items"], {
      encoding: "utf-8",
      env: process.env,
      shell: bwPath.endsWith(".ps1") || bwPath.endsWith(".cmd"),
    });
  } catch (err) {
    console.error("Failed to read the vault — is BW_SESSION still valid? (they expire)");
    console.error(err.message);
    process.exit(1);
  }

  try {
    return JSON.parse(raw);
  } catch {
    console.error("bw list items returned something that wasn't valid JSON.");
    process.exit(1);
  }
}

function main() {
  const items = listVaultItems();

  // Only ever look at names/URIs — never at password/notes/attachment fields.
  const haystack = items
    .map((item) => {
      const name = (item.name || "").toLowerCase();
      const uris = (item.login?.uris || []).map((u) => (u.uri || "").toLowerCase()).join(" ");
      return `${name} ${uris}`;
    })
    .join(" | ");

  console.log("");
  console.log("Boss Listers — Credential + Status Dashboard");
  console.log("(saved-in-vault is a name/URL match only — never reads a password)");
  console.log("=".repeat(78));
  console.log(
    "%s | %s | %s | %s",
    "Platform".padEnd(28),
    "Saved?".padEnd(8),
    "Live-tested?".padEnd(13),
    "Note"
  );
  console.log("-".repeat(78));

  for (const p of PLATFORM_STATUS) {
    const saved = p.matchWords.some((w) => haystack.includes(w));
    console.log(
      "%s | %s | %s | %s",
      p.label.padEnd(28),
      (saved ? "yes" : "no").padEnd(8),
      (p.liveTested ? "yes" : "no").padEnd(13),
      p.note
    );
  }

  console.log("=".repeat(78));
  console.log(`Vault items scanned: ${items.length}`);
  console.log("");
}

main();
