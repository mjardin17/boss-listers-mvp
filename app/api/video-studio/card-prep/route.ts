import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { NextResponse } from "next/server";

import { resolveSession } from "../../../../lib/supabaseAuth";
import {
  CARD_STAGE_BACKDROP_PRESETS,
  VIDEO_BG_PRESETS
} from "../../../../lib/video-studio/cardShowcase";

// CommonJS helper for strict path confinement inside public/
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveConfined, publicRoots } = require("../../../../lib/safePaths");

export const runtime = "nodejs";

const VALID_MODES = new Set(["card", "cutout", "crop", "closeup", "none"]);
const VALID_REGIONS = new Set(["art", "top", "bottom", "center"]);
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const CROP_RULE = /^\d*\.?\d+,\d*\.?\d+,\d*\.?\d+,\d*\.?\d+$/;
const HEX_COLOR_RULE = /^#[0-9a-fA-F]{3,6}$/;
const MAX_BASE64_CHARS = 20 * 1024 * 1024;
const ALLOWED_ROOTS = publicRoots("uploads", "cutouts", "backgrounds", "styleframes");

async function requireSession(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return token ? resolveSession(process.env, token) : null;
}

function findPythonBin(): string | null {
  for (const bin of ["python3", "python"]) {
    const probe = spawnSync(bin, ["--version"], {
      encoding: "utf8",
      windowsHide: true
    });
    if (!probe.error && probe.status === 0) return bin;
  }
  return null;
}

function decodeBase64Image(raw: string): { buffer: Buffer; ext: string } | null {
  if (typeof raw !== "string" || !raw.trim() || raw.length > MAX_BASE64_CHARS) {
    return null;
  }
  let ext = ".jpg";
  let payload = raw.trim();
  const dataUrlMatch = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(payload);
  if (dataUrlMatch) {
    const subtype = dataUrlMatch[1].toLowerCase();
    ext = subtype === "png" ? ".png" : subtype === "webp" ? ".webp" : ".jpg";
    payload = dataUrlMatch[2];
  }
  const buffer = Buffer.from(payload, "base64");
  if (!buffer.length) return null;
  return { buffer, ext };
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    videoBackgrounds: Object.values(VIDEO_BG_PRESETS),
    cardStageBackdrops: Object.values(CARD_STAGE_BACKDROP_PRESETS)
  });
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let tempInput: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const rawPath = typeof body.imagePath === "string" ? body.imagePath.trim() : "";
    const rawBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    const mode = typeof body.mode === "string" && VALID_MODES.has(body.mode)
      ? body.mode
      : "card";
    const region = typeof body.region === "string" && VALID_REGIONS.has(body.region)
      ? body.region
      : "art";
    const crop = typeof body.crop === "string" && CROP_RULE.test(body.crop.trim())
      ? body.crop.trim()
      : undefined;
    const replaceBgColor =
      typeof body.replaceBgColor === "string" && HEX_COLOR_RULE.test(body.replaceBgColor.trim())
        ? body.replaceBgColor.trim()
        : undefined;

    if (!rawPath && !rawBase64) {
      return NextResponse.json(
        { ok: false, error: "Provide imagePath or imageBase64" },
        { status: 400 }
      );
    }

    const cutoutsDir = path.join(process.cwd(), "public", "cutouts");
    fs.mkdirSync(cutoutsDir, { recursive: true });

    let inputDiskPath: string | null = null;
    if (rawBase64) {
      const decoded = decodeBase64Image(rawBase64);
      if (!decoded) {
        return NextResponse.json(
          { ok: false, error: "Invalid imageBase64 payload" },
          { status: 400 }
        );
      }
      tempInput = path.join(
        cutoutsDir,
        `temp-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${decoded.ext}`
      );
      fs.writeFileSync(tempInput, decoded.buffer);
      inputDiskPath = tempInput;
    } else if (rawPath) {
      const resolved = resolveConfined(rawPath, ALLOWED_ROOTS);
      if (!resolved || !IMAGE_EXT.test(resolved)) {
        return NextResponse.json(
          { ok: false, error: "imagePath is not an allowed image location" },
          { status: 400 }
        );
      }
      if (!fs.existsSync(resolved)) {
        return NextResponse.json(
          { ok: false, error: "Input image not found" },
          { status: 404 }
        );
      }
      inputDiskPath = resolved;
    }

    const outName = `prep-${mode}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.png`;
    const outputDiskPath = path.join(cutoutsDir, outName);

    const pyBin = findPythonBin();
    if (!pyBin) {
      return NextResponse.json(
        { ok: false, error: "Python 3 is required for local background removal" },
        { status: 500 }
      );
    }

    const scriptPath = path.join(process.cwd(), "scripts", "card_prep.py");
    const args = [
      scriptPath,
      "--input",
      inputDiskPath as string,
      "--output",
      outputDiskPath,
      "--mode",
      mode
    ];
    if (crop) args.push("--crop", crop);
    if (mode === "closeup") args.push("--region", region);
    if (replaceBgColor) args.push("--replace-bg-color", replaceBgColor);

    const proc = spawnSync(pyBin, args, {
      encoding: "utf8",
      windowsHide: true,
      timeout: 120_000
    });

    if (proc.error || proc.status !== 0 || !fs.existsSync(outputDiskPath)) {
      console.error("[video-studio/card-prep]", proc.stderr || proc.stdout || proc.error);
      return NextResponse.json(
        { ok: false, error: "Image background preparation failed" },
        { status: 500 }
      );
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(proc.stdout || "{}");
    } catch {
      parsed = {};
    }

    return NextResponse.json({
      ok: true,
      url: `/cutouts/${outName}`,
      mode,
      strategy: parsed.strategy || mode,
      width: parsed.width || null,
      height: parsed.height || null,
      backgroundRemoved: Boolean(parsed.background_removed),
      coveragePct: parsed.coverage_pct ?? null
    });
  } catch (err) {
    console.error("[video-studio/card-prep]", err);
    return NextResponse.json(
      { ok: false, error: "Image background preparation failed" },
      { status: 500 }
    );
  } finally {
    if (tempInput) {
      try {
        fs.unlinkSync(tempInput);
      } catch {
        // already removed
      }
    }
  }
}
