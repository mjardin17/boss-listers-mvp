#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Commercial Maker Orchestrator
 *
 * Unified commercial-production entry point that consolidates the 5 overlapping
 * commercial paths (Card Showcase/Remotion, Commercial Cutter, Quick Commercial,
 * legacy webhook generator, external video-bot-pipeline wrapper) into one
 * orchestrator. Each path becomes a mode/adapter behind a single API.
 *
 * Render-only safety: never invents prices/specs/claims, never auto-lists or
 * auto-posts, publishing requires authorized connections + user approval.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { defaultRegistry } = require("./registry.js");
const { isAvailable, isVerified } = require("./manifest.js");
const commercialMaker = require("../commercialMaker.js");
const { COMMERCIALS_DIR } = require("../commercialFiles.js");

const MODE_TIMEOUT_MS = 10 * 60 * 1000;
const MIN_VIDEO_BYTES = 1024;

/**
 * Validate that a connector is safe to use in production jobs.
 * Throws if not available + verified.
 */
function requireProductionReady(connectorId) {
  const config = defaultRegistry.getConfig(connectorId);
  if (!config) {
    throw new Error(`connector not registered: ${connectorId}`);
  }
  if (!isAvailable(config) || !isVerified(config)) {
    throw new Error(
      `connector ${connectorId} is not production-ready (status ${config.status}, verified ${isVerified(config)})`
    );
  }
  return config;
}

/**
 * Spawn a Node child process with timeout and output capture.
 */
