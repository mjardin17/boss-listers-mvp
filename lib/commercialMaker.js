// lib/commercialMaker.js
// Hands one product to the commercial maker in the video pipeline (make_commercial.py) and
// saves the finished video in public/commercials, where the "Send a video" panel lists it.
// It only makes a local file. It never posts, uploads or queues anything.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { COMMERCIALS_DIR } = require("./commercialFiles");

const DEFAULT_PIPELINE_DIR = "C:\\Users\\jjard\\claude\\video-bot-pipeline";
const MAKER_SCRIPT = "make_commercial.py";
const FILE_SUFFIX = "_reel_9_16.mp4";
const MAX_STEM_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 220;
const MAKE_TIMEOUT_MS = 8 * 60 * 1000;
const MIN_VIDEO_BYTES = 1024;

/**
 * Listing text can hold HTML and hidden notes. The voice should read plain words only.
 * @param {string|null|undefined} text
 * @returns {string} whole sentences, at most MAX_DESCRIPTION_LENGTH characters
 */
function plainDescription(text) {
  const plain = String(text || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= MAX_DESCRIPTION_LENGTH) return plain;
  const sentences = plain.match(/[^.!?]+[.!?]+/g) || [];
  let kept = "";
  for (const sentence of sentences) {
    if ((kept + sentence).trim().length > MAX_DESCRIPTION_LENGTH) break;
    kept += sentence;
  }
  return kept.trim();
}

/**
 * @param {{ slug?: string, sku?: string }} product
 * @returns {string} a file name that matches the commercials folder's name rule
 */
function commercialFileName(product) {
  const raw = String((product && (product.slug || product.sku)) || "item");
  const stem = raw.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^[-_]+|[-_]+$/g, "").slice(0, MAX_STEM_LENGTH) || "item";
  return `${stem}${FILE_SUFFIX}`;
}

/**
 * @param {object|null} product  a products row: { sku, slug, title, description, price, image_url }
 * @returns {{ ok: boolean, payload?: { name: string, description: string, price: number, images: string[] }, fileName?: string, error?: string }}
 */
function buildMakeRequest(product) {
  if (!product) return { ok: false, error: "Item not found" };
  const name = String(product.title || "").trim();
  if (!name) return { ok: false, error: "This item has no title" };
  const price = Number(product.price);
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: "This item has no price, so no commercial was made" };
  const image = String(product.image_url || "").trim();
  if (!/^https:\/\//i.test(image)) return { ok: false, error: "This item has no public picture, so no commercial was made" };
  return {
    ok: true,
    payload: { name, description: plainDescription(product.description), price, images: [image] },
    fileName: commercialFileName(product),
  };
}

/** Runs python with an argument list (no shell). Resolves { code, stderr }. */
function runPython(args, { cwd, timeoutMs = MAKE_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("python", args, { cwd, windowsHide: true });
    let stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("The commercial maker took too long")); }, timeoutMs);
    child.stdout.resume();
    child.stderr.on("data", (d) => { stderr = (stderr + d.toString()).slice(-2000); });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, stderr }); });
  });
}

function removeQuietly(file) {
  try { fs.rmSync(file, { force: true, recursive: true }); } catch { /* nothing to remove */ }
}

/**
 * Makes one commercial as a local file.
 * @param {object} product
 * @param {{ dir?: string, pipelineDir?: string, run?: (args: string[], opts: object) => Promise<{ code: number, stderr: string }> }} [options]
 * @returns {Promise<{ ok: boolean, name?: string, bytes?: number, error?: string }>}
 */
async function makeCommercial(product, options = {}) {
  const { dir = COMMERCIALS_DIR, pipelineDir = process.env.VIDEO_PIPELINE_DIR || DEFAULT_PIPELINE_DIR, run = runPython } = options;
  const request = buildMakeRequest(product);
  if (!request.ok) return { ok: false, error: request.error };

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "bl-commercial-"));
  const productFile = path.join(workDir, "product.json");
  const draft = path.join(workDir, "draft.mp4"); // rendered here first, so a failed remake keeps the old file
  try {
    fs.writeFileSync(productFile, JSON.stringify(request.payload), "utf8");
    const result = await run([path.join(pipelineDir, MAKER_SCRIPT), "--json", productFile, "--out", draft], { cwd: pipelineDir });
    const made = result && result.code === 0 && fs.existsSync(draft) && fs.statSync(draft).size >= MIN_VIDEO_BYTES;
    if (!made) {
      console.error("[commercialMaker] maker failed:", result && result.code, result && result.stderr);
      return { ok: false, error: "The commercial could not be made" };
    }
    fs.mkdirSync(dir, { recursive: true });
    const finalPath = path.join(dir, request.fileName);
    fs.copyFileSync(draft, finalPath);
    return { ok: true, name: request.fileName, bytes: fs.statSync(finalPath).size };
  } catch (err) {
    console.error("[commercialMaker]", err.message);
    return { ok: false, error: "The commercial could not be made" };
  } finally {
    removeQuietly(workDir);
  }
}

module.exports = { plainDescription, commercialFileName, buildMakeRequest, makeCommercial };
