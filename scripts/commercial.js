#!/usr/bin/env node
"use strict";
const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const v7 = require("../lib/commercialV7");

function parseArgs(argv) {
  const opts = { format: "9:16", style: "talking-head", output: "public/commercials" };
  let input;
  for (let i = 0; i < argv.length; i++) {
    if (["--topic", "--format", "--style", "--output"].includes(argv[i])) opts[argv[i].slice(2)] = argv[++i];
    else if (!input) input = argv[i];
  }
  return { input, opts };
}
async function productFromInput(input) {
  if (/^https?:\/\//i.test(input || "")) {
    const { ingestProductUrl } = require("../lib/ads4now/urlIngest");
    return ingestProductUrl(input, { downloadImage: true });
  }
  const { getCard, createVault, DEFAULT_VAULT_FILE } = require("../lib/cardVault");
  const vaultPath = path.resolve(DEFAULT_VAULT_FILE);
  if (fs.existsSync(vaultPath)) {
    const card = getCard(createVault(vaultPath), input);
    if (card) return { cardShowcaseId: card.id };
  }
  const tenantId = process.env.SUPABASE_TENANT_ID;
  if (!tenantId) throw new Error("Set SUPABASE_TENANT_ID to resolve a saved product ID; no product was fabricated.");
  const { getProductForCommercial } = require("../lib/supabaseInventory");
  const product = await getProductForCommercial(tenantId, input);
  if (!product) throw new Error(`No saved inventory item found for ID/SKU: ${input}`);
  return { ...product, image_url: product.image_url, price: product.price ?? "" };
}
async function run(argv = process.argv.slice(2)) {
  const { input, opts } = parseArgs(argv);
  if (opts.topic) {
    const draft = v7.judgeScript(v7.fallbackScript({}, opts.style, opts.topic));
    process.stdout.write(`${JSON.stringify({ script: draft.script, score: draft.score, video: null, note: "Topic-only script preview; add a seller-owned image to render. Nothing posted." }, null, 2)}\n`);
    return 0;
  }
  if (!input || input === "--help") { process.stdout.write("Usage: node scripts/commercial.js <product-id|url> [--topic TEXT] [--format 9:16|3:4] [--style STYLE]\n"); return input ? 0 : 2; }
  if (!v7.RATIOS[opts.format]) throw new Error("Format must be 9:16 or 3:4");
  const product = await productFromInput(input);
  if (product.cardShowcaseId) {
    const result = spawnSync(process.execPath, ["scripts/render-card-showcase.mjs", product.cardShowcaseId], { stdio: "inherit" });
    if (result.status !== 0) throw new Error("Card Showcase renderer failed");
    return 0;
  }
  if (!product.image_url) throw new Error("No product photo found; a video was not rendered.");
  const script = v7.judgeScript(v7.fallbackScript(product, opts.style));
  const price = product.price == null ? "" : String(product.price);
  const image = String(product.image_url);
  const imageArgs = image.startsWith("/uploads/") ? ["--image-path", path.join(process.cwd(), "public", image.slice(1))] : ["--image-url", image];
  const args = ["scripts/quick_commercial.py", "--title", product.title || "", ...imageArgs, "--platform", opts.format === "3:4" ? "3:4" : "tiktok", "--out-dir", opts.output];
  if (price) args.push("--price", price);
  const result = spawnSync(process.env.PYTHON || "python3", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(result.stderr || "Local quick-cut render failed");
  const output = result.stdout.trim().split(/\r?\n/).at(-1);
  process.stdout.write(`${JSON.stringify({ script: script.script, score: script.score, video: output, captionPack: v7.captionPack(product, script.script, "tiktok"), posted: false }, null, 2)}\n`);
  return 0;
}
if (require.main === module) run().catch((err) => { process.stderr.write(`commercial: ${err.message}\n`); process.exitCode = 1; });
module.exports = { parseArgs, productFromInput, run };
