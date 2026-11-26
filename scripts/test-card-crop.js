const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const sharp = require("sharp");

const { CROP_CACHE_VERSION, cropCacheDir, cropCachePath } = require("../lib/cardCropCache");

const ROOT = path.resolve(__dirname, "..");
const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const CROP_SCRIPT = path.join(ROOT, "scripts", "crop_card.py");
const FIXTURE_SCRIPT = path.join(ROOT, "scripts", "fixtures", "make-card-fixtures.py");

// The skin test needs opencv/numpy/pillow. Without them we skip instead of
// failing the whole suite on a machine that has no python image stack.
const HAVE_PYTHON =
  spawnSync(PYTHON, ["-c", "import cv2, numpy, PIL"], { encoding: "utf8" }).status === 0;

// ── The skin detector ───────────────────────────────────────────────────────
// lib/skinDetect.js is a second, independent opinion: it does not share code
// with scripts/crop_card.py, so a broken detector cannot hide itself.
const { countSkinPixels: countSkin } = require("../lib/skinDetect");

async function readPng(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

// Counts the skin pixels of a rendered PNG. Transparent pixels are ignored.
function opaquePixels(png) {
  const { data, width, height, channels } = png;
  let opaque = 0;
  for (let i = 0; i < width * height; i++) if (data[i * channels + 3] > 128) opaque++;
  return opaque;
}

function runCrop(src, dst, extra = []) {
  return spawnSync(PYTHON, [CROP_SCRIPT, src, dst, ...extra], { encoding: "utf8" });
}

let fixtureDir = null;
function fixtures() {
  if (fixtureDir) return fixtureDir;
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "card-crop-fixtures-"));
  const res = spawnSync(PYTHON, [FIXTURE_SCRIPT, fixtureDir], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`fixture generation failed: ${res.stderr}`);
  return fixtureDir;
}

function outDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "card-crop-out-"));
}

test("a finger over the card edge is gone: the crop has no skin pixels left", async (t) => {
  if (!HAVE_PYTHON) return t.skip("python with opencv/numpy/pillow is required");
  const dir = fixtures();
  const out = outDir();
  const res = runCrop(path.join(dir, "card-with-finger.jpg"), path.join(out, "finger.png"));
  assert.equal(res.status, 0, `crop failed: ${res.stderr}`);
  const png = await readPng(path.join(out, "finger.png"));
  assert.equal(countSkin(png.data, png.width, png.height, png.channels), 0, "the crop still shows skin");
});

test("a finger on the other edge is gone too", async (t) => {
  if (!HAVE_PYTHON) return t.skip("python with opencv/numpy/pillow is required");
  const dir = fixtures();
  const out = outDir();
  const res = runCrop(path.join(dir, "card-with-finger-left.jpg"), path.join(out, "finger-left.png"));
  assert.equal(res.status, 0, `crop failed: ${res.stderr}`);
  const png = await readPng(path.join(out, "finger-left.png"));
  assert.equal(countSkin(png.data, png.width, png.height, png.channels), 0, "the crop still shows skin");
});

test("a roughly 9% left-edge thumb on a green card with yellow border is removed", async (t) => {
  if (!HAVE_PYTHON) return t.skip("python with opencv/numpy/pillow is required");
  const dir = fixtures();
  const out = outDir();
  const res = runCrop(path.join(dir, "card-green-yellow-left-thumb-9pct.jpg"), path.join(out, "green-thumb.png"));
  assert.equal(res.status, 0, `crop failed: ${res.stderr}`);
  const png = await readPng(path.join(out, "green-thumb.png"));
  assert.equal(countSkin(png.data, png.width, png.height, png.channels), 0, "thumb skin remains on the card");
});

test("a clean card keeps at least 90% of its area", async (t) => {
  if (!HAVE_PYTHON) return t.skip("python with opencv/numpy/pillow is required");
  const dir = fixtures();
  const out = outDir();
  const res = runCrop(path.join(dir, "card-clean.jpg"), path.join(out, "clean.png"));
  assert.equal(res.status, 0, `crop failed: ${res.stderr}`);
  const png = await readPng(path.join(out, "clean.png"));
  assert.equal(png.width, 750);
  assert.equal(png.height, 1050);
  const kept = opaquePixels(png) / (png.width * png.height);
  assert.ok(kept >= 0.9, `the crop kept only ${(kept * 100).toFixed(1)}% of the card`);
  assert.equal(countSkin(png.data, png.width, png.height, png.channels), 0, "the clean card should not read as skin");
});

test("a card with skin on its face is refused, never published", async (t) => {
  if (!HAVE_PYTHON) return t.skip("python with opencv/numpy/pillow is required");
  const dir = fixtures();
  const out = outDir();
  const target = path.join(out, "blob.png");
  const res = runCrop(path.join(dir, "card-with-skin-blob.jpg"), target);
  assert.equal(res.status, 4, `expected the crop to be refused, got exit ${res.status}`);
  assert.match(res.stderr, /HAND_ON_CARD/);
  assert.match(res.stderr, /Retake the photo/);
  assert.equal(fs.existsSync(target), false, "a refused crop must not be written");
});

test("the crop cache is versioned so old finger crops are never reused", () => {
  assert.equal(CROP_CACHE_VERSION, "v2");
  const dir = cropCacheDir(ROOT);
  assert.match(dir, /public[/\\]uploads[/\\]cards-cropped[/\\]v2$/);
  assert.match(cropCachePath(ROOT, "/photos/oddish.jpg"), /cards-cropped[/\\]v2[/\\]oddish\.png$/);
  assert.doesNotMatch(cropCachePath(ROOT, "/photos/oddish.jpg"), /cards-cropped[/\\]v1[/\\]/);
});
