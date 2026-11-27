// lib/skinDetect.js
// Is this pixel a piece of human skin?
//
// A plain YCrCb skin filter is not enough: card borders are often tan or gold
// and read as skin, and so do warm grey desks and walls. Four things keep the
// false positives down:
//   1. skin sits in a narrow YCrCb wedge,
//   2. skin is much redder than it is blue (Cr - Cb stays high) - a warm grey
//      desk does not,
//   3. but not too much redder: gold sits even further up that line,
//   4. skin is orange, gold is yellow: red has to stand clearly above green,
//   5. a morphological opening drops the hair thin lines of card artwork: a
//      finger is always a fat blob.
//
// This module is deliberately independent of scripts/crop_card.py (which is
// python) so the card crop tests check the crop with a second opinion.

const SKIN_CR = [133, 178];
const SKIN_CB = [77, 127];
const SKIN_CR_MINUS_CB = 25;
const SKIN_CR_MINUS_CB_MAX = 65;
const SKIN_H_MAX = 30;
const SKIN_S = [40, 195];
const SKIN_V_MIN = 50;
// (R - G) / (R - B): skin is orange (red well above green), gold is yellow.
const SKIN_ORANGE = 0.35;
const SKIN_OPEN_RADIUS = 3; // 7x7 opening

function rgbToYCrCb(r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return { y, cr: (r - y) * 0.713 + 128, cb: (b - y) * 0.564 + 128 };
}

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h: h / 2, s: max === 0 ? 0 : (delta / max) * 255, v: max };
}

function looksLikeSkin(r, g, b) {
  const { cr, cb } = rgbToYCrCb(r, g, b);
  if (cr < SKIN_CR[0] || cr > SKIN_CR[1]) return false;
  if (cb < SKIN_CB[0] || cb > SKIN_CB[1]) return false;
  if (cr - cb < SKIN_CR_MINUS_CB) return false;
  if (cr - cb > SKIN_CR_MINUS_CB_MAX) return false;
  const { h, s, v } = rgbToHsv(r, g, b);
  if (h > SKIN_H_MAX) return false;
  if (s < SKIN_S[0] || s > SKIN_S[1]) return false;
  if (v < SKIN_V_MIN) return false;
  if ((r - g) / Math.max(1, r - b) < SKIN_ORANGE) return false;
  return true;
}

function erodeAxis(src, dst, w, h, r, horizontal) {
  const n = horizontal ? w : h;
  const outer = horizontal ? h : w;
  const line = new Uint8Array(n);
  for (let o = 0; o < outer; o++) {
    for (let i = 0; i < n; i++) line[i] = horizontal ? src[o * w + i] : src[i * w + o];
    let zeros = 0;
    for (let i = -r; i <= r; i++) if (i >= 0 && i < n && !line[i]) zeros++;
    for (let i = 0; i < n; i++) {
      const keep = zeros === 0 ? 1 : 0;
      if (horizontal) dst[o * w + i] = keep;
      else dst[i * w + o] = keep;
      const leaving = i - r;
      if (leaving >= 0 && leaving < n && !line[leaving]) zeros--;
      const entering = i + r + 1;
      if (entering >= 0 && entering < n && !line[entering]) zeros++;
    }
  }
}

function dilateAxis(src, dst, w, h, r, horizontal) {
  const n = horizontal ? w : h;
  const outer = horizontal ? h : w;
  const line = new Uint8Array(n);
  for (let o = 0; o < outer; o++) {
    for (let i = 0; i < n; i++) line[i] = horizontal ? src[o * w + i] : src[i * w + o];
    let ones = 0;
    for (let i = -r; i <= r; i++) if (i >= 0 && i < n && line[i]) ones++;
    for (let i = 0; i < n; i++) {
      const keep = ones > 0 ? 1 : 0;
      if (horizontal) dst[o * w + i] = keep;
      else dst[i * w + o] = keep;
      const leaving = i - r;
      if (leaving >= 0 && leaving < n && line[leaving]) ones--;
      const entering = i + r + 1;
      if (entering >= 0 && entering < n && line[entering]) ones++;
    }
  }
}

// Binary opening: erode then dilate.
function openMask(mask, w, h, r) {
  const tmp = new Uint8Array(w * h);
  const eroded = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  erodeAxis(mask, tmp, w, h, r, true);
  erodeAxis(tmp, eroded, w, h, r, false);
  dilateAxis(eroded, tmp, w, h, r, true);
  dilateAxis(tmp, out, w, h, r, false);
  return out;
}

/**
 * Skin mask of an RGBA buffer. Transparent pixels never count as skin.
 * @returns {Uint8Array} 1 where the pixel looks like skin
 */
function skinMask(data, width, height, channels = 4) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    if (channels === 4 && data[o + 3] < 128) continue;
    if (looksLikeSkin(data[o], data[o + 1], data[o + 2])) mask[i] = 1;
  }
  return openMask(mask, width, height, SKIN_OPEN_RADIUS);
}

/**
 * How many skin pixels an image has.
 * @param {Buffer} data RGBA pixels
 */
function countSkinPixels(data, width, height, channels = 4) {
  const mask = skinMask(data, width, height, channels);
  let skin = 0;
  for (let i = 0; i < mask.length; i++) skin += mask[i];
  return skin;
}

module.exports = {
  SKIN_CR,
  SKIN_CB,
  SKIN_CR_MINUS_CB,
  SKIN_CR_MINUS_CB_MAX,
  SKIN_H_MAX,
  SKIN_S,
  SKIN_V_MIN,
  SKIN_ORANGE,
  SKIN_OPEN_RADIUS,
  looksLikeSkin,
  openMask,
  skinMask,
  countSkinPixels,
};
