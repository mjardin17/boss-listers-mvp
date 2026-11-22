#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Commercial Rendering Engine
 *
 * Full commercial rendering:
 *   - Multiple aspect ratios (9:16, 1:1, 16:9)
 *   - Different resolutions
 *   - Social media exports (TikTok, Instagram, Facebook)
 *   - Watermark controls
 *   - Render queues with state machine
 *   - Preview generation
 *   - Export history
 *   - Render recovery
 *
 * Uses Card Showcase/Remotion as the primary rendering path.
 * Never invents prices, specs, or claims.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const VALID_ASPECT_RATIOS = ["9:16", "1:1", "16:9"];
const RESOLUTIONS = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};
const PLATFORM_SPECS = {
  tiktok: { aspectRatio: "9:16", resolution: { width: 1080, height: 1920 } },
  instagram: { aspectRatio: "9:16", resolution: { width: 1080, height: 1920 } },
  facebook: { aspectRatio: "1:1", resolution: { width: 1080, height: 1080 } },
  youtube: { aspectRatio: "16:9", resolution: { width: 1920, height: 1080 } },
  "youtube-shorts": { aspectRatio: "9:16", resolution: { width: 1080, height: 1920 } },
};
const RENDER_STATES = [
  "QUEUED",
  "RENDERING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
];

/**
 * In-memory render queue (per-process). In production this would be persisted.
 */
const renderQueue = new Map();
let renderCounter = 0;

/**
 * Spawn Node child process for Remotion render.
 */
