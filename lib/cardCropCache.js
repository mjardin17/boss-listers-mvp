// lib/cardCropCache.js
// Where the card-only crops live.
//
// The folder name carries a version (v2). Crops made by the old cropper kept
// the seller's fingers on the card, so a cache entry from before the fix must
// never be reused: bumping CROP_CACHE_VERSION makes the renderer crop the
// photo again instead of picking up a stale, finger-covered PNG.

const path = require("node:path");

const CROP_CACHE_VERSION = "v2";

function cropCacheDir(root) {
  return path.join(root, "public", "uploads", "cards-cropped", CROP_CACHE_VERSION);
}

// The crop of one photo. Same photo name -> same crop file.
function cropCachePath(root, photoPath) {
  const name = path.basename(photoPath).replace(/\.[^.]+$/, "");
  return path.join(cropCacheDir(root), `${name}.png`);
}

module.exports = {
  CROP_CACHE_VERSION,
  cropCacheDir,
  cropCachePath,
};
