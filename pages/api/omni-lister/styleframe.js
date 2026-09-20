import path from "path";
import fs from "fs";
import { execFile } from "child_process";

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      presets: [
        {
          id: "amazon_white",
          name: "Amazon Pure White",
          description: "100% #FFFFFF background, compliant contact shadow, high-key studio light.",
          badge: "Amazon Main Image Compliant",
          type: "solid",
        },
        {
          id: "minimalist_dark",
          name: "Minimalist Charcoal Studio",
          description: "Radial dark slate vignette with soft spotlight and matte pedestal.",
          badge: "Luxury & Electronics",
          type: "gradient",
        },
        {
          id: "cyber_neon",
          name: "TikTok Cyber Neon",
          description: "Electric cyan (#00f2fe) and orange (#ff9900) rim glows with glowing ring pedestal.",
          badge: "TikTok Shop / Viral Video",
          type: "neon",
        },
        {
          id: "luxury_warm",
          name: "Warm Luxury Editorial",
          description: "Terracotta and bronze studio tones for fashion, jewelry, and lifestyle items.",
          badge: "Editorial & Apparel",
          type: "warm",
        },
        {
          id: "commercial_showcase",
          name: "Commercial Maker Showcase",
          description: "Commercial Maker v6 cinematic studio backdrop dynamically graded to product palette.",
          badge: "Commercial Maker v6",
          type: "image",
          bg_url: "/backgrounds/bg-showcase.jpg",
        },
        {
          id: "commercial_features",
          name: "Commercial Maker Features",
          description: "Dynamic feature highlight backdrop with floor platform and depth lighting.",
          badge: "Commercial Maker v6",
          type: "image",
          bg_url: "/backgrounds/bg-features.jpg",
        },
      ],
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const {
    cutout_url = "/cutouts/wc-shorts-cutout.png",
    preset = "amazon_white",
    action = "render_keyframes",
    sku = "default",
  } = req.body || {};

  try {
    const rootDir = process.cwd();
    // Resolve cutout path on disk
    let relativeCutout = cutout_url.startsWith("/") ? cutout_url.slice(1) : cutout_url;
    let inputDiskPath = path.join(rootDir, "public", relativeCutout.replace(/^cutouts\//, "cutouts/"));
    if (!fs.existsSync(inputDiskPath)) {
      // Check if it was directly in public
      inputDiskPath = path.join(rootDir, "public", relativeCutout);
    }

    if (!fs.existsSync(inputDiskPath)) {
      return res.status(404).json({
        ok: false,
        error: `Cutout file not found at ${inputDiskPath}`,
      });
    }

    const safeSku = (sku || "item").replace(/[^a-zA-Z0-9_-]/g, "_");
    const outRelDir = path.join("public", "styleframes", safeSku);
    const outDiskDir = path.join(rootDir, outRelDir);
    fs.mkdirSync(outDiskDir, { recursive: true });

    const scriptPath = path.join(rootDir, "scripts", "styleframe_engine.py");

    const args = [
      scriptPath,
      "--input",
      inputDiskPath,
      "--preset",
      preset,
      "--out-dir",
      outDiskDir,
    ];

    if (action === "render_gif") {
      args.push("--gif");
    }

    await new Promise((resolve, reject) => {
      execFile("python", args, { cwd: rootDir }, (err, stdout, stderr) => {
        if (err) {
          console.error("StyleFrame engine error:", stderr || stdout);
          return reject(err);
        }
        resolve(stdout);
      });
    });

    const prefixUrl = `/styleframes/${safeSku}`;
    const keyframes = [
      {
        angle: 0,
        label: "Front 0°",
        url: `${prefixUrl}/styleframe_${preset}_front_0deg.png`,
      },
      {
        angle: 45,
        label: "3/4 Hero 45°",
        url: `${prefixUrl}/styleframe_${preset}_angle_45deg.png`,
      },
      {
        angle: 90,
        label: "Profile 90°",
        url: `${prefixUrl}/styleframe_${preset}_profile_90deg.png`,
      },
      {
        angle: 315,
        label: "Reverse Dynamic 315°",
        url: `${prefixUrl}/styleframe_${preset}_dynamic_315deg.png`,
      },
    ];

    const gifUrl = action === "render_gif"
      ? `${prefixUrl}/turntable_${preset}_360.gif`
      : null;

    return res.status(200).json({
      ok: true,
      preset,
      keyframes,
      gif_url: gifUrl,
      output_dir: prefixUrl,
    });
  } catch (err) {
    console.error("API /api/omni-lister/styleframe error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to render styleframes",
    });
  }
}
