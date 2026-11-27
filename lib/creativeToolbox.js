// lib/creativeToolbox.js
// Talks to the creative toolbox in ClipCraft (POST /v1/creative/*, on this PC, default http://127.0.0.1:3002).
// The toolbox runs ImageMagick, FFmpeg, Inkscape, LibreOffice and Shotcut. Every call here is optional:
// when the toolbox is off or fails, the caller gets null and carries on.

const path = require("path");

const TOOLBOX_URL = (process.env.CREATIVE_TOOLBOX_URL || process.env.SCRAPER_URL || "http://127.0.0.1:3002").replace(/\/+$/, "");
const TIMEOUT_MS = 120000;
const BRAND_ACCENT = "#F5B342"; // BossListers gold

async function call(endpoint, body) {
  try {
    const r = await fetch(`${TOOLBOX_URL}/v1/creative/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const j = await r.json().catch(() => null);
    return r.ok && j && j.success ? j : null;
  } catch {
    return null;
  }
}

/** File name of the thumbnail that goes with a commercial video. */
function thumbnailNameFor(videoName) {
  return String(videoName || "").replace(/\.[^.]+$/, "") + "_thumb.png";
}

/**
 * Makes a 1280x720 thumbnail for a finished commercial (a frame of the video + the item's title).
 * @param {string} videoPath  full path of the video
 * @param {string} title      the item's title
 * @returns {Promise<string|null>} the thumbnail file name, or null when the toolbox is off or fails
 */
async function thumbnailForVideo(videoPath, title) {
  const out = path.join(path.dirname(videoPath), thumbnailNameFor(path.basename(videoPath)));
  const made = await call("thumbnail", { title: String(title || "").slice(0, 60), background: videoPath, out, accent: BRAND_ACCENT });
  return made ? path.basename(out) : null;
}

/** Cleans a voice track (noise, rumble, loudness). Returns the output path or null. */
async function cleanVoice(input, out) {
  const made = await call("clean-voice", { input, out });
  return made ? out : null;
}

module.exports = { thumbnailForVideo, thumbnailNameFor, cleanVoice, BRAND_ACCENT };
