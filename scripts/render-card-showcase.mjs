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
 *   - python + opencv-python-headless, numpy, pillow (scripts/crop_card.py isolates the card)
 */

import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import os from "os";
import fs from "fs";
import { spawnSync } from "child_process";

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

// ── Resolve photo path & encode as base64 Data URI ─────────────────────────
// Remotion renders inside Chrome headless. Local file:// URLs are blocked by Chrome security,
// and localhost:3000 only serves the webpack bundle.
// Converting the image to a base64 data URI allows Chrome to load the image directly
// with zero network requests and no security blocks.

function frontImageToAbsPath(frontImage) {
  const relative = frontImage.startsWith("/")
    ? frontImage.slice(1)
    : frontImage;
  return path.join(ROOT, "public", relative);
}

const photoAbsPath = frontImageToAbsPath(card.frontImage);

if (!fs.existsSync(photoAbsPath)) {
  console.error(`\n❌ Photo not found on disk: ${photoAbsPath}\n`);
  process.exit(1);
}

// ── Card-only crop (no hands, no room) & base64 Data URL ─────────────────────
// The reel must show ONLY the card. scripts/crop_card.py finds the card,
// flattens it and cuts it out with rounded corners. Results are cached in
// public/uploads/cards-cropped/. If the crop fails we STOP: rendering the raw
// phone photo is never an acceptable fallback.
const croppedDir = path.join(ROOT, "public", "uploads", "cards-cropped");
const croppedPath = path.join(
  croppedDir,
  path.basename(photoAbsPath).replace(/\.[^.]+$/, "") + ".png"
);

if (!fs.existsSync(croppedPath)) {
  fs.mkdirSync(croppedDir, { recursive: true });
  console.log(`\n✂️  Cropping card out of photo …`);
  const py = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const res = spawnSync(py, [path.join(ROOT, "scripts", "crop_card.py"), photoAbsPath, croppedPath], {
    encoding: "utf8",
  });
  if (res.error || res.status !== 0) {
    const reason = res.error?.message || (res.stderr || "").trim() || `exit ${res.status}`;
    console.error(
      `\n❌ Could not isolate the card from the photo: ${reason}\n` +
        (res.status === 3
          ? `   Install deps: ${py} -m pip install opencv-python-headless numpy pillow\n`
          : `   Retake the photo with the card flat on a plain surface, then re-run.\n`) +
        `   Not rendering — the raw photo (hand/background) is never used.\n`
    );
    process.exit(1);
  }
}

const croppedBuffer = fs.readFileSync(croppedPath);
const photoUrl = `data:image/png;base64,${croppedBuffer.toString("base64")}`;
console.log(`    ✅ Card-only image: ${path.relative(ROOT, croppedPath)} (${Math.round(croppedBuffer.length / 1024)} KB)`);

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
  photoUrl,
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
console.log(`    Card image : ${path.relative(ROOT, croppedPath)}`);

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
