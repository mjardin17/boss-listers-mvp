#!/usr/bin/env node
/**
 * render-card-showcase.mjs
 * Standalone CLI render script: vault card → Card Showcase reel (1080×1920, 12s, h264)
 *
 * Usage:
 *   node scripts/render-card-showcase.mjs                        # first card with photo
 *   node scripts/render-card-showcase.mjs card-oddish-lost-origin-001  # specific card id
 *
 * Output: public/commercials/<slug>_showcase_9_16.mp4
 *
 * Requirements:
 *   - data/card-vault.json must exist (not committed — personal data)
 *   - Remotion + bundler + renderer installed (pnpm)
 *   - sharp installed for EXIF auto-rotation
 */

import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import os from "os";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

// ── Vault helpers ──────────────────────────────────────────────────────────────
const {
  createVault,
  getCard,
  getFirstCardWithPhoto,
  DEFAULT_VAULT_FILE,
} = require("../lib/cardVault.js");

// ── Arg parsing ────────────────────────────────────────────────────────────────
const cardIdArg = process.argv[2] ?? null;

// ── Load vault ─────────────────────────────────────────────────────────────────
const vaultPath = DEFAULT_VAULT_FILE; // data/card-vault.json (relative to CWD)
const absVaultPath = path.isAbsolute(vaultPath)
  ? vaultPath
  : path.join(ROOT, vaultPath);

if (!fs.existsSync(absVaultPath)) {
  console.error(
    `\n❌ Vault file not found: ${absVaultPath}\n` +
      `   Create data/card-vault.json (see summary for the seed template).\n`
  );
  process.exit(1);
}

const vault = createVault(absVaultPath);

// ── Find card ──────────────────────────────────────────────────────────────────
let card;
if (cardIdArg) {
  card = getCard(vault, cardIdArg);
  if (!card) {
    console.error(`\n❌ Card not found: ${cardIdArg}\n`);
    process.exit(1);
  }
} else {
  card = getFirstCardWithPhoto(vault);
  if (!card) {
    console.error(`\n❌ No card with a photo found in the vault.\n`);
    process.exit(1);
  }
}

if (card.needsReview) {
  console.error(
    `\n⚠️  Card "${card.id}" is flagged needsReview=true. Fix the card data before rendering.\n`
  );
  process.exit(1);
}

if (!card.frontImage) {
  console.error(`\n❌ Card "${card.id}" has no frontImage.\n`);
  process.exit(1);
}

console.log(`\n📦  Card selected: ${card.id}`);
console.log(`    ${card.fields?.player ?? "?"} | ${card.fields?.set ?? "?"} | ${card.fields?.year ?? "?"} | ${card.fields?.cardNumber ?? "?"}`);

// ── Resolve photo path → file:// URL ──────────────────────────────────────────
// frontImage is stored as "/uploads/filename.jpg" (a Next.js public path)
// In a Remotion renderMedia context, we can't serve via localhost without the
// dev server running. We use the absolute local file:// path instead.

function frontImageToFileUrl(frontImage) {
  // e.g. "/uploads/1788198862494-....jpg"
  const relative = frontImage.startsWith("/")
    ? frontImage.slice(1)
    : frontImage;
  const abs = path.join(ROOT, "public", relative);
  return { abs, fileUrl: `file:///${abs.replace(/\\/g, "/")}` };
}

const { abs: photoAbsPath, fileUrl: rawPhotoUrl } = frontImageToFileUrl(card.frontImage);

if (!fs.existsSync(photoAbsPath)) {
  console.error(`\n❌ Photo not found on disk: ${photoAbsPath}\n`);
  process.exit(1);
}

// ── EXIF auto-rotation ────────────────────────────────────────────────────────
// The Oddish photo has EXIF orientation=6 (90° CW rotation).
// Remotion's browser renderer blocks file:// URLs for security reasons.
// Strategy: rotate the image into public/uploads/ (already gitignored) and
// reference it as a public-dir path so Remotion can serve it over localhost.

// publicDir that Remotion will serve (same as Next.js public folder)
const publicDir = path.join(ROOT, "public");

let photoPublicRelPath = null; // e.g. "/uploads/rotated-....jpg"
let tempRotatedPath = null;    // absolute path of the temp file (for cleanup)

// Raw public path from the vault (e.g. "/uploads/original.jpg")
const rawPublicRelPath = card.frontImage; // "/uploads/..."

try {
  const sharp = require("sharp");
  const rotatedFilename = `showcase-rotated-${Date.now()}.jpg`;
  tempRotatedPath = path.join(publicDir, "uploads", rotatedFilename);

  console.log(`\n🔄  Auto-rotating photo (sharp, EXIF-aware) → ${tempRotatedPath}`);
  await sharp(photoAbsPath)
    .rotate() // auto-rotate based on EXIF orientation
    .jpeg({ quality: 95 })
    .toFile(tempRotatedPath);

  photoPublicRelPath = `/uploads/${rotatedFilename}`;
  console.log(`    ✅ Rotation applied. Public path: ${photoPublicRelPath}`);
} catch (err) {
  if (err.code === "MODULE_NOT_FOUND") {
    console.warn(
      `\n⚠️  sharp not found — using raw photo (EXIF rotation NOT applied).\n` +
        `   Install with: pnpm add sharp\n`
    );
  } else {
    console.warn(`\n⚠️  sharp auto-rotate failed: ${err.message}\n   Using raw photo.\n`);
  }
  // Fall back to original (may be sideways for Oddish)
  photoPublicRelPath = rawPublicRelPath;
}