function spawnRemotion(args, options = {}) {
  return new Promise((resolve, reject) => {
    const { cwd = process.cwd(), timeoutMs = 600000 } = options;
    const child = spawn(process.execPath, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`remotion render timed out after ${timeoutMs / 1000}s`));
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
 * Validate aspect ratio.
 */
function validateAspectRatio(ratio) {
  if (!VALID_ASPECT_RATIOS.includes(ratio)) {
    throw new Error(
      `Invalid aspect ratio '${ratio}'. Valid: ${VALID_ASPECT_RATIOS.join(", ")}`
    );
  }
}

/**
 * Get resolution for aspect ratio.
 */
function getResolution(aspectRatio, custom) {
  if (custom && custom.width && custom.height) {
    return custom;
  }
  return RESOLUTIONS[aspectRatio] || RESOLUTIONS["9:16"];
}

/**
 * Create a render job entry.
 */
function createRenderJob(options = {}) {
  const {
    id = `render-${Date.now()}-${++renderCounter}`,
    commercialId,
    productId,
    sceneComposition,
    aspectRatio = "9:16",
    resolution,
    platform,
    watermark = null,
    preview = false,
    priority = 0,
  } = options;

  validateAspectRatio(aspectRatio);
  const res = getResolution(aspectRatio, resolution);

  const job = {
    id,
    commercialId,
    productId,
    status: "QUEUED",
    aspectRatio,
    resolution: res,
    platform,
    watermark,
    preview,
    priority,
    progress: 0,
    outputPath: null,
    previewPath: null,
    error: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    retryCount: 0,
    maxRetries: 3,
  };

  renderQueue.set(id, job);
  return job;
}

/**
 * Get a render job by id.
 */
function getRenderJob(id) {
  return renderQueue.get(id);
}

/**
 * List all render jobs.
 */
function listRenderJobs() {
  return Array.from(renderQueue.values()).sort(
    (a, b) => b.priority - a.priority || new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/**
 * Cancel a render job.
 */
function cancelRenderJob(id) {
  const job = renderQueue.get(id);
  if (!job) return false;
  if (job.status === "QUEUED") {
    job.status = "CANCELLED";
    job.completedAt = new Date().toISOString();
    return true;
  }
  return false;
}

/**
 * Render a commercial using the Card Showcase / Remotion path.
 * This is the primary rendering engine for commercials.
 */
async function renderCommercial(jobId, options = {}) {
  const job = renderQueue.get(jobId);
  if (!job) {
    throw new Error(`Render job not found: ${jobId}`);
  }

  job.status = "RENDERING";
  job.startedAt = new Date().toISOString();
  job.progress = 5;

  const {
    sceneComposition,
    product,
    outputPath = path.join(os.tmpdir(), `render-${jobId}.mp4`),
    scriptPath = path.join(
      __dirname,
      "..",
      "..",
      "scripts",
      "render-card-showcase.mjs"
    ),
  } = options;

  try {
    const args = [scriptPath, "--out", outputPath, "--json"];

    if (sceneComposition) {
      const compFile = path.join(os.tmpdir(), `comp-${jobId}.json`);
      fs.writeFileSync(
        compFile,
        JSON.stringify(
          typeof sceneComposition === "string"
            ? JSON.parse(sceneComposition)
            : sceneComposition.toJSON ? sceneComposition.toJSON() : sceneComposition
        ),
        "utf8"
      );
      args.push("--composition", compFile);
    }

    if (product) {
      if (product.title) args.push("--title", product.title);
      if (product.subtitle) args.push("--subtitle", product.subtitle);
      if (product.detail) args.push("--detail", product.detail);
      if (product.cta) args.push("--cta", product.cta);
      if (product.handle) args.push("--handle", product.handle);
      if (product.image_url) args.push("--photo", product.image_url);
    }

    if (job.watermark) {
      args.push("--watermark", job.watermark);
    }

    // Set aspect ratio via resolution
    const res = job.resolution;
    args.push("--width", String(res.width));
    args.push("--height", String(res.height));

    job.progress = 25;

    const result = await spawnRemotion(args, {
      cwd: process.cwd(),
      timeoutMs: 600000,
    });

    job.progress = 90;

    const made =
      result.code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;

    if (!made) {
      job.status = "FAILED";
      job.error = `Remotion render failed: code ${result.code}, stderr: ${result.stderr}`;
      job.completedAt = new Date().toISOString();
      return {
        ok: false,
        jobId,
        status: "FAILED",
        error: job.error,
      };
    }

    // Generate preview if requested
    let previewPath = null;
    if (job.preview) {
      previewPath = path.join(os.tmpdir(), `preview-${jobId}.jpg`);
      const ffmpegConfig =
        require("./registry.js").defaultRegistry.getConfig("ffmpeg-local");
      const { isAvailable, isVerified } = require("./manifest.js");
      if (ffmpegConfig && isAvailable(ffmpegConfig) && isVerified(ffmpegConfig)) {
        const { spawn } = require("child_process");
        const ffmpegBin = process.env.FFMPEG_PATH || "ffmpeg";
        await new Promise((resolve) => {
          const child = spawn(
            ffmpegBin,
            [
              "-i",
              outputPath,
              "-ss",
              "00:00:01",
              "-vframes",
              "1",
              "-y",
              previewPath,
            ],
            { windowsHide: true }
          );
          child.on("close", resolve);
        });
        if (fs.existsSync(previewPath)) {
          previewPath = previewPath;
        } else {
          previewPath = null;
        }
      }
    }

    job.status = "SUCCEEDED";
    job.outputPath = outputPath;
    job.previewPath = previewPath;
    job.progress = 100;
    job.completedAt = new Date().toISOString();

    return {
      ok: true,
      jobId,
      status: "SUCCEEDED",
      outputPath,
      previewPath,
      bytes: fs.statSync(outputPath).size,
      duration: job.totalDuration || null,
    };
  } catch (err) {
    job.status = "FAILED";
    job.error = err instanceof Error ? err.message : String(err);
    job.completedAt = new Date().toISOString();
    job.retryCount += 1;

    // Auto-retry if under max retries
    if (job.retryCount <= job.maxRetries && job.status === "FAILED") {
      job.status = "QUEUED";
      job.progress = 0;
      return {
        ok: false,
        jobId,
        status: "RETRYING",
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
        error: job.error,
      };
    }

    return {
      ok: false,
      jobId,
      status: "FAILED",
      error: job.error,
    };
  }
}

/**
 * Generate a preview frame from a rendered commercial.
 */
async function generatePreview(commercialPath, options = {}) {
  const {
    outputPath = path.join(os.tmpdir(), `preview-${Date.now()}.jpg`),
    timestamp = "00:00:01",
  } = options;

  const ffmpegConfig =
    require("./registry.js").defaultRegistry.getConfig("ffmpeg-local");
  const { isAvailable, isVerified } = require("./manifest.js");

  if (!ffmpegConfig || !isAvailable(ffmpegConfig) || !isVerified(ffmpegConfig)) {
    return {
      ok: false,
      error: "ffmpeg connector not production-ready — preview generation unavailable",
    };
  }

  const { spawn } = require("child_process");
  const ffmpegBin = process.env.FFMPEG_PATH || "ffmpeg";

  return new Promise((resolve) => {
    const child = spawn(
      ffmpegBin,
      ["-i", commercialPath, "-ss", timestamp, "-vframes", "1", "-y", outputPath],
      { windowsHide: true }
    );
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve({
          ok: true,
          outputPath,
          bytes: fs.statSync(outputPath).size,
        });
      } else {
        resolve({
          ok: false,
          error: `Preview generation failed: code ${code}`,
        });
      }
    });
  });
}

/**
 * Get export history (all completed/failed jobs).
 */
function getExportHistory() {
  return listRenderJobs().filter(
    (j) => j.status === "SUCCEEDED" || j.status === "FAILED"
  );
}

/**
 * Get available rendering features.
 */
function getAvailableFeatures() {
  const ffmpegConfig =
    require("./registry.js").defaultRegistry.getConfig("ffmpeg-local");
  const { isAvailable, isVerified } = require("./manifest.js");

  return {
    aspectRatios: VALID_ASPECT_RATIOS,
    resolutions: RESOLUTIONS,
    platformSpecs: PLATFORM_SPECS,
    renderStates: RENDER_STATES,
    ffmpegAvailable: isAvailable(ffmpegConfig) && isVerified(ffmpegConfig),
    previewGeneration: isAvailable(ffmpegConfig) && isVerified(ffmpegConfig),
    renderRecovery: true, // auto-retry built in
    queueSize: renderQueue.size,
  };
}

/**
 * Clear all render jobs (for testing/reset).
 */
function clearQueue() {
  renderQueue.clear();
  renderCounter = 0;
}

module.exports = {
  createRenderJob,
  getRenderJob,
  listRenderJobs,
  cancelRenderJob,
  renderCommercial,
  generatePreview,
  getExportHistory,
  getAvailableFeatures,
  clearQueue,
  VALID_ASPECT_RATIOS,
  RESOLUTIONS,
  PLATFORM_SPECS,
  RENDER_STATES,
};
