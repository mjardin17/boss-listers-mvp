import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolveConfined, publicRoots } from "../../../lib/safePaths";

const { requireSession } = require("../../../lib/requireSession");
const { enforceTenantRateLimit } = require("../../../lib/rateLimit");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const MEDIA_ROOTS = publicRoots("styleframes", "uploads", "cutouts", "commercials");
const STILL_EXT = /\.(png|jpe?g|webp)$/i;
const CLIP_EXT = /\.(gif|mp4|webm)$/i;
const MAX_STILLS = 12;
const PYTHON_TIMEOUT_MS = 5 * 60 * 1000;

// The ONLY client fields that may feed the cutter. Notably absent: id, tenant_id,
// description (always taken from the DB row), and anything else on the record.
const BODY_FIELDS = ["title", "name", "brand", "condition", "price", "freeShipping", "slug"];

function pickBodyFields(body) {
  const out = {};
  for (const key of BODY_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

function runCutter(payload) {
  const scriptPath = path.join(process.cwd(), "scripts", "commercial_cutter.py");
  return new Promise((resolve, reject) => {
    const py = spawn("python", [scriptPath, "--json", JSON.stringify(payload)], { cwd: process.cwd() });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      py.kill();
      reject(new Error("Commercial cutter timed out"));
    }, PYTHON_TIMEOUT_MS);
    py.stdout.on("data", (d) => (stdout += d.toString()));
    py.stderr.on("data", (d) => (stderr += d.toString()));
    py.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    py.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.error("[cut-commercials] cutter exit", code, stderr || stdout);
        return reject(new Error(`Commercial cutter failed with code ${code}`));
      }
      resolve(stdout);
    });
  });
}

/** Confine every client-supplied media reference; returns an absolute path or throws. */
function confineMedia(value, extPattern, label) {
  const resolved = resolveConfined(value, MEDIA_ROOTS);
  if (!resolved || !extPattern.test(resolved)) {
    const err = new Error(`${label} is not an allowed media location`);
    err.status = 400;
    throw err;
  }
  return resolved;
}

function gatherStills(product) {
  let stills = [];
  if (Array.isArray(product.stills) && product.stills.length > 0) {
    stills = product.stills;
  } else if (Array.isArray(product.keyframes) && product.keyframes.length > 0) {
    stills = product.keyframes.map((k) => (typeof k === "string" ? k : k && k.url)).filter(Boolean);
  }
  if (stills.length > MAX_STILLS) {
    const err = new Error("Too many stills");
    err.status = 400;
    throw err;
  }
  if (stills.length > 0) {
    return stills.map((s) => confineMedia(s, STILL_EXT, "stills"));
  }
  // Server-owned default fallbacks (not client supplied)
  const defaults = [
    "public/styleframes/wc-shorts/styleframe_amazon_white_front_0deg.png",
    "public/styleframes/wc-shorts/styleframe_amazon_white_angle_45deg.png",
    "public/styleframes/wc-shorts/styleframe_amazon_white_profile_90deg.png",
  ].map((p) => path.join(process.cwd(), p));
  return defaults.filter((p) => fs.existsSync(p));
}

function mergeMediaIntoDescription(description, mediaObj) {
  let currentDesc = description || "";
  let mergedMedia = { ...mediaObj };
  const match = currentDesc.match(/<!-- STYLEFRAME_MEDIA:\s*(\{.*?\})\s*-->/);
  if (match) {
    try {
      mergedMedia = { ...JSON.parse(match[1]), ...mediaObj };
    } catch {}
    return currentDesc.replace(
      /<!-- STYLEFRAME_MEDIA:\s*\{.*?\}\s*-->/,
      `<!-- STYLEFRAME_MEDIA: ${JSON.stringify(mergedMedia)} -->`
    );
  }
  return `${currentDesc}\n\n<!-- STYLEFRAME_MEDIA: ${JSON.stringify(mergedMedia)} -->`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const session = await requireSession(req, res);
  if (!session) return;
  if (!enforceTenantRateLimit(session, res, "cut-commercials", { max: 10 })) return;

  try {
    const body = req.body || {};
    // Whitelisted client fields only; id/tenant_id/description can never come from the body.
    let product = pickBodyFields(body);

    // If a productId is passed, fetch the record — scoped to THIS tenant.
    if (body.productId) {
      if (!supabase) {
        return res.status(503).json({ ok: false, error: "Database not configured" });
      }
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", body.productId)
        .eq("tenant_id", session.tenantId)
        .single();
      if (error || !data) {
        return res.status(404).json({ ok: false, error: "Product not found" });
      }
      product = { ...data, ...product };
    }

    // STRICT PRICE RULE: Use record price. If none set, STOP and fail loudly — never invent one.
    const price = product.price;
    if (price === undefined || price === null || price === "" || Number(price) <= 0) {
      return res.status(400).json({
        ok: false,
        error: "CRITICAL: Product record has no price set. STOPPING — never invent one.",
      });
    }

    const title = String(product.title || product.name || "Product").slice(0, 200);
    const brand = String(product.brand || "").slice(0, 100);
    const condition = String(product.condition || "new").slice(0, 50);
    const freeShipping = product.freeShipping !== undefined ? Boolean(product.freeShipping) : true;
    const slug = String(
      product.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30) || "commercial"
    ).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);

    // Media references are client supplied (body) -> confined to public/ media folders.
    const mediaSource = pickMedia(body);
    const resolvedStills = gatherStills(mediaSource);
    const clipRef = mediaSource.turntable_clip || mediaSource.styleframe_video || null;
    const turntableClip = clipRef ? confineMedia(clipRef, CLIP_EXT, "turntable_clip") : null;

    const payload = {
      title,
      brand,
      condition,
      price: Number(price),
      freeShipping,
      slug,
      stills: resolvedStills,
      turntable_clip: turntableClip,
    };

    const stdoutData = await runCutter(payload);

    const jsonMatch = stdoutData.match(/SUMMARY_JSON:\s*(\{[\s\S]*\})/);
    if (!jsonMatch) {
      console.error("[cut-commercials] unparseable cutter output:", stdoutData.slice(0, 500));
      return res.status(500).json({ ok: false, error: "Failed to parse cutter output summary" });
    }
    const results = JSON.parse(jsonMatch[1]);

    // Update the product record (tenant-scoped) only when it was loaded for this tenant.
    if (body.productId && product.id && supabase) {
      const mediaObj = {
        commercial_tiktok_url: results.tiktok?.url || null,
        commercial_instagram_url: results.instagram?.url || null,
        commercial_facebook_url: results.facebook?.url || null,
      };
      const { error: updateError } = await supabase
        .from("products")
        .update({ description: mergeMediaIntoDescription(product.description, mediaObj) })
        .eq("id", product.id)
        .eq("tenant_id", session.tenantId);
      if (updateError) {
        console.error("[cut-commercials] product update failed:", updateError.message);
      }
    }

    return res.status(200).json({ ok: true, commercials: results });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    console.error("[cut-commercials]", err.message);
    return res.status(500).json({ ok: false, error: "Failed to cut commercials" });
  }
}

// Client-supplied media references (each one is confined before use).
function pickMedia(body) {
  return {
    stills: body.stills,
    keyframes: body.keyframes,
    turntable_clip: body.turntable_clip,
    styleframe_video: body.styleframe_video,
  };
}
