// lib/imageHeuristics.js
const path = require("path");
const exif = require("exif-parser");
const fs = require("fs");

function wordsFromFilename(name) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
}

const HOT_WHEELS_LINES = [
  ["super", "treasure", "hunt"],
  ["treasure", "hunt"],
  ["team", "transport"],
  ["car", "culture"],
  ["red", "line", "club"],
  ["fast", "and", "furious"],
  ["boulevard"],
  ["premium"],
  ["mainline"]
];

function includesTokenSequence(tokens, sequence) {
  if (!sequence.length || sequence.length > tokens.length) return false;
  for (let i = 0; i <= tokens.length - sequence.length; i += 1) {
    if (sequence.every((part, offset) => tokens[i + offset] === part)) return true;
  }
  return false;
}

function detectHotWheels(tokens) {
  const hasBrand =
    includesTokenSequence(tokens, ["hot", "wheels"]) ||
    tokens.includes("hotwheels");
  if (!hasBrand) return null;

  const productLine = HOT_WHEELS_LINES.find((line) =>
    includesTokenSequence(tokens, line)
  );

  return {
    titleHint: ["Hot Wheels", productLine?.map(capWord).join(" ")]
      .filter(Boolean)
      .join(" "),
    categoryHint: "toys",
    tags: [
      "hot-wheels",
      "diecast",
      "mattel",
      ...(productLine ? [productLine.join("-")] : [])
    ]
  };
}

function capWord(word) {
  return word ? word[0].toUpperCase() + word.slice(1) : "";
}

// Pure filename-token heuristics, shared by both paths below. No fs, no
// EXIF — safe to call from a Workers runtime.
function inferFromFilename(fname) {
  const tokens = wordsFromFilename(fname || "");
  const out = { titleHint: null, categoryHint: null, tags: [] };

  if (tokens.length) {
    out.titleHint = tokens
      .map((t) => t[0]?.toUpperCase() + t.slice(1))
      .join(" ");
  }

  const hotWheels = detectHotWheels(tokens);
  if (hotWheels) {
    out.titleHint = hotWheels.titleHint;
    out.categoryHint = hotWheels.categoryHint;
    out.tags.push(...hotWheels.tags);
  } else if (tokens.some((t) => ["headphone", "headphones", "mdr"].includes(t))) {
    out.categoryHint = "electronics";
    out.tags.push("headphones", "audio");
  } else if (tokens.some((t) => ["shoe", "sneaker", "boot", "boots"].includes(t))) {
    out.categoryHint = "clothing";
    out.tags.push("shoes", "footwear");
  } else if (tokens.includes("vintage")) {
    out.categoryHint = "vintage";
    out.tags.push("vintage");
  }

  out.tags = Array.from(new Set(out.tags)).slice(0, 20);
  return out;
}

// Node/dev-mode path: filename heuristics + EXIF (pages/api/analyze.js,
// local `next dev` only — fs and exif-parser don't exist in Workers).
async function inferFromFile(fullpath) {
  const out = inferFromFilename(path.basename(fullpath));

  try {
    const buf = fs.readFileSync(fullpath);
    const parser = exif.create(buf);
    const result = parser.parse();
    if (result.tags) {
      if (result.tags.Model && !out.titleHint)
        out.titleHint = String(result.tags.Model);
      if (result.tags.Make)
        out.tags.push(String(result.tags.Make).toLowerCase());
    }
    out.tags = Array.from(new Set(out.tags)).slice(0, 20);
  } catch (e) {
    // ignore EXIF errors
  }

  return out;
}

module.exports = { inferFromFile, inferFromFilename, detectHotWheels };