// Remotion serves publicDir at the bundle root; paths are accessed as "/" + relative
// The <Img> src in the composition will be e.g. "/uploads/showcase-rotated-....jpg"
const photoFileUrl = photoPublicRelPath;

// ── Build CardShowcaseProps ───────────────────────────────────────────────────
const f = card.fields ?? {};

const cardName = (f.player || f.team || "CARD").toUpperCase();
const setName = f.set ?? "";
const year = f.year ?? null;
const cardNumber = f.cardNumber ?? null;

// Price: ONLY if vault has a finite positive number stored. NEVER invent.
const suggestedPrice =
  typeof card.price === "number" && Number.isFinite(card.price) && card.price > 0
    ? card.price
    : null;

const cardShowcaseProps = {
  cardName,
  setName,
  year,
  cardNumber,
  photoUrl: photoFileUrl,
  suggestedPrice,
  brandName: "JARDIN'S OUTPOST",
  subBrand: "BOSSLISTERS",
  callToAction: "FROM THE VAULT",
  handle: "@jardinsoutpost",
  searchLine: "Find on eBay: Jardin's Outpost",
  musicUrl: null,
};

console.log(`\n🎬  Showcase props:`);
console.log(`    Card Name  : ${cardShowcaseProps.cardName}`);
console.log(`    Set        : ${cardShowcaseProps.setName}`);
console.log(`    Year       : ${cardShowcaseProps.year}`);
console.log(`    Card #     : ${cardShowcaseProps.cardNumber}`);
console.log(
  `    Price      : ${cardShowcaseProps.suggestedPrice !== null ? `$${cardShowcaseProps.suggestedPrice.toFixed(2)}` : "(none — not stored in vault)"}`
);
console.log(`    Photo URL  : ${cardShowcaseProps.photoUrl}`);

// ── Output path ───────────────────────────────────────────────────────────────
const slug = card.id.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
const outputDir = path.join(ROOT, "public", "commercials");
fs.mkdirSync(outputDir, { recursive: true });
const outputFile = path.join(outputDir, `${slug}_showcase_9_16.mp4`);

console.log(`\n📁  Output: ${outputFile}`);

// ── Remotion bundle ───────────────────────────────────────────────────────────
const entryPoint = path.join(ROOT, "video", "index.ts");
console.log(`\n📦  Bundling ${entryPoint} …`);

const serveUrl = await bundle({
  entryPoint,
  webpackOverride: (config) => config,
});

console.log(`    ✅ Bundle ready: ${serveUrl}`);

// ── Verify CardShowcase composition exists ────────────────────────────────────
const compositions = await getCompositions(serveUrl, {
  inputProps: { card: cardShowcaseProps },
});

const composition = compositions.find((c) => c.id === "CardShowcase");
if (!composition) {
  console.error(
    `\n❌ Composition "CardShowcase" not found in bundle.\n` +
      `   Found: ${compositions.map((c) => c.id).join(", ")}\n`
  );
  process.exit(1);
}

console.log(
  `    ✅ Composition found: CardShowcase (${composition.width}×${composition.height}, ${composition.durationInFrames} frames @ ${composition.fps}fps)`
);

// ── Render ────────────────────────────────────────────────────────────────────
console.log(`\n🎥  Rendering …`);

await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: outputFile,
  inputProps: { card: cardShowcaseProps },
  onProgress: ({ progress }) => {
    const pct = Math.round(progress * 100);
    process.stdout.write(`\r    Progress: ${pct}%   `);
  },
  timeoutInMilliseconds: 5 * 60 * 1000, // 5-minute cap
});

process.stdout.write("\n");
console.log(`\n✅  Render complete!`);

// ── Cleanup temp file ─────────────────────────────────────────────────────────
if (tempRotatedPath && fs.existsSync(tempRotatedPath)) {
  fs.unlinkSync(tempRotatedPath);
}

// ── Report ────────────────────────────────────────────────────────────────────
const stat = fs.statSync(outputFile);
const sizeMB = (stat.size / 1024 / 1024).toFixed(2);

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CARD SHOWCASE RENDER COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Card used   : ${card.id}
               ${card.fields?.player ?? "?"} · ${card.fields?.set ?? "?"} · ${card.fields?.year ?? "?"} · ${card.fields?.cardNumber ?? "?"}
  Output file : ${outputFile}
  File size   : ${sizeMB} MB
  Dimensions  : 1080×1920 (9:16) · 12s · h264
  Price shown : ${suggestedPrice !== null ? `$${suggestedPrice.toFixed(2)} (from vault)` : "none (not stored)"}

  To re-render this card:
    cd C:\\Users\\jjard\\claude\\BossListers
    node scripts/render-card-showcase.mjs ${card.id}

  To render any card by ID:
    node scripts/render-card-showcase.mjs <card-id>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
