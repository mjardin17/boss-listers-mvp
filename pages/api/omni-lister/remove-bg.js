// POST /api/omni-lister/remove-bg
// Background removal API calling Commercial Maker v6 RMBG-1.4 pipeline

import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "20mb",
    },
  },
};

const SIDECAR_URL = "http://127.0.0.1:8765/remove-bg";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { imagePath, imageBase64, imageMediaType } = req.body || {};

    if (!imagePath && !imageBase64) {
      return res.status(400).json({
        ok: false,
        error: "Provide imagePath or imageBase64",
      });
    }

    const cutoutsDir = path.join(process.cwd(), "public", "cutouts");
    if (!fs.existsSync(cutoutsDir)) {
      fs.mkdirSync(cutoutsDir, { recursive: true });
    }

    const filename = `cutout-${Date.now()}.png`;
    const outputPath = path.join(cutoutsDir, filename);

    let resolvedInputPath = imagePath;
    if (imagePath && !path.isAbsolute(imagePath)) {
      resolvedInputPath = path.join(process.cwd(), imagePath);
    }

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
          ...sidecarData,
          url: `/cutouts/${filename}`,
        });
      }
    } catch {
      // Sidecar not listening, fall through to CLI execution
    }

    // 2. Fallback: run CLI wrapper directly
    if (imageBase64) {
      const tempInput = path.join(cutoutsDir, `temp-${Date.now()}.jpg`);
      fs.writeFileSync(tempInput, Buffer.from(imageBase64, "base64"));
      resolvedInputPath = tempInput;
    }

    const scriptPath = path.join(process.cwd(), "scripts", "bg_remove_service.py");
    const { stdout, stderr } = await execFileAsync("python", [
      scriptPath,
      "--input",
      resolvedInputPath,
      "--output",
      outputPath,
    ]);

    if (stderr && stderr.includes("Error")) {
      console.error("[remove-bg CLI error]:", stderr);
    }

    let parsed = {};
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = { raw: stdout };
    }

    return res.status(200).json({
      ok: true,
      url: `/cutouts/${filename}`,
      output_path: outputPath,
      ...parsed,
    });
  } catch (err) {
    console.error("[remove-bg]", err.message);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
}
