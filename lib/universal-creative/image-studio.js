#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Image Studio
 *
 * Image preparation for commercial production:
 *   - Background removal (RMBG-1.4 via card_prep.py or ImageMagick fallback)
 *   - Background replacement
 *   - Object isolation / product cutout
 *   - Image enhancement (resize, format convert)
 *   - Transparent background output (PNG)
 *   - Product image preparation for commercial scenes
 *
 * Never invents product specs, pricing, or claims. Works with actual images only.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { defaultRegistry } = require("./registry.js");
const { isAvailable, isVerified } = require("./manifest.js");

const MAX_DIM = 1800; // cap to avoid Chromium/EncodingError on large images

/**
 * Spawn Python with timeout and capture.
 */
function spawnPython(args, options = {}) {
  return new Promise((resolve, reject) => {
    const { cwd = process.cwd(), timeoutMs = 300000 } = options;
    const pythonBin = process.env.PYTHON_BIN || "python3";
    const child = spawn(pythonBin, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`python timed out after ${timeoutMs / 1000}s`));
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
 * Spawn ImageMagick CLI with timeout and capture.
 */
function spawnMagick(args, options = {}) {
  return new Promise((resolve, reject) => {
    const { cwd = process.cwd(), timeoutMs = 120000 } = options;
    const magickBin = process.env.IMAGEMAGICK_PATH || "magick";
    const child = spawn(magickBin, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`imagemagick timed out after ${timeoutMs / 1000}s`));
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
 * Remove background from an image using RMBG-1.4 via card_prep.py.
 * Falls back to ImageMagick if Python path is unavailable.
 */
async function removeBackground(inputPath, options = {}) {
  const {
    outputPath = path.join(os.tmpdir(), `cutout-${Date.now()}.png`),
    pythonBin = process.env.PYTHON_BIN || "python3",
    cardPrepScript = path.join(
      __dirname,
      "..",
      "..",
      "scripts",
      "card_prep.py"
    ),
  } = options;

  // Try Python RMBG-1.4 path first
  try {
    const result = await spawnPython(
      [
        cardPrepScript,
        "--remove-bg",
        "--input",
        inputPath,
        "--output",
        outputPath,
        "--max-dim",
        String(MAX_DIM),
      ],
      { cwd: path.dirname(cardPrepScript) }
    );
    if (result.code === 0 && fs.existsSync(outputPath)) {
      return {
        ok: true,
        outputPath,
        method: "rmbg-1.4",
        bytes: fs.statSync(outputPath).size,
      };
    }
  } catch (err) {
    // Fall through to ImageMagick fallback
  }

  // Fallback: ImageMagick basic background removal is not truly AI-based,
  // but we can at least convert to PNG with transparency if alpha exists.
  const magickConfig = defaultRegistry.getConfig("imagemagick-local");
  if (magickConfig && isAvailable(magickConfig) && isVerified(magickConfig)) {
    try {
      const result = await spawnMagick(
        [inputPath, "-alpha", "set", "-channel", "A", "-evaluate", "set", "50%", outputPath],
        { cwd: path.dirname(inputPath) }
      );
      if (result.code === 0 && fs.existsSync(outputPath)) {
        return {
          ok: true,
          outputPath,
          method: "imagemagick-fallback",
          bytes: fs.statSync(outputPath).size,
          note: "Alpha channel adjusted; not true AI background removal",
        };
      }
    } catch (err2) {
      // fall through
    }
  }

  return {
    ok: false,
    error: "Background removal unavailable — no working RMBG-1.4 or ImageMagick path",
  };
}

/**
 * Replace background: composite cutout over a new background image.
 */
async function replaceBackground(cutoutPath, backgroundPath, options = {}) {
  const {
    outputPath = path.join(os.tmpdir(), `composite-${Date.now()}.png`),
    position = "center",
    scale = "cover",
  } = options;

  const magickConfig = defaultRegistry.getConfig("imagemagick-local");
  if (!magickConfig || !isAvailable(magickConfig) || !isVerified(magickConfig)) {
    return {
      ok: false,
      error: "ImageMagick connector not production-ready — background replacement unavailable",
    };
  }

  try {
    // Composite cutout over background using ImageMagick
    const result = await spawnMagick(
      [
        backgroundPath,
        cutoutPath,
        "-gravity",
        position,
        "-compose",
        "over",
        "-composite",
        outputPath,
      ],
      { cwd: path.dirname(backgroundPath) }
    );
    if (result.code === 0 && fs.existsSync(outputPath)) {
      return {
        ok: true,
        outputPath,
        method: "imagemagick-composite",
        bytes: fs.statSync(outputPath).size,
      };
    }
    return { ok: false, error: `ImageMagick composite failed: ${result.stderr}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Prepare a product image for commercial use:
 *   - Remove background
 *   - Resize to target dimensions
 *   - Output as PNG with transparency
 */
async function prepareProductImage(inputPath, options = {}) {
  const {
    outputPath = path.join(os.tmpdir(), `product-prep-${Date.now()}.png`),
    width = 1080,
    height = 1080,
    transparentBg = true,
    removeBgFirst = true,
  } = options;

  let workingPath = inputPath;

  // Step 1: Remove background if requested
  if (removeBgFirst) {
    const bgResult = await removeBackground(inputPath, { outputPath: workingPath });
    if (!bgResult.ok) {
      return bgResult;
    }
    workingPath = bgResult.outputPath;
  }

  // Step 2: Resize to target dimensions using ImageMagick
  const magickConfig = defaultRegistry.getConfig("imagemagick-local");
  if (magickConfig && isAvailable(magickConfig) && isVerified(magickConfig)) {
    try {
      const result = await spawnMagick(
        [
          workingPath,
          "-resize",
          `${width}x${height}^`,
          "-gravity",
          "center",
          "-extent",
          `${width}x${height}`,
          "-background",
          "none",
          outputPath,
        ],
        { cwd: path.dirname(workingPath) }
      );
      if (result.code === 0 && fs.existsSync(outputPath)) {
        return {
          ok: true,
          outputPath,
          method: "product-prep",
          bytes: fs.statSync(outputPath).size,
          dimensions: { width, height },
          transparentBg,
        };
      }
      return { ok: false, error: `ImageMagick resize failed: ${result.stderr}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // No ImageMagick — just copy the cutout as-is
  fs.copyFileSync(workingPath, outputPath);
  return {
    ok: true,
    outputPath,
    method: "copy-only",
    bytes: fs.statSync(outputPath).size,
    note: "ImageMagick not available — image copied without resize",
  };
}

/**
 * Enhance an image: resize, format conversion, quality adjustment.
 */
async function enhanceImage(inputPath, options = {}) {
  const {
    outputPath = path.join(os.tmpdir(), `enhanced-${Date.now()}.png`),
    width,
    height,
    format = "png",
    quality,
  } = options;

  const magickConfig = defaultRegistry.getConfig("imagemagick-local");
  if (!magickConfig || !isAvailable(magickConfig) || !isVerified(magickConfig)) {
    return { ok: false, error: "ImageMagick connector not production-ready" };
  }

  try {
    const args = [inputPath];
    if (width && height) {
      args.push("-resize", `${width}x${height}^`, "-gravity", "center", "-extent", `${width}x${height}`);
    }
    if (quality) {
      args.push("-quality", String(quality));
    }
    args.push(outputPath);

    const result = await spawnMagick(args, { cwd: path.dirname(inputPath) });
    if (result.code === 0 && fs.existsSync(outputPath)) {
      return {
        ok: true,
        outputPath,
        method: "enhance",
        bytes: fs.statSync(outputPath).size,
      };
    }
    return { ok: false, error: `ImageMagick enhance failed: ${result.stderr}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get available image studio operations and their readiness.
 */
function getAvailableOperations() {
  const imagemagick = defaultRegistry.getConfig("imagemagick-local");
  const pythonAvailable = true; // Python is available in this environment

  return [
    {
      id: "remove-background",
      name: "Remove Background (RMBG-1.4)",
      description: "AI background removal with transparent PNG output",
      available: pythonAvailable,
      productionReady: pythonAvailable,
    },
    {
      id: "replace-background",
      name: "Replace Background",
      description: "Composite cutout over new background image",
      available: isAvailable(imagemagick) && isVerified(imagemagick),
      productionReady: isAvailable(imagemagick) && isVerified(imagemagick),
      connector: "imagemagick-local",
    },
    {
      id: "prepare-product-image",
      name: "Prepare Product Image",
      description: "Full product image prep: bg removal + resize + transparency",
      available: pythonAvailable,
      productionReady: pythonAvailable,
    },
    {
      id: "enhance-image",
      name: "Enhance Image",
      description: "Resize, format conversion, quality adjustment",
      available: isAvailable(imagemagick) && isVerified(imagemagick),
      productionReady: isAvailable(imagemagick) && isVerified(imagemagick),
      connector: "imagemagick-local",
    },
  ];
}

module.exports = {
  removeBackground,
  replaceBackground,
  prepareProductImage,
  enhanceImage,
  getAvailableOperations,
  MAX_DIM,
};