function spawnNode(args, options = {}) {
  return new Promise((resolve, reject) => {
    const { cwd = process.cwd(), timeoutMs = MODE_TIMEOUT_MS } = options;
    const child = spawn(process.execPath, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`command timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Spawn a Python child process with timeout and output capture.
 */
function spawnPython(args, options = {}) {
  return new Promise((resolve, reject) => {
    const { cwd = process.cwd(), timeoutMs = MODE_TIMEOUT_MS } = options;
    const pythonBin = process.env.PYTHON_BIN || "python3";
    const child = spawn(pythonBin, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`python command timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Mode: Card Showcase (Remotion) — the primary tested path.
 * Renders one vault card or direct item into a ~12s 1080x1920 vertical showcase reel.
 */
async function runCardShowcaseMode(options) {
  const {
    product,
    vaultPath,
    cardId,
    dir = COMMERCIALS_DIR,
    noLearn = false,
    explore = false,
    autoImprove = false,
    learningStore,
  } = options;

  return commercialMaker.makeCardShowcaseCommercial({
    vaultPath,
    cardId,
    photoPath: product && product.image_url ? null : options.photoPath,
    title: product && product.title ? product.title : options.title,
    subtitle: product && product.subtitle ? product.subtitle : options.subtitle,
    detail: product && product.detail ? product.detail : options.detail,
    ctaLine: product && product.cta ? product.cta : options.ctaLine,
    handle: options.handle || (product && product.handle),
    brandName: options.brandName || "Jardin's Outpost",
    subBrand: options.subBrand || "BossListers",
    logoPath: options.logoPath,
    musicPath: options.musicPath,
    bgPreset: options.bgPreset,
    bgImage: options.bgImage,
    bgColor: options.bgColor,
    bgDim: options.bgDim,
    cardBgPreset: options.cardBgPreset,
    cardBgImage: options.cardBgImage,
    cardBgColor: options.cardBgColor,
    removeBg: options.removeBg,
    frameStyle: options.frameStyle,
    includeBack: options.includeBack,
    autoCloseup: options.autoCloseup,
    autoCloseupLayout: options.autoCloseupLayout,
    autoBundleCutins: options.autoBundleCutins,
    item1Label: options.item1Label,
    item2Label: options.item2Label,
    autoImprove,
    explore,
    noLearn,
    learningStore,
    cutIns: options.cutIns,
    dir,
  });
}

/**
 * Mode: Commercial Cutter (Python) — 15s 4-beat cutter with Kokoro TTS + MusicGen.
 * Requires ffmpeg/ffprobe connectors to be production-ready.
 */
async function runCommercialCutterMode(options) {
  const {
    product,
    scriptPath = path.join(__dirname, "..", "..", "scripts", "commercial_cutter.py"),
    dir = COMMERCIALS_DIR,
  } = options;

  // Verify ffmpeg/ffprobe are available before attempting.
  requireProductionReady("ffmpeg-local");
  requireProductionReady("ffmpeg-local"); // ffprobe shares ffmpeg connector

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "bl-cutter-"));
  const productFile = path.join(workDir, "product.json");
  const outFile = path.join(workDir, "output.mp4");

  try {
    const payload = {
      title: product.title || "",
      price: product.price || 0,
      image_url: product.image_url || "",
      description: product.description || "",
      cta: product.cta || "Shop now",
      platform: product.platform || "tiktok",
    };
    fs.writeFileSync(productFile, JSON.stringify(payload), "utf8");

    const result = await spawnPython(
      [scriptPath, "--json", productFile, "--out", outFile, "--platform", payload.platform],
      { cwd: path.dirname(scriptPath) }
    );

    const made =
      result.code === 0 && fs.existsSync(outFile) && fs.statSync(outFile).size >= MIN_VIDEO_BYTES;
    if (!made) {
      console.error("[commercial-maker] cutter failed:", result.code, result.stderr);
      return { ok: false, error: "The commercial cutter could not complete" };
    }

    fs.mkdirSync(dir, { recursive: true });
    const finalPath = path.join(dir, `${commercialMaker.commercialFileName(product)}`);
    fs.copyFileSync(outFile, finalPath);

    return {
      ok: true,
      mode: "commercial-cutter",
      name: path.basename(finalPath),
      path: finalPath,
      bytes: fs.statSync(finalPath).size,
      posted: false,
      listed: false,
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Mode: Quick Commercial (Python) — 15s single-photo commercial, no bg removal.
 */
async function runQuickCommercialMode(options) {
  const {
    product,
    scriptPath = path.join(__dirname, "..", "..", "scripts", "quick_commercial.py"),
    dir = COMMERCIALS_DIR,
  } = options;

  requireProductionReady("ffmpeg-local");

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "bl-quick-"));
  const outFile = path.join(workDir, "output.mp4");

  try {
    const result = await spawnPython(
      [
        scriptPath,
        "--title",
        product.title || "",
        "--price",
        String(product.price || 0),
        "--image-url",
        product.image_url || "",
        "--condition",
        product.condition || "New",
        "--out-dir",
        workDir,
        "--platform",
        product.platform || "tiktok",
      ],
      { cwd: path.dirname(scriptPath) }
    );

    // Find the output MP4 in workDir
    const files = fs.readdirSync(workDir).filter((f) => f.endsWith(".mp4"));
    const madeFile = files[0];
    const made =
      result.code === 0 && madeFile && fs.statSync(path.join(workDir, madeFile)).size >= MIN_VIDEO_BYTES;
    if (!made) {
      console.error("[commercial-maker] quick commercial failed:", result.code, result.stderr);
      return { ok: false, error: "The quick commercial could not complete" };
    }

    fs.mkdirSync(dir, { recursive: true });
    const finalPath = path.join(dir, `${commercialMaker.commercialFileName(product)}`);
    fs.copyFileSync(path.join(workDir, madeFile), finalPath);

    return {
      ok: true,
      mode: "quick-commercial",
      name: path.basename(finalPath),
      path: finalPath,
      bytes: fs.statSync(finalPath).size,
      posted: false,
      listed: false,
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Mode: Legacy webhook generator — delegates to external video-bot-pipeline.
 * Requires VIDEO_BOT_PIPELINE_DIR env var; marks unverified if not tested.
 */
async function runWebhookMode(options) {
  const { product, pipelineDir = process.env.VIDEO_BOT_PIPELINE_DIR, dir = COMMERCIALS_DIR } = options;

  if (!pipelineDir) {
    return {
      ok: false,
      error:
        "VIDEO_BOT_PIPELINE_DIR not set — legacy webhook path unavailable without video-bot-pipeline",
    };
  }

  const makerScript = path.join(pipelineDir, "make_commercial.py");
  if (!fs.existsSync(makerScript)) {
    return {
      ok: false,
      error: `video-bot-pipeline make_commercial.py not found at ${makerScript}`,
    };
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "bl-webhook-"));
  const productFile = path.join(workDir, "product.json");
  const draft = path.join(workDir, "draft.mp4");

  try {
    const payload = {
      name: product.title || "",
      price: product.price || 0,
      description: product.description || "",
      images: product.image_url ? [product.image_url] : [],
    };
    fs.writeFileSync(productFile, JSON.stringify(payload), "utf8");

    const result = await spawnPython(
      [makerScript, "--json", productFile, "--out", draft],
      { cwd: pipelineDir }
    );

    const made =
      result.code === 0 && fs.existsSync(draft) && fs.statSync(draft).size >= MIN_VIDEO_BYTES;
    if (!made) {
      console.error("[commercial-maker] webhook failed:", result.code, result.stderr);
      return { ok: false, error: "The video-bot-pipeline could not complete" };
    }

    fs.mkdirSync(dir, { recursive: true });
    const finalPath = path.join(dir, `${commercialMaker.commercialFileName(product)}`);
    fs.copyFileSync(draft, finalPath);

    return {
      ok: true,
      mode: "webhook",
      name: path.basename(finalPath),
      path: finalPath,
      bytes: fs.statSync(finalPath).size,
      posted: false,
      listed: false,
      unverified: true,
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Unified commercial maker entry point.
 *
 * Modes (tried in order unless `mode` is forced):
 *   1. card-showcase — Remotion, tested, production-ready (primary)
 *   2. commercial-cutter — Python + ffmpeg + Kokoro/MusicGen (requires ffmpeg connector)
 *   3. quick-commercial — Python single-photo (requires ffmpeg connector)
 *   4. webhook — external video-bot-pipeline (unverified, requires VIDEO_BOT_PIPELINE_DIR)
 *
 * Options:
 *   mode          force a specific mode ("card-showcase"|"commercial-cutter"|"quick-commercial"|"webhook")
 *   product       inventory/product row { sku, slug, title, price, image_url, description, cta, handle, platform, condition }
 *   dir           output directory (default COMMERCIALS_DIR)
 *   noLearn       skip learning feedback
 *   explore       enable exploration in learning
 *   autoImprove   enable auto-improve
 *   learningStore path to custom learning store JSON
 *   Plus all card-showcase options (bgPreset, frameStyle, removeBg, etc.)
 *
 * Returns { ok, mode, name, path, bytes, card?, qc?, learning?, posted, listed, unverified? }
 */
async function makeCommercialUnified(options = {}) {
  const { mode, product, dir = COMMERCIALS_DIR } = options;

  if (!product) {
    return { ok: false, error: "No product provided" };
  }
  if (!product.title) {
    return { ok: false, error: "Product has no title" };
  }

  const modes = mode ? [mode] : ["card-showcase", "commercial-cutter", "quick-commercial", "webhook"];
  const lastError = [];

  for (const m of modes) {
    try {
      switch (m) {
        case "card-showcase":
          return await runCardShowcaseMode({ ...options, product, dir });
        case "commercial-cutter":
          return await runCommercialCutterMode({ ...options, product, dir });
        case "quick-commercial":
          return await runQuickCommercialMode({ ...options, product, dir });
        case "webhook":
          return await runWebhookMode({ ...options, product, dir });
        default:
          lastError.push(`${m}: unknown mode`);
      }
    } catch (err) {
      lastError.push(`${m}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
  }

  return {
    ok: false,
    error: `No commercial mode could complete: ${lastError.join("; ")}`,
  };
}

/**
 * Get available modes and their production-readiness.
 */
function getAvailableModes() {
  const modes = [
    {
      id: "card-showcase",
      name: "Card Showcase (Remotion)",
      description: "12s vertical showcase reel, tested and production-ready",
      productionReady: isAvailable(defaultRegistry.getConfig("remotion-node")) &&
        isVerified(defaultRegistry.getConfig("remotion-node")),
      connector: "remotion-node",
    },
    {
      id: "commercial-cutter",
      name: "Commercial Cutter (Python)",
      description: "15s 4-beat cutter with Kokoro TTS + MusicGen",
      productionReady: isAvailable(defaultRegistry.getConfig("ffmpeg-local")) &&
        isVerified(defaultRegistry.getConfig("ffmpeg-local")),
      connector: "ffmpeg-local",
    },
    {
      id: "quick-commercial",
      name: "Quick Commercial (Python)",
      description: "15s single-photo commercial, no bg removal",
      productionReady: isAvailable(defaultRegistry.getConfig("ffmpeg-local")) &&
        isVerified(defaultRegistry.getConfig("ffmpeg-local")),
      connector: "ffmpeg-local",
    },
    {
      id: "webhook",
      name: "Legacy Webhook (video-bot-pipeline)",
      description: "External pipeline wrapper, unverified",
      productionReady: false,
      connector: null,
      unverified: true,
    },
  ];
  return modes;
}

module.exports = {
  makeCommercialUnified,
  getAvailableModes,
  runCardShowcaseMode,
  runCommercialCutterMode,
  runQuickCommercialMode,
  runWebhookMode,
  requireProductionReady,
  MODE_TIMEOUT_MS,
  MIN_VIDEO_BYTES,
};
