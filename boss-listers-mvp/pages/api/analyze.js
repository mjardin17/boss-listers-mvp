// pages/api/analyze.js
import formidable from "formidable";
import fs from "fs-extra";
import path from "path";
import { inferFromFile } from "../../lib/imageHeuristics";
import { generateForAll } from "../../lib/generator";
import { saveListing } from "../../lib/store";
import { getPricingRecommendation } from "../../lib/pricingIntelligence";

export const config = {
  api: { bodyParser: false }
};

function parseForm(req) {
  const uploadsDir =
    process.env.UPLOADS_DIR || "uploads";
  const dir = path.join(process.cwd(), "public", uploadsDir);
  fs.ensureDirSync(dir);

  const form = formidable({
    uploadDir: dir,
    keepExtensions: true,
    maxFiles: 8,
    maxFileSize: 12 * 1024 * 1024
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

function fieldVal(fields, key, fallback = "") {
  const v = fields[key];
  if (Array.isArray(v)) return v[0] ?? fallback;
  return v ?? fallback;
}

function collectFiles(files) {
  const raw = files.photos || files.photo || files.file;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { fields, files } = await parseForm(req);
    const uploaded = collectFiles(files);
    const uploadsDir = process.env.UPLOADS_DIR || "uploads";

    const imageUrls = [];
    const merged = { titleHint: null, categoryHint: null, tags: [] };

    for (const f of uploaded) {
      const rel = `/${uploadsDir}/${path.basename(f.filepath)}`;
      imageUrls.push(rel);
      const hint = await inferFromFile(f.filepath);
      if (hint.titleHint && !merged.titleHint) merged.titleHint = hint.titleHint;
      if (hint.categoryHint && !merged.categoryHint)
        merged.categoryHint = hint.categoryHint;
      merged.tags = Array.from(new Set([...merged.tags, ...(hint.tags || [])]));
    }

    const titleHint = fieldVal(fields, "titleHint") || merged.titleHint || "";
    const parts = titleHint.split(/\s+/).filter(Boolean);
    const inferredBrand = parts[0] || "";
    const inferredModel = parts.slice(1).join(" ") || "";

    const input = {
      brand: fieldVal(fields, "brand") || inferredBrand,
      model: fieldVal(fields, "model") || inferredModel,
      condition: fieldVal(fields, "condition", "Used"),
      size: fieldVal(fields, "size"),
      categoryHint: fieldVal(fields, "categoryHint") || merged.categoryHint || "",
      suggestedPrice: parseFloat(fieldVal(fields, "suggestedPrice")) || undefined,
      costOfGoods: parseFloat(fieldVal(fields, "costOfGoods")) || 0,
      weightLb: parseFloat(fieldVal(fields, "weightLb")) || 1,
      description: fieldVal(fields, "description"),
      tags: merged.tags,
      imageUrls
    };

    const shouldGenerate =
      fieldVal(fields, "generate") === "true" ||
      fieldVal(fields, "generate") === "1";

    let outputs = [];
    const pricing = getPricingRecommendation(input);
    if (shouldGenerate && (input.brand || input.model || titleHint)) {
      outputs = generateForAll(input);
    }

    const sessionId = fieldVal(fields, "sessionId", "anon");
    let saved = null;
    if (shouldGenerate && outputs.length) {
      saved = await saveListing({
        sessionId,
        input,
        outputs,
        imageUrls
      });
    }

    return res.status(200).json({
      ok: true,
      hints: merged,
      input,
      pricing,
      outputs,
      savedId: saved?.id || null,
      imageUrls
    });
  } catch (e) {
    console.error("analyze error", e);
    return res.status(500).json({ ok: false, error: e.message || "Analyze failed" });
  }
}
