// POST /api/omni-lister/remove-bg
// Background removal API calling Commercial Maker v6 RMBG-1.4 pipeline

import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import { resolveConfined, publicRoots } from "../../../lib/safePaths";

const { requireSession } = require("../../../lib/requireSession");
const { enforceTenantRateLimit } = require("../../../lib/rateLimit");

const execFileAsync = promisify(execFile);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "20mb",
    },
  },
};

const SIDECAR_URL = "http://127.0.0.1:8765/remove-bg";
const MAX_BASE64_CHARS = 28 * 1024 * 1024; // ~20MB of image data
const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
// Server-side files a caller may point at: uploaded/derived images plus the demo image.
const ALLOWED_ROOTS = publicRoots("uploads", "cutouts", "styleframes");
const ALLOWED_FILES = [path.join(process.cwd(), "public", "wc-shorts.jpg")];

function stripServerPaths(data) {
  const { input_path, output_path, ...safe } = data || {};
  return safe;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const session = await requireSession(req, res);
  if (!session) return;
  if (!enforceTenantRateLimit(session, res, "remove-bg", { max: 20 })) return;

  let tempInput = null;
  try {
    const { imagePath, imageBase64 } = req.body || {};

    if (!imagePath && !imageBase64) {
      return res.status(400).json({
        ok: false,
        error: "Provide imagePath or imageBase64",
      });
    }
    if (imageBase64 && (typeof imageBase64 !== "string" || imageBase64.length > MAX_BASE64_CHARS)) {
      return res.status(400).json({ ok: false, error: "Invalid imageBase64" });
    }

    // Confine any client-supplied path to the allowed public/ folders.
    let resolvedInputPath = null;
    if (imagePath) {
      resolvedInputPath = resolveConfined(imagePath, ALLOWED_ROOTS, ALLOWED_FILES);
      if (!resolvedInputPath || !IMAGE_EXT.test(resolvedInputPath)) {
        return res.status(400).json({ ok: false, error: "imagePath is not an allowed image location" });
      }
      if (!fs.existsSync(resolvedInputPath)) {
        return res.status(404).json({ ok: false, error: "Image not found" });
      }
    }

    const cutoutsDir = path.join(process.cwd(), "public", "cutouts");
    if (!fs.existsSync(cutoutsDir)) {
      fs.mkdirSync(cutoutsDir, { recursive: true });
    }

    const filename = `cutout-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.png`;
    const outputPath = path.join(cutoutsDir, filename);

    // 1. Try warm Python sidecar service first
    try {
      const sidecarRes = await fetch(SIDECAR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input_path: resolvedInputPath,
          image_base64: imageBase64,
          output_path: outputPath,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (sidecarRes.ok) {
        const sidecarData = await sidecarRes.json();
        return res.status(200).json({
          ...stripServerPaths(sidecarData),
          url: `/cutouts/${filename}`,
        });
      }
    } catch {
      // Sidecar not listening, fall through to CLI execution
    }

    // 2. Fallback: run CLI wrapper directly
    if (imageBase64) {
      tempInput = path.join(cutoutsDir, `temp-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.jpg`);
      fs.writeFileSync(tempInput, Buffer.from(imageBase64, "base64"));
      resolvedInputPath = tempInput;
    }

    const scriptPath = path.join(process.cwd(), "scripts", "bg_remove_service.py");
    const { stdout, stderr } = await execFileAsync(
      "python",
      [scriptPath, "--input", resolvedInputPath, "--output", outputPath],
      { timeout: 120_000 }
    );

    if (stderr && stderr.includes("Error")) {
      console.error("[remove-bg CLI error]:", stderr);
    }

    let parsed = {};
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = {};
    }

    return res.status(200).json({
      ok: true,
      ...stripServerPaths(parsed),
      url: `/cutouts/${filename}`,
    });
  } catch (err) {
    console.error("[remove-bg]", err.message);
    return res.status(500).json({ ok: false, error: "Background removal failed" });
  } finally {
    if (tempInput) {
      try {
        fs.unlinkSync(tempInput);
      } catch {
        // already gone
      }
    }
  }
}
