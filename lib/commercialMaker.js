// lib/commercialMaker.js
// Hands one product to the commercial maker in the video pipeline (make_commercial.py) and
// saves the finished video in public/commercials, where the "Send a video" panel lists it.
// It only makes a local file. It never posts, uploads or queues anything.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { COMMERCIALS_DIR } = require("./commercialFiles");
const { formatCardShowcaseSlug } = require("./cardCommercial");

const DEFAULT_PIPELINE_DIR = "C:\\Users\\jjard\\claude\\video-bot-pipeline";
const MAKER_SCRIPT = "make_commercial.py";
const CARD_SHOWCASE_SCRIPT = path.join(__dirname, "..", "scripts", "render-card-showcase.mjs");
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

function runNode(args, { cwd = process.cwd(), timeoutMs = MAKE_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("The Card Showcase renderer took too long")); }, timeoutMs);
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr = (stderr + d.toString()).slice(-2000); });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

/**
 * @param {object} card  a vault card or CardShowcaseData object
 * @returns {string} a safe .mp4 filename matching lib/commercialFiles.js NAME_RULE
 */
function cardShowcaseFileName(card) {
  const fields = card && card.fields && typeof card.fields === "object" ? card.fields : {};
  const slug = formatCardShowcaseSlug({
    year: card && (card.year || fields.year),
    setName: card && (card.setName || card.set || fields.set || card.set_name),
    cardName: card && (card.cardName || card.name || fields.player || fields.name),
    cardNumber: card && (card.cardNumber || fields.cardNumber || card.card_number),
    cardId: card && (card.cardId || card.id || card.source_key),
  });
  return `${slug.slice(0, MAX_STEM_LENGTH)}${FILE_SUFFIX}`;
}

/**
 * Commercial Maker v6 — Card Showcase mode.
 * Renders one vault card into a ~12s 1080x1920 vertical showcase reel using the Remotion
 * video-studio volume lane. Render-only: never invents a price, never lists, never posts.
 *
 * @param {{ vaultPath?: string, cardId?: string, ctaLine?: string, handle?: string,
 *           brandName?: string, subBrand?: string, logoPath?: string, musicPath?: string,
 *           dir?: string, scriptPath?: string, run?: Function }} [options]
 */
async function makeCardShowcaseCommercial(options = {}) {
  const {
    vaultPath,
    cardId,
    photoPath,
    title,
    subtitle,
    detail,
    ctaLine,
    handle,
    brandName,
    subBrand,
    logoPath,
    musicPath,
    bgPreset,
    bgImage,
    bgColor,
    bgDim,
    cardBgPreset,
    cardBgImage,
    cardBgColor,
    removeBg,
    frameStyle,
    includeBack,
    autoCloseup,
    autoCloseupLayout,
    autoBundleCutins,
    item1Label,
    item2Label,
    autoImprove,
    explore,
    noLearn,
    learningStore,
    cutIns,
    dir = COMMERCIALS_DIR,
    scriptPath = CARD_SHOWCASE_SCRIPT,
    run = runNode,
  } = options;

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "bl-card-showcase-"));
  const draft = path.join(workDir, "draft.mp4");
  const args = [scriptPath, "--out", draft, "--json"];
  if (vaultPath) args.push("--vault", vaultPath);
  if (cardId) args.push("--card-id", cardId);
  if (photoPath) args.push("--photo", photoPath);
  if (title) args.push("--title", title);
  if (subtitle) args.push("--subtitle", subtitle);
  if (detail) args.push("--detail", detail);
  if (ctaLine) args.push("--cta", ctaLine);
  if (handle) args.push("--handle", handle);
  if (brandName) args.push("--brand", brandName);
  if (subBrand) args.push("--sub-brand", subBrand);
  if (logoPath) args.push("--logo", logoPath);
  if (musicPath) args.push("--music", musicPath);
  if (bgPreset) args.push("--bg-preset", bgPreset);
  if (bgImage) args.push("--bg-image", bgImage);
  if (bgColor) args.push("--bg-color", bgColor);
  if (typeof bgDim === "number" && Number.isFinite(bgDim)) args.push("--bg-dim", String(bgDim));
  if (cardBgPreset) args.push("--card-bg", cardBgPreset);
  if (cardBgImage) args.push("--card-bg-image", cardBgImage);
  if (cardBgColor) args.push("--card-bg-color", cardBgColor);
  if (removeBg) args.push("--bg-remove", removeBg);
  if (frameStyle) args.push("--frame", frameStyle);
  if (includeBack) args.push("--include-back");
  if (autoCloseup) args.push("--auto-closeup");
  if (autoCloseupLayout) args.push("--auto-closeup-layout", autoCloseupLayout);
  if (autoBundleCutins) args.push("--auto-bundle-cutins");
  if (item1Label) args.push("--item1-label", item1Label);
  if (item2Label) args.push("--item2-label", item2Label);
  if (autoImprove) args.push("--auto-improve");
  if (explore) args.push("--explore");
  if (noLearn) args.push("--no-learn");
  if (learningStore) args.push("--learning-store", learningStore);
  if (Array.isArray(cutIns) && cutIns.length > 0) {
    const cutInsFile = path.join(workDir, "cutins.json");
    fs.writeFileSync(cutInsFile, JSON.stringify(cutIns), "utf8");
    args.push("--cut-ins-json", cutInsFile);
  }

  try {
    const result = await run(args, { cwd: process.cwd() });
    const made = result && result.code === 0 && fs.existsSync(draft) && fs.statSync(draft).size >= MIN_VIDEO_BYTES;
    if (!made) {
      console.error("[commercialMaker] card-showcase failed:", result && result.code, result && result.stderr);
      return { ok: false, error: "The card showcase could not be made" };
    }

    let summary = null;
    try {
      summary = JSON.parse(String(result.stdout || "").trim());
    } catch {
      summary = null;
    }

    const card = summary && summary.card ? summary.card : { id: cardId || "card" };
    const fileName = cardShowcaseFileName(card);
    fs.mkdirSync(dir, { recursive: true });
    const finalPath = path.join(dir, fileName);
    fs.copyFileSync(draft, finalPath);
    return {
      ok: true,
      mode: "card-showcase",
      name: fileName,
      path: finalPath,
      bytes: fs.statSync(finalPath).size,
      card,
      qc: summary && summary.qc ? summary.qc : null,
      learning: summary && summary.learning ? summary.learning : null,
      posted: false,
      listed: false,
    };
  } catch (err) {
    console.error("[commercialMaker] card-showcase:", err.message);
    return { ok: false, error: "The card showcase could not be made" };
  } finally {
    removeQuietly(workDir);
  }
}

module.exports = {
  plainDescription,
  commercialFileName,
  buildMakeRequest,
  makeCommercial,
  cardShowcaseFileName,
  makeCardShowcaseCommercial,
};
