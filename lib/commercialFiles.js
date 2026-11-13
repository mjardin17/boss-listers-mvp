// lib/commercialFiles.js
// Finished commercials are saved on this computer in public/commercials. Instagram and
// Facebook fetch a video from a public https address, so a commercial has to be copied to
// public storage before it can be posted. This module lists the files and turns a request
// into the address to post. In preview it only checks the file; it uploads nothing.

const fs = require("fs");
const path = require("path");

const COMMERCIALS_DIR = path.join(process.cwd(), "public", "commercials");
const NAME_RULE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}\.mp4$/;
const MAX_VIDEO_BYTES = 300 * 1024 * 1024; // above Instagram's Reel limit there is no point uploading

/**
 * @param {string} [dir]
 * @returns {{ name: string, bytes: number, modified: string }[]} newest first
 */
function listCommercials(dir = COMMERCIALS_DIR) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names
    .filter((name) => NAME_RULE.test(name))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return { name, bytes: stat.size, modified: stat.mtime.toISOString() };
    })
    .sort((a, b) => (a.modified < b.modified ? 1 : -1));
}

/**
 * Turns { videoUrl } or { commercial } into the public address to post.
 * @param {{ videoUrl?: string, commercial?: string }} input  exactly one of the two
 * @param {{ live?: boolean, dir?: string, env?: object, maxBytes?: number,
 *           upload?: (buffer: Buffer, name: string, contentType: string) => Promise<string> }} [options]
 * @returns {Promise<{ ok: boolean, videoUrl?: string, uploaded?: boolean, wouldUpload?: boolean, bytes?: number, error?: string }>}
 */
async function resolveVideoAddress(input, options = {}) {
  const { live = false, dir = COMMERCIALS_DIR, env = process.env, maxBytes = MAX_VIDEO_BYTES, upload } = options;
  const { videoUrl, commercial } = input || {};
  if (Boolean(videoUrl) === Boolean(commercial)) return { ok: false, error: "Give either a video address or one commercial file" };
  if (videoUrl) return { ok: true, videoUrl: String(videoUrl), uploaded: false };

  const name = String(commercial);
  if (!NAME_RULE.test(name) || path.basename(name) !== name) return { ok: false, error: "That is not a commercial file name" };
  const file = path.join(dir, name);
  let stat;
  try { stat = fs.statSync(file); } catch { return { ok: false, error: `Commercial not found: ${name}` }; }
  if (!stat.isFile() || stat.size === 0) return { ok: false, error: `Commercial is empty: ${name}` };
  if (stat.size > maxBytes) return { ok: false, error: `Commercial is too large to post (${Math.round(stat.size / 1048576)} MB)` };

  if (!live) {
    const bucket = env.SUPABASE_BUCKET || "product-photos";
    return { ok: true, videoUrl: `${env.SUPABASE_URL}/storage/v1/object/public/${bucket}/uploads/${name}`, uploaded: false, wouldUpload: true, bytes: stat.size };
  }
  try {
    const publicUrl = await upload(fs.readFileSync(file), name, "video/mp4");
    return { ok: true, videoUrl: publicUrl, uploaded: true, bytes: stat.size };
  } catch (err) {
    return { ok: false, error: `Could not copy the commercial to public storage: ${err.message}` };
  }
}

module.exports = { listCommercials, resolveVideoAddress, COMMERCIALS_DIR, MAX_VIDEO_BYTES };
