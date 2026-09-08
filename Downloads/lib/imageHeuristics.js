// lib/imageHeuristics.js
const path = require("path");

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
const TOY_TOKENS = new Set([
  "transformers",
  "hasbro",
  "mattel",
  "lego",
  "funko",
  "pokemon",
  "figure",
  "actionfigure",
  "diecast",
  "collectible",
  "doll",
  "plush",
  "blister",
  "carded"
]);
const ELECTRONICS_TOKENS = new Set([
  "headphone",
  "headphones",
  "earbuds",
  "speaker",
  "bluetooth",
  "wireless",
  "charger",
  "usbc",
  "usb",
  "hdmi",
  "controller",
  "console",
  "keyboard",
  "mouse",
  "router",
  "sony",
  "apple",
  "samsung",
  "onn",
  "jbl",
  "bose",
  "beats",
  "anker"
]);
const APPAREL_TOKENS = new Set([
  "shirt",
  "tee",
  "hoodie",
  "jacket",
  "pants",
  "jeans",
  "shorts",
  "dress",
  "sweater",
  "apparel",
  "nwt",
  "nike",
  "adidas",
  "hanes",
  "levis",
  "underarmour"
]);
const HOUSEHOLD_TOKENS = new Set([
  "kitchen",
  "cookware",
  "storage",
  "container",
  "organizer",
  "bedding",
  "towel",
  "lamp",
  "decor",
  "home",
  "vacuum",
  "filter",
  "rubbermaid",
  "sterilite",
  "mainstays",
  "pyrex"
]);

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

function looksLikeGeneratedUploadName(name = "") {
  const stem = path.basename(name).replace(/\.[^.]+$/, "");
  return (
    /^\d{10,}-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      stem
    ) || /^[0-9a-f-]{24,}$/i.test(stem)
  );
}

async function inferFromFile(fullpath, originalName = "") {
  const fname = originalName || path.basename(fullpath);
  const tokens = wordsFromFilename(fname);
  const out = { titleHint: null, categoryHint: null, tags: [] };

  if (tokens.length && !looksLikeGeneratedUploadName(fname)) {
    out.titleHint = tokens
      .map((t) => t[0]?.toUpperCase() + t.slice(1))
      .join(" ");
  }

  const hotWheels = detectHotWheels(tokens);
  if (hotWheels) {
    out.titleHint = hotWheels.titleHint;
    out.categoryHint = hotWheels.categoryHint;
    out.tags.push(...hotWheels.tags);
  } else if (tokens.some((t) => TOY_TOKENS.has(t))) {
    out.categoryHint = "toys";
    out.tags.push("toys");
    if (tokens.includes("transformers")) out.tags.push("transformers", "hasbro");
    if (tokens.includes("lego")) out.tags.push("lego");
    if (tokens.includes("funko")) out.tags.push("funko");
    if (tokens.includes("pokemon")) out.tags.push("pokemon");
    if (tokens.includes("figure") || tokens.includes("actionfigure")) {
      out.tags.push("action-figure");
    }
    if (tokens.includes("diecast")) out.tags.push("diecast");
  } else if (tokens.some((t) => ELECTRONICS_TOKENS.has(t) || ["mdr"].includes(t))) {
    out.categoryHint = "electronics";
    out.tags.push("electronics");
    if (tokens.some((t) => ["headphone", "headphones", "earbuds", "speaker"].includes(t))) {
      out.tags.push("audio");
    }
    if (tokens.some((t) => ["bluetooth", "wireless"].includes(t))) out.tags.push("wireless");
  } else if (tokens.some((t) => ["shoe", "sneaker", "boot", "boots"].includes(t))) {
    out.categoryHint = "footwear";
    out.tags.push("shoes", "footwear");
  } else if (tokens.some((t) => APPAREL_TOKENS.has(t))) {
    out.categoryHint = "apparel";
    out.tags.push("apparel");
    if (tokens.includes("nwt")) out.tags.push("new-with-tags");
  } else if (tokens.some((t) => HOUSEHOLD_TOKENS.has(t))) {
    out.categoryHint = "household";
    out.tags.push("household");
  } else if (tokens.includes("vintage")) {
    out.categoryHint = "vintage";
    out.tags.push("vintage");
  }

  out.tags = Array.from(new Set(out.tags)).slice(0, 20);
  return out;
}

module.exports = { inferFromFile, detectHotWheels, looksLikeGeneratedUploadName };
