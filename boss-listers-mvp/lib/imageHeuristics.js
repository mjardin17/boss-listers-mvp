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

async function inferFromFile(fullpath) {
  const fname = path.basename(fullpath);
  const tokens = wordsFromFilename(fname);
  const out = { titleHint: null, categoryHint: null, tags: [] };

  if (tokens.length) {
    out.titleHint = tokens
      .map((t) => t[0]?.toUpperCase() + t.slice(1))
      .join(" ");
  }

  if (tokens.some((t) => ["headphone", "headphones", "mdr"].includes(t))) {
    out.categoryHint = "electronics";
    out.tags.push("headphones", "audio");
  } else if (tokens.some((t) => ["shoe", "sneaker", "boot", "boots"].includes(t))) {
    out.categoryHint = "clothing";
    out.tags.push("shoes", "footwear");
  } else if (tokens.includes("vintage")) {
    out.categoryHint = "vintage";
    out.tags.push("vintage");
  }

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
  } catch (e) {
    // ignore EXIF errors
  }

  out.tags = Array.from(new Set(out.tags)).slice(0, 20);
  return out;
}

module.exports = { inferFromFile };
