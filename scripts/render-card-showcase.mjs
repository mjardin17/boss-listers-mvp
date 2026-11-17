#!/usr/bin/env node
// scripts/render-card-showcase.mjs
// Commercial Maker v6 — Card Showcase mode (Remotion volume lane).
// Reads ONE card from the local card vault (photo + stored facts: name, set, year, card number,
// and an optional already-stored price — never invented), removes & replaces backgrounds locally
// via scripts/card_prep.py (zero paid APIs), supports cutting extra pictures in (full, PiP,
// split-screen, macro close-up), and renders a ~12s 1080x1920 9:16 vertical showcase reel.
//
// Render-only: never auto-lists, never auto-posts, never modifies the card vault,
// no paid AI video, no voiceover.
//
// Usage:
//   node scripts/render-card-showcase.mjs --vault data/card-vault.json
//   node scripts/render-card-showcase.mjs --vault data/card-vault.json --bg-preset gold-rays --auto-closeup
//   node scripts/render-card-showcase.mjs --vault data/card-vault.json --bg-image my-bg.jpg --cut-in "back.jpg|label=Back|layout=split|bg=card"

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const require = createRequire(import.meta.url);
const { createVault, findCardWithPhoto } = require("../lib/cardVault.js");
const {
  VIDEO_BG_PRESETS,
  CARD_STAGE_BACKDROPS,
  CARD_FRAME_STYLES,
  CARD_BG_REMOVE_MODES,
  CUTIN_LAYOUTS,
  CUTIN_POSITIONS,
  CUTIN_TRANSITIONS,
  CARD_SHOWCASE_DEFAULTS,
  buildCardShowcaseProject,
  buildGeneralItemShowcaseRecord,
  formatCardShowcaseSlug,
} = require("../lib/cardCommercial.js");
const { COMMERCIALS_DIR } = require("../lib/commercialFiles.js");
const {
  detectItemCategory,
  recommendCommercialRecipe,
  recordCommercialRun,
  recordCommercialFeedback,
  summarizeLearningProgress,
} = require("../lib/commercialLearning.js");

const CARD_PREP_SCRIPT = path.join(process.cwd(), "scripts", "card_prep.py");
const COMMERCIAL_QC_SCRIPT = path.join(process.cwd(), "scripts", "commercial_qc.py");

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
};

function printHelp() {
  console.log(`BossListers Commercial Maker v6 — Card Showcase (Remotion volume lane)

Usage:
  node scripts/render-card-showcase.mjs [options]

Vault / Direct Item & Output:
  --vault <path>              Path to card vault (.json or .sqlite/.sqlite3)
  --card-id <id>              Vault card ID (defaults to first card with a photo)
  --photo <path|url>          Direct general-item / bundle photo (no card vault needed;
                              defaults to --bg-remove cutout and --frame floating)
  --title <text>              Headline for --photo mode (e.g. "Happy Smiles Bundle")
  --subtitle <text>           Second line for --photo mode (e.g. "Mint Breeze & Dispenser")
  --detail <text>             Gold detail line for --photo mode (e.g. "2-Item Bundle · 6.76 + 6.4 fl oz")
  --price <number>            Optional explicit price (ONLY displayed when passed; never invented)
  --out <path>                Output MP4 path (default: public/commercials/<slug>_reel_9_16.mp4)

Brand & Copy:
  --cta <text>                Gold pill CTA line (default: "${CARD_SHOWCASE_DEFAULTS.ctaLine}")
  --handle <text>             Bottom social handle (default: "${CARD_SHOWCASE_DEFAULTS.handle}")
  --brand <text>              Brand name (default: "${CARD_SHOWCASE_DEFAULTS.brandName}")
  --sub-brand <text>          Sub-brand label (default: "${CARD_SHOWCASE_DEFAULTS.subBrand}")
  --logo <path|url>           Optional circular logo image (default: built-in gold JO crest)
  --music <path|url>          Optional free/unlicensed audio bed (default: silent; no voiceover)

Background Removal & Replacement (100% local, zero paid APIs):
  --bg-remove <mode>          Remove card photo background: card | cutout | none (default: card)
  --crop <x,y,w,h>            Optional normalized crop (0..1) on main card photo
  --corners <8 numbers>       Optional manual 4-corner perspective override for card cutout
  --card-aspect <type>        standard | slab | landscape | preserve (default: standard)
  --bg-preset <preset>        Replace full video background:
                              ${Object.keys(VIDEO_BG_PRESETS).join(" | ")}
                              (default: ${CARD_SHOWCASE_DEFAULTS.bgPreset})
  --bg-image <path|url>       Replace full video background with any custom image
  --bg-color <hex>            Replace full video background with a custom hex color
  --bg-dim <0..0.92>          Darken image background for text contrast
  --no-bg-motion              Disable subtle slow motion on background image
  --card-bg <preset>          Replace behind-card stage backdrop:
                              ${CARD_STAGE_BACKDROPS.join(" | ")} (default: transparent)
  --card-bg-image <path|url>  Replace behind-card stage backdrop with a custom image
  --card-bg-color <hex>       Replace behind-card stage backdrop with a custom hex color
  --frame <style>             gold-frame | floating | minimal (default: gold-frame)

Cut Pictures In (Cutaways, PiP Insets, Split View, Close-Ups):
  --cut-in <spec>             Repeatable! Cut a picture into the showcase:
                              Plain path/URL OR pipe-delimited options:
                              "pic.jpg|label=Back|layout=full|pip|split|closeup|pos=bottom-right|transition=fade|cut|slide-left|slide-up|zoom|start=5.2|dur=2.2|bg=card|cutout|none|crop=x,y,w,h|zoom=1.2|focus=50,40"
  --cut-ins-json <path>       JSON file containing an array of cut-in objects
  --include-back              Automatically cut in the vault card's backImage (if stored)
  --auto-closeup              Automatically extract & cut in an artwork close-up from the card
  --auto-closeup-layout <l>   Layout for --auto-closeup: pip | full | split | closeup (default: pip)
  --auto-closeup-region <r>   Region for --auto-closeup: art | top | bottom | center (default: art)
  --auto-bundle-cutins        Automatically split a 2-item bundle cutout into individual Item 1 &
                              Item 2 transparent PNG cut-ins (local RMBG-1.4 + DP seam split)
  --item1-label <text>        Badge label for split Item 1 cut-in (default: "Item 1 of 2")
  --item2-label <text>        Badge label for split Item 2 cut-in (default: "Item 2 of 2")

Self-Improving Builder (local learning memory & automated QC, zero paid APIs):
  --auto-improve              If QC score < 88 with a concrete fixable tweak, auto-tune & re-render once
  --explore                   Test an untried high-potential backdrop or transition to expand the playbook
  --no-learn                  Disable learned recipe defaults and skip recording this run
  --learning-store <path>     Custom path to learning memory JSON (default: data/commercial-learning.json)
  --learning-report           Show current improvement trend, scores, and winning recipes per category
  --rate <runId>              Rate a past commercial so the builder learns what you & buyers prefer
    --stars <1-5>             Star rating (1..5)
    --tags <a,b,c>            Comma-separated feedback tags (e.g. loved-backdrop,bg-too-bright,item-sold)
    --notes <text>            Optional note
    --views <n>               Optional view count
    --inquiries <n>           Optional DM / inquiry count
    --sold                    Mark item as sold from this commercial

Other:
  --dry-run                   Resolve vault card & full spec JSON without rendering
  --json                      Print structured JSON summary to stdout
  --help, -h                  Show this help
`);
}

function parseCutInSpec(rawSpec, index) {
  const parts = String(rawSpec || "").split("|").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new Error("--cut-in requires an image path or URL");
  }
  const spec = {
    id: `cutin-${index + 1}`,
    image: parts[0],
    label: "",
    layout: "full",
    position: "bottom-right",
    transition: "fade",
    startSec: undefined,
    durationSec: undefined,
    removeBg: "none",
    crop: null,
    fit: undefined,
    zoom: 1,
    focusX: 50,
    focusY: 50,
  };

  for (const token of parts.slice(1)) {
    const eq = token.indexOf("=");
    if (eq === -1) {
      if (CUTIN_LAYOUTS.includes(token)) {
        spec.layout = token;
      } else {
        spec.label = token;
      }
      continue;
    }
    const key = token.slice(0, eq).trim().toLowerCase();
    const val = token.slice(eq + 1).trim();
    if (key === "label" || key === "caption") spec.label = val;
    else if (key === "layout" && CUTIN_LAYOUTS.includes(val)) spec.layout = val;
    else if ((key === "pos" || key === "position") && CUTIN_POSITIONS.includes(val)) spec.position = val;
    else if ((key === "trans" || key === "transition") && CUTIN_TRANSITIONS.includes(val)) spec.transition = val;
    else if (key === "start" || key === "startsec") spec.startSec = Number(val);
    else if (key === "dur" || key === "duration" || key === "durationsec") spec.durationSec = Number(val);
    else if ((key === "bg" || key === "removebg") && CARD_BG_REMOVE_MODES.includes(val)) spec.removeBg = val;
    else if (key === "crop") spec.crop = val;
    else if (key === "fit" && (val === "contain" || val === "cover")) spec.fit = val;
    else if (key === "zoom") spec.zoom = Number(val);
    else if (key === "focus") {
      const [fx, fy] = val.split(",").map(Number);
      if (Number.isFinite(fx)) spec.focusX = fx;
      if (Number.isFinite(fy)) spec.focusY = fy;
    }
  }
  return spec;
}

function parseArgs(argv) {
  const opts = {
    vault: null,
    cardId: null,
    photo: null,
    title: null,
    subtitle: null,
    detail: null,
    price: null,
    out: null,
    cta: null,
    handle: null,
    brand: null,
    subBrand: null,
    logo: null,
    music: null,
    bgRemove: null,
    crop: null,
    corners: null,
    cardAspect: null,
    bgPreset: CARD_SHOWCASE_DEFAULTS.bgPreset,
    bgImage: null,
    bgColor: null,
    bgDim: null,
    bgMotion: "subtle",
    cardBg: CARD_SHOWCASE_DEFAULTS.cardBgPreset,
    cardBgImage: null,
    cardBgColor: null,
    frame: null,
    cutIns: [],
    cutInsJson: null,
    includeBack: false,
    autoCloseup: false,
    autoCloseupLayout: "pip",
    autoCloseupRegion: "art",
    autoBundleCutins: false,
    item1Label: "Item 1 of 2",
    item2Label: "Item 2 of 2",
    cutInTransition: null,
    noLearn: false,
    explore: false,
    autoImprove: false,
    learningStore: null,
    learningReport: false,
    rateRunId: null,
    stars: null,
    tags: null,
    notes: null,
    views: null,
    inquiries: null,
    sold: false,
    explicit: new Set(),
    dryRun: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--no-bg-motion") { opts.bgMotion = "none"; opts.explicit.add("bgMotion"); }
    else if (arg === "--include-back") opts.includeBack = true;
    else if (arg === "--auto-closeup") { opts.autoCloseup = true; opts.explicit.add("autoCloseup"); }
    else if (arg === "--no-auto-closeup") { opts.autoCloseup = false; opts.explicit.add("autoCloseup"); }
    else if (arg === "--auto-bundle-cutins") { opts.autoBundleCutins = true; opts.explicit.add("autoBundleCutins"); }
    else if (arg === "--no-auto-bundle-cutins") { opts.autoBundleCutins = false; opts.explicit.add("autoBundleCutins"); }
    else if (arg === "--no-learn") opts.noLearn = true;
    else if (arg === "--explore") opts.explore = true;
    else if (arg === "--auto-improve") opts.autoImprove = true;
    else if (arg === "--learning-report") opts.learningReport = true;
    else if (arg === "--learning-store") opts.learningStore = argv[++i] || null;
    else if (arg === "--rate") opts.rateRunId = argv[++i] || null;
    else if (arg === "--stars") opts.stars = Number(argv[++i]);
    else if (arg === "--tags") opts.tags = (argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--notes") opts.notes = argv[++i] || "";
    else if (arg === "--views") opts.views = Number(argv[++i]);
    else if (arg === "--inquiries") opts.inquiries = Number(argv[++i]);
    else if (arg === "--sold") opts.sold = true;
    else if (arg === "--vault") opts.vault = argv[++i] || null;
    else if (arg === "--card-id") opts.cardId = argv[++i] || null;
    else if (arg === "--photo") opts.photo = argv[++i] || null;
    else if (arg === "--title") opts.title = argv[++i] || null;
    else if (arg === "--subtitle") opts.subtitle = argv[++i] || null;
    else if (arg === "--detail") opts.detail = argv[++i] || null;
    else if (arg === "--price") opts.price = argv[++i] || null;
    else if (arg === "--item1-label") opts.item1Label = argv[++i] || opts.item1Label;
    else if (arg === "--item2-label") opts.item2Label = argv[++i] || opts.item2Label;
    else if (arg === "--out") opts.out = argv[++i] || null;
    else if (arg === "--cta") opts.cta = argv[++i] || null;
    else if (arg === "--handle") opts.handle = argv[++i] || null;
    else if (arg === "--brand") opts.brand = argv[++i] || null;
    else if (arg === "--sub-brand") opts.subBrand = argv[++i] || null;
    else if (arg === "--logo") opts.logo = argv[++i] || null;
    else if (arg === "--music") opts.music = argv[++i] || null;
    else if (arg === "--bg-remove") {
      const val = argv[++i];
      if (!CARD_BG_REMOVE_MODES.includes(val)) {
        throw new Error(`Invalid --bg-remove "${val}". Expected one of: ${CARD_BG_REMOVE_MODES.join(", ")}`);
      }
      opts.bgRemove = val;
      opts.explicit.add("removeBg");
    } else if (arg === "--crop") opts.crop = argv[++i] || null;
    else if (arg === "--corners") opts.corners = argv[++i] || null;
    else if (arg === "--card-aspect") opts.cardAspect = argv[++i] || null;
    else if (arg === "--bg-preset") {
      const val = argv[++i];
      if (!Object.prototype.hasOwnProperty.call(VIDEO_BG_PRESETS, val)) {
        throw new Error(`Invalid --bg-preset "${val}". Expected one of: ${Object.keys(VIDEO_BG_PRESETS).join(", ")}`);
      }
      opts.bgPreset = val;
      opts.explicit.add("bgPreset");
    } else if (arg === "--bg-image") {
      opts.bgImage = argv[++i] || null;
      if (opts.bgImage) { opts.bgPreset = "custom"; opts.explicit.add("bgPreset"); }
    } else if (arg === "--bg-color") {
      opts.bgColor = argv[++i] || null;
      if (opts.bgColor && opts.bgPreset === CARD_SHOWCASE_DEFAULTS.bgPreset) {
        opts.bgPreset = "custom";
        opts.explicit.add("bgPreset");
      }
    } else if (arg === "--bg-dim") {
      opts.bgDim = Number(argv[++i]);
      opts.explicit.add("bgDim");
    } else if (arg === "--card-bg") {
      const val = argv[++i];
      if (!CARD_STAGE_BACKDROPS.includes(val)) {
        throw new Error(`Invalid --card-bg "${val}". Expected one of: ${CARD_STAGE_BACKDROPS.join(", ")}`);
      }
      opts.cardBg = val;
      opts.explicit.add("cardBgPreset");
    } else if (arg === "--card-bg-image") {
      opts.cardBgImage = argv[++i] || null;
      if (opts.cardBgImage) { opts.cardBg = "custom"; opts.explicit.add("cardBgPreset"); }
    } else if (arg === "--card-bg-color") {
      opts.cardBgColor = argv[++i] || null;
      if (opts.cardBgColor) { opts.cardBg = "custom"; opts.explicit.add("cardBgPreset"); }
    } else if (arg === "--frame") {
      const val = argv[++i];
      if (!CARD_FRAME_STYLES.includes(val)) {
        throw new Error(`Invalid --frame "${val}". Expected one of: ${CARD_FRAME_STYLES.join(", ")}`);
      }
      opts.frame = val;
      opts.explicit.add("frameStyle");
    } else if (arg === "--cut-in") {
      const raw = argv[++i];
      opts.cutIns.push(parseCutInSpec(raw, opts.cutIns.length));
    } else if (arg === "--cut-ins-json") {
      opts.cutInsJson = argv[++i] || null;
    } else if (arg === "--auto-closeup-layout") {
      const val = argv[++i];
      if (!CUTIN_LAYOUTS.includes(val)) {
        throw new Error(`Invalid --auto-closeup-layout "${val}"`);
      }
      opts.autoCloseupLayout = val;
      opts.explicit.add("cutInLayout");
    } else if (arg === "--auto-closeup-region") {
      opts.autoCloseupRegion = argv[++i] || "art";
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function resolveVaultPath(explicitPath) {
  if (explicitPath) {
    const resolved = path.resolve(explicitPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Card vault file not found: ${resolved}`);
    }
    return resolved;
  }

  const candidates = [
    process.env.CARD_VAULT_PATH,
    path.join(process.cwd(), "data", "card-vault.json"),
    path.join(os.homedir(), "BossListers", "card-vault.json"),
    path.join(os.homedir(), "BossListers", "card-factory.sqlite3"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) return resolved;
  }

  throw new Error(
    `No card vault found. Pass --vault <path-to-vault.json-or-sqlite3> or set CARD_VAULT_PATH. Checked: ${candidates.join(", ")}`
  );
}

function findPythonBin() {
  for (const bin of ["python3", "python"]) {
    const probe = spawnSync(bin, ["--version"], { encoding: "utf8", windowsHide: true });
    if (!probe.error && probe.status === 0) return bin;
  }
  return null;
}

function readSqliteVaultCards(dbPath) {
  const pyCode = [
    "import json, sqlite3, sys",
    "p = sys.argv[1]",
    "conn = sqlite3.connect(f'file:{p}?mode=ro', uri=True)",
    "conn.row_factory = sqlite3.Row",
    "rows = conn.execute('SELECT id, source_key, front_image_path, back_image_path, set_name, card_number, variant, grade, seller_price_cents, identification, status, on_hand, listed, created_at FROM cards ORDER BY created_at ASC, rowid ASC').fetchall()",
    "out = []",
    "for r in rows:",
    "    ident = json.loads(r['identification']) if r['identification'] else {}",
    "    fields = ident.get('fields') if isinstance(ident, dict) else {}",
    "    if not isinstance(fields, dict): fields = {}",
    "    out.append({",
    "        'id': r['id'], 'source_key': r['source_key'],",
    "        'frontImage': r['front_image_path'], 'backImage': r['back_image_path'],",
    "        'set_name': r['set_name'], 'card_number': r['card_number'],",
    "        'variant': r['variant'], 'grade': r['grade'],",
    "        'seller_price_cents': r['seller_price_cents'],",
    "        'fields': fields, 'onHand': r['on_hand'], 'listed': r['listed'],",
    "        'needsReview': r['status'] != 'identified', 'createdAt': r['created_at']",
    "    })",
    "print(json.dumps(out))",
  ].join("\n");

  const pyBin = findPythonBin();
  if (!pyBin) {
    throw new Error("Python 3 is required to read a SQLite (.sqlite/.sqlite3) card vault");
  }
  const result = spawnSync(pyBin, ["-c", pyCode, dbPath], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`Could not read SQLite card vault (${dbPath}): ${(result.stderr || "").trim()}`);
  }
  return JSON.parse(result.stdout || "[]");
}

function loadVaultCard(vaultPath, cardId) {
  const ext = path.extname(vaultPath).toLowerCase();
  if (ext === ".sqlite" || ext === ".sqlite3" || ext === ".db") {
    const cards = readSqliteVaultCards(vaultPath);
    return findCardWithPhoto(cards, cardId);
  }
  const vault = createVault(vaultPath);
  return findCardWithPhoto(vault, cardId);
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function resolveLocalAssetPath(rawPath, vaultDir) {
  const value = String(rawPath || "").trim();
  if (!value) return null;
  if (isHttpUrl(value)) return value;

  const publicCandidate = path.resolve(process.cwd(), "public", value.replace(/^\/+/, ""));
  const candidates = path.isAbsolute(value)
    ? [value, publicCandidate]
    : [
        path.resolve(vaultDir, value),
        path.resolve(process.cwd(), value),
        publicCandidate,
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`Asset file not found on disk: ${value}`);
}

async function ensureLocalImageFile(pathOrUrl, tempDir, prefix = "src") {
  if (!isHttpUrl(pathOrUrl)) return pathOrUrl;
  const resp = await fetch(pathOrUrl);
  if (!resp.ok) {
    throw new Error(`Failed to fetch remote image (${resp.status}): ${pathOrUrl}`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  const ext = ct.includes("png") ? ".png" : ct.includes("webp") ? ".webp" : ".jpg";
  const target = path.join(tempDir, `${prefix}-${crypto.randomBytes(4).toString("hex")}${ext}`);
  await fsp.writeFile(target, buf);
  return target;
}

function runCardPrep(pyBin, inputPath, outputPath, opts = {}) {
  const args = [CARD_PREP_SCRIPT, "--input", inputPath, "--output", outputPath, "--mode", opts.mode || "card"];
  if (opts.crop) args.push("--crop", opts.crop);
  if (opts.corners) args.push("--corners", opts.corners);
  if (opts.region) args.push("--region", opts.region);
  if (opts.cardAspect) args.push("--card-aspect", opts.cardAspect);
  if (opts.splitOutDir) args.push("--split-out-dir", opts.splitOutDir);
  if (opts.cornerRadius !== undefined && opts.cornerRadius !== null) {
    args.push("--corner-radius", String(opts.cornerRadius));
  }

  const res = spawnSync(pyBin, args, { encoding: "utf8", windowsHide: true, timeout: 180_000 });
  if (res.error) {
    throw new Error(`card_prep.py failed to start: ${res.error.message}`);
  }
  if (res.status !== 0) {
    throw new Error(`card_prep.py exited ${res.status}: ${(res.stderr || res.stdout || "").trim()}`);
  }
  return JSON.parse(res.stdout || "{}");
}

function runCommercialQc(pyBin, videoPath, meta = {}) {
  if (!pyBin || !fs.existsSync(COMMERCIAL_QC_SCRIPT) || !fs.existsSync(videoPath)) {
    return null;
  }
  const args = [
    COMMERCIAL_QC_SCRIPT,
    "--video", videoPath,
    "--category", meta.category || "trading-card",
    "--prep-strategy", meta.prepStrategy || "none",
    "--frame-style", meta.frameStyle || "gold-frame",
    "--cutin-count", String(meta.cutInCount || 0),
  ];
  if (meta.bgRemoved) args.push("--bg-removed");
  if (typeof meta.coveragePct === "number" && Number.isFinite(meta.coveragePct)) {
    args.push("--coverage-pct", String(meta.coveragePct));
  }
  if (typeof meta.bgDim === "number" && Number.isFinite(meta.bgDim)) {
    args.push("--bg-dim", String(meta.bgDim));
  }

  const res = spawnSync(pyBin, args, { encoding: "utf8", windowsHide: true, timeout: 60_000 });
  if (res.error || res.status !== 0) {
    return null;
  }
  try {
    return JSON.parse(res.stdout || "null");
  } catch {
    return null;
  }
}

/**
 * Serves ONLY explicitly registered local asset files over an ephemeral 127.0.0.1 HTTP port
 * so Remotion's headless Chromium can load local card photos, cutouts, backgrounds, and cut-ins
 * on both Windows and Linux without copying files into public/.
 */
async function startAssetServer() {
  const files = new Map();

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const token = url.pathname.replace(/^\/asset\//, "");
      const entry = files.get(token);
      if (!entry) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const stat = fs.statSync(entry.filePath);
      const total = stat.size;
      const baseHeaders = {
        "Content-Type": entry.contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      };

      if (req.method === "HEAD") {
        res.writeHead(200, { ...baseHeaders, "Content-Length": String(total) });
        res.end();
        return;
      }

      const range = req.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match) {
          res.writeHead(416, { "Content-Range": `bytes */${total}` });
          res.end();
          return;
        }
        const start = match[1] ? Number.parseInt(match[1], 10) : 0;
        const end = match[2] ? Math.min(total - 1, Number.parseInt(match[2], 10)) : total - 1;
        res.writeHead(206, {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Content-Length": String(end - start + 1),
        });
        fs.createReadStream(entry.filePath, { start, end }).pipe(res);
        return;
      }

      res.writeHead(200, {
        ...baseHeaders,
        "Content-Length": String(total),
      });
      fs.createReadStream(entry.filePath).pipe(res);
    } catch {
      res.writeHead(500);
      res.end("Asset error");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    register(assetPathOrUrl) {
      if (!assetPathOrUrl) return undefined;
      if (isHttpUrl(assetPathOrUrl)) return assetPathOrUrl;
      const ext = path.extname(assetPathOrUrl).toLowerCase();
      const token = `${crypto.randomUUID()}${ext}`;
      files.set(token, {
        filePath: assetPathOrUrl,
        contentType: MIME_BY_EXT[ext] || "application/octet-stream",
      });
      return `http://127.0.0.1:${port}/asset/${token}`;
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

function collectCutInInputs(opts, card, vaultDir) {
  const list = [];

  if (opts.cutInsJson) {
    const jsonPath = path.resolve(opts.cutInsJson);
    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (!item || !(item.image || item.imageUrl)) continue;
        list.push({
          id: item.id || `cutin-${list.length + 1}`,
          image: resolveLocalAssetPath(item.image || item.imageUrl, vaultDir),
          label: item.label || "",
          layout: item.layout || "full",
          position: item.position || "bottom-right",
          transition: item.transition || "fade",
          startSec: item.startSec,
          durationSec: item.durationSec,
          removeBg: item.removeBg || "none",
          crop: item.crop || null,
          fit: item.fit,
          zoom: item.zoom ?? 1,
          focusX: item.focusX ?? 50,
          focusY: item.focusY ?? 50,
        });
      }
    }
  }

  for (const item of opts.cutIns) {
    list.push({
      ...item,
      image: resolveLocalAssetPath(item.image, vaultDir),
    });
  }

  // Optional auto cut-in for vault card's back photo
  const rawBack = card.backImage || card.back_image_path;
  if (opts.includeBack && rawBack) {
    list.push({
      id: "cutin-card-back",
      image: resolveLocalAssetPath(rawBack, vaultDir),
      label: "Back of Card",
      layout: "full",
      position: "bottom-right",
      transition: "slide-left",
      startSec: undefined,
      durationSec: undefined,
      removeBg: "card",
      crop: null,
      fit: "contain",
      zoom: 1,
      focusX: 50,
      focusY: 50,
    });
  }

  return list;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  // Subcommand: inspect learned commercial playbooks & score progression
  if (opts.learningReport) {
    const report = summarizeLearningProgress(opts.learningStore || undefined);
    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(
        `BossListers Self-Improving Commercial Builder — ${report.totalRuns} commercials analyzed | Avg ${report.overallAvgScore}/100 | Trend ${report.overallTrendDelta >= 0 ? "+" : ""}${report.overallTrendDelta} pts | Sold: ${report.soldCount}`
      );
      for (const [cat, pb] of Object.entries(report.playbooks || {})) {
        console.log(
          `\n[${cat}] runs=${pb.runCount} avg=${pb.avgScore} best=${pb.bestScore} trend=${pb.trendDelta >= 0 ? "+" : ""}${pb.trendDelta}`
        );
        console.log(
          `  Winning recipe: bg=${pb.winningRecipe.bgPreset} (dim=${pb.winningRecipe.bgDim}), frame=${pb.winningRecipe.frameStyle}, stage=${pb.winningRecipe.cardBgPreset}, removeBg=${pb.winningRecipe.removeBg}, transition=${pb.winningRecipe.cutInTransition}`
        );
        for (const rule of pb.learnedRules || []) {
          console.log(`  - ${rule}`);
        }
      }
    }
    return;
  }

  // Subcommand: rate a previously rendered commercial to teach the builder
  if (opts.rateRunId) {
    const feedbackPayload = {
      runId: opts.rateRunId,
      ...(Number.isFinite(opts.stars) ? { rating: opts.stars } : {}),
      ...(Array.isArray(opts.tags) ? { tags: opts.tags } : {}),
      ...(typeof opts.notes === "string" ? { notes: opts.notes } : {}),
      ...(Number.isFinite(opts.views) ? { views: opts.views } : {}),
      ...(Number.isFinite(opts.inquiries) ? { inquiries: opts.inquiries } : {}),
      ...(opts.sold ? { sold: true } : {}),
    };
    const updated = recordCommercialFeedback(feedbackPayload, opts.learningStore || undefined);
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, ...updated }, null, 2));
    } else {
      console.log(
        `Saved feedback for ${updated.run.id} (${updated.run.title}): effectiveScore=${updated.run.effectiveScore}/100. Next ${updated.playbook.category} default: bg=${updated.playbook.winningRecipe.bgPreset} (dim=${updated.playbook.winningRecipe.bgDim}), frame=${updated.playbook.winningRecipe.frameStyle}.`
      );
    }
    return;
  }

  const isDirectItem = Boolean(opts.photo);
  let vaultPath = null;
  let vaultDir = process.cwd();
  let card = null;

  if (isDirectItem) {
    const resolvedInputPhoto = resolveLocalAssetPath(opts.photo, process.cwd());
    vaultDir = isHttpUrl(resolvedInputPhoto) ? process.cwd() : path.dirname(resolvedInputPhoto);
    card = buildGeneralItemShowcaseRecord({
      photoUrl: resolvedInputPhoto,
      title: opts.title || path.basename(resolvedInputPhoto, path.extname(resolvedInputPhoto)),
      subtitle: opts.subtitle || "",
      detailTag: opts.detail || "",
      price: opts.price,
    });
  } else {
    vaultPath = resolveVaultPath(opts.vault);
    vaultDir = path.dirname(vaultPath);
    card = loadVaultCard(vaultPath, opts.cardId);
  }

  const itemCategory = detectItemCategory({
    isDirectItem,
    autoBundleCutins: opts.autoBundleCutins,
    title: opts.title || (card.fields && (card.fields.name || card.fields.player)) || "",
    subtitle: opts.subtitle || (card.fields && card.fields.set) || "",
    detailTag: opts.detail || card.detailTag || "",
    cutIns: opts.cutIns,
  });

  // Consult local learning memory for any parameter the user did NOT explicitly pass.
  // Explicit user flags ALWAYS win.
  let learningRec = null;
  if (!opts.noLearn) {
    const explicitOverrides = {};
    if (opts.explicit.has("bgPreset")) explicitOverrides.bgPreset = opts.bgPreset;
    if (opts.explicit.has("bgDim")) explicitOverrides.bgDim = opts.bgDim;
    if (opts.explicit.has("bgMotion")) explicitOverrides.bgMotion = opts.bgMotion;
    if (opts.explicit.has("cardBgPreset")) explicitOverrides.cardBgPreset = opts.cardBg;
    if (opts.explicit.has("frameStyle")) explicitOverrides.frameStyle = opts.frame;
    if (opts.explicit.has("removeBg")) explicitOverrides.removeBg = opts.bgRemove;
    if (opts.explicit.has("cutInLayout")) explicitOverrides.cutInLayout = opts.autoCloseupLayout;
    if (opts.explicit.has("autoCloseup")) explicitOverrides.autoCloseup = opts.autoCloseup;
    if (opts.explicit.has("autoBundleCutins")) explicitOverrides.autoBundleCutins = opts.autoBundleCutins;

    learningRec = recommendCommercialRecipe({
      category: itemCategory,
      explicitOverrides,
      storePath: opts.learningStore || undefined,
      explore: opts.explore,
    });

    const hasLearnedHistory = learningRec.categoryStats.runCount > 0 || opts.explore;
    if (hasLearnedHistory) {
      if (!opts.explicit.has("bgPreset")) opts.bgPreset = learningRec.recipe.bgPreset;
      if (!opts.explicit.has("bgDim") && typeof learningRec.recipe.bgDim === "number") {
        opts.bgDim = learningRec.recipe.bgDim;
      }
      if (!opts.explicit.has("cardBgPreset")) opts.cardBg = learningRec.recipe.cardBgPreset;
      if (!opts.explicit.has("frameStyle")) opts.frame = learningRec.recipe.frameStyle;
      if (!opts.explicit.has("removeBg")) opts.bgRemove = learningRec.recipe.removeBg;
      if (!opts.explicit.has("cutInLayout")) opts.autoCloseupLayout = learningRec.recipe.cutInLayout;
      opts.cutInTransition = learningRec.recipe.cutInTransition;
      if (!opts.explicit.has("autoBundleCutins") && itemCategory === "resale-bundle" && opts.cutIns.length === 0) {
        opts.autoBundleCutins = Boolean(learningRec.recipe.autoBundleCutins);
      }
      if (!opts.explicit.has("autoCloseup") && itemCategory === "trading-card" && opts.cutIns.length === 0 && !opts.includeBack) {
        opts.autoCloseup = Boolean(learningRec.recipe.autoCloseup);
      }
    }
  }

  // Fallback category defaults when no learned history exists yet
  if (!opts.bgRemove) {
    opts.bgRemove = isDirectItem ? "cutout" : CARD_SHOWCASE_DEFAULTS.removeBg;
  }
  if (!opts.frame) {
    opts.frame = isDirectItem ? "floating" : CARD_SHOWCASE_DEFAULTS.frameStyle;
  }

  const resolvedPhoto = resolveLocalAssetPath(card.frontImage, vaultDir);
  const resolvedLogo = opts.logo ? resolveLocalAssetPath(opts.logo, vaultDir) : undefined;
  const resolvedMusic = opts.music ? resolveLocalAssetPath(opts.music, vaultDir) : undefined;

  // Resolve video background image (either custom --bg-image or built-in preset image from public/backgrounds/)
  const presetMeta = VIDEO_BG_PRESETS[opts.bgPreset] || VIDEO_BG_PRESETS["navy-gold"];
  const resolvedBgImage = opts.bgImage
    ? resolveLocalAssetPath(opts.bgImage, vaultDir)
    : presetMeta.publicPath
      ? resolveLocalAssetPath(presetMeta.publicPath, vaultDir)
      : undefined;

  const resolvedCardBgImage = opts.cardBgImage
    ? resolveLocalAssetPath(opts.cardBgImage, vaultDir)
    : undefined;

  const cutInInputs = collectCutInInputs(opts, card, vaultDir);

  const previewCutIns = [
    ...cutInInputs.map((item) => ({
      id: item.id,
      imageUrl: item.image,
      label: item.label,
      layout: item.layout,
      position: item.position,
      transition: item.transition,
      startSec: item.startSec,
      durationSec: item.durationSec,
      removeBg: item.removeBg,
      backgroundRemoved: item.removeBg !== "none",
      fit: item.fit,
      zoom: item.zoom,
      focusX: item.focusX,
      focusY: item.focusY,
    })),
    ...(opts.autoBundleCutins
      ? [
          {
            id: "cutin-bundle-item-1",
            imageUrl: resolvedPhoto,
            label: opts.item1Label,
            layout: "full",
            position: "bottom-right",
            transition: "slide-left",
            startSec: 4.1,
            durationSec: 2.25,
            removeBg: "cutout",
            backgroundRemoved: true,
            fit: "contain",
            zoom: 1.02,
            focusX: 50,
            focusY: 50,
          },
          {
            id: "cutin-bundle-item-2",
            imageUrl: resolvedPhoto,
            label: opts.item2Label,
            layout: "full",
            position: "bottom-right",
            transition: "slide-left",
            startSec: 6.1,
            durationSec: 2.25,
            removeBg: "cutout",
            backgroundRemoved: true,
            fit: "contain",
            zoom: 1.02,
            focusX: 50,
            focusY: 50,
          },
        ]
      : []),
    ...(opts.autoCloseup
      ? [
          {
            id: "cutin-auto-closeup",
            imageUrl: resolvedPhoto,
            label: "Art Detail",
            layout: opts.autoCloseupLayout,
            position: "bottom-right",
            transition: opts.autoCloseupLayout === "pip" ? "zoom" : "fade",
            startSec: 5.2,
            durationSec: 2.5,
            removeBg: "none",
            backgroundRemoved: false,
            fit: "cover",
            zoom: 1.04,
            focusX: 50,
            focusY: 42,
          },
        ]
      : []),
  ];

  const previewProject = buildCardShowcaseProject(card, {
    photoUrlOverride: resolvedPhoto,
    brandName: opts.brand || undefined,
    subBrand: opts.subBrand || undefined,
    ctaLine: opts.cta || undefined,
    handle: opts.handle || undefined,
    logoUrl: resolvedLogo,
    musicUrl: resolvedMusic,
    background: {
      preset: opts.bgPreset,
      imageUrl: resolvedBgImage,
      color: opts.bgColor || undefined,
      dim: opts.bgDim !== null && Number.isFinite(opts.bgDim) ? opts.bgDim : undefined,
      motion: opts.bgMotion,
    },
    cardStage: {
      removeBg: opts.bgRemove,
      backgroundRemoved: opts.bgRemove !== "none",
      originalPhotoUrl: resolvedPhoto,
      backdropPreset: opts.cardBg,
      backdropImageUrl: resolvedCardBgImage,
      backdropColor: opts.cardBgColor || undefined,
      frameStyle: opts.frame,
    },
    cutIns: previewCutIns,
  });

  const slug = formatCardShowcaseSlug(
    previewProject.cardShowcase,
    isDirectItem ? "item-showcase" : "card-showcase"
  );
  const outPath = path.resolve(
    opts.out || path.join(COMMERCIALS_DIR, `${slug}_reel_9_16.mp4`)
  );

  if (opts.dryRun) {
    const summary = {
      ok: true,
      dryRun: true,
      vaultPath,
      category: itemCategory,
      card: {
        id: previewProject.cardShowcase.cardId,
        name: previewProject.cardShowcase.cardName,
        set: previewProject.cardShowcase.setName,
        year: previewProject.cardShowcase.year,
        cardNumber: previewProject.cardShowcase.cardNumber,
        photo: card.frontImage,
        suggestedPrice: previewProject.cardShowcase.suggestedPrice,
      },
      background: previewProject.cardShowcase.background,
      cardStage: previewProject.cardShowcase.cardStage,
      cutIns: previewProject.cardShowcase.cutIns,
      learning: learningRec
        ? {
            category: itemCategory,
            appliedFromLearning: learningRec.appliedFromLearning,
            explorationApplied: learningRec.explorationApplied,
            rationale: learningRec.rationale,
            categoryStats: learningRec.categoryStats,
          }
        : null,
      video: {
        compositionId: "CardShowcase",
        width: CARD_SHOWCASE_DEFAULTS.width,
        height: CARD_SHOWCASE_DEFAULTS.height,
        fps: CARD_SHOWCASE_DEFAULTS.fps,
        durationSeconds: CARD_SHOWCASE_DEFAULTS.durationSeconds,
        hasVoiceover: false,
        hasMusic: Boolean(resolvedMusic),
        outputPath: outPath,
      },
      posted: false,
      listed: false,
    };
    if (opts.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log("[card-showcase] Dry run resolved:", JSON.stringify(summary, null, 2));
    }
    return;
  }

  const assetServer = await startAssetServer();
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "bl-card-showcase-"));
  const tempOut = path.join(tempDir, "draft.mp4");

  try {
    const pyBin = findPythonBin();
    const localMainPhoto = await ensureLocalImageFile(resolvedPhoto, tempDir, "card");

    // 1. Prepare hero photo (remove background & straighten / neural cutout; optionally split 2-item bundle)
    let preparedHeroPath = localMainPhoto;
    let heroBgRemoved = false;
    let prepInfo = null;
    const bundleSplitDir = opts.autoBundleCutins ? path.join(tempDir, "bundle-split") : null;

    if (opts.bgRemove !== "none" || opts.crop || opts.corners || opts.autoBundleCutins) {
      if (!pyBin) {
        throw new Error("Python 3 is required for local background removal / cutout (or pass --bg-remove none)");
      }
      const cutoutOut = path.join(tempDir, "hero-cutout.png");
      const prepMode = opts.bgRemove === "none" ? (opts.autoBundleCutins ? "cutout" : "crop") : opts.bgRemove;
      if (!opts.json) {
        console.error(`[card-showcase] Removing background & prepping photo (mode=${prepMode})...`);
      }
      prepInfo = runCardPrep(pyBin, localMainPhoto, cutoutOut, {
        mode: prepMode,
        crop: opts.crop,
        corners: opts.corners,
        cardAspect: opts.cardAspect,
        splitOutDir: bundleSplitDir,
      });
      preparedHeroPath = cutoutOut;
      heroBgRemoved = Boolean(prepInfo.background_removed);
      if (!opts.json) {
        console.error(
          `[card-showcase] Photo prep complete: ${prepInfo.width}x${prepInfo.height} via ${prepInfo.strategy} (bgRemoved=${heroBgRemoved})`
        );
      }
    }

    // 2. Prepare cut-in pictures (optional bg removal, crop, auto bundle split, and auto-closeup extraction)
    const preparedCutIns = [];
    for (let idx = 0; idx < cutInInputs.length; idx += 1) {
      const item = cutInInputs[idx];
      const localCutPath = await ensureLocalImageFile(item.image, tempDir, `cutin-${idx}`);
      let finalCutPath = localCutPath;
      let cutBgRemoved = false;

      if ((item.removeBg && item.removeBg !== "none") || item.crop) {
        if (!pyBin) {
          throw new Error("Python 3 is required to process cut-in background removal/crop");
        }
        const cutOut = path.join(tempDir, `cutin-${idx}-prep.png`);
        const cutInfo = runCardPrep(pyBin, localCutPath, cutOut, {
          mode: item.removeBg && item.removeBg !== "none" ? item.removeBg : "crop",
          crop: item.crop,
        });
        finalCutPath = cutOut;
        cutBgRemoved = Boolean(cutInfo.background_removed);
      }

      preparedCutIns.push({
        id: item.id,
        imageUrl: assetServer.register(finalCutPath),
        label: item.label,
        layout: item.layout,
        position: item.position,
        transition: item.transition,
        startSec: item.startSec,
        durationSec: item.durationSec,
        removeBg: item.removeBg,
        backgroundRemoved: cutBgRemoved,
        fit: item.fit || (cutBgRemoved ? "contain" : "cover"),
        zoom: item.zoom,
        focusX: item.focusX,
        focusY: item.focusY,
      });
    }

    // Optional automatic 2-item bundle split cut-ins (each individual item spotlighted cleanly)
    if (opts.autoBundleCutins && prepInfo && Array.isArray(prepInfo.split_items) && prepInfo.split_items.length >= 2) {
      const item1Path = prepInfo.split_items[0].path;
      const item2Path = prepInfo.split_items[1].path;
      if (!opts.json) {
        console.error(
          `[card-showcase] Auto-split 2-item bundle into individual cutouts (split_x=${prepInfo.split_x})`
        );
      }
      preparedCutIns.push(
        {
          id: "cutin-bundle-item-1",
          imageUrl: assetServer.register(item1Path),
          label: opts.item1Label,
          layout: "full",
          position: "bottom-right",
          transition: opts.cutInTransition || "slide-left",
          startSec: 4.1,
          durationSec: 2.25,
          removeBg: "cutout",
          backgroundRemoved: true,
          fit: "contain",
          zoom: 1.02,
          focusX: 50,
          focusY: 50,
        },
        {
          id: "cutin-bundle-item-2",
          imageUrl: assetServer.register(item2Path),
          label: opts.item2Label,
          layout: "full",
          position: "bottom-right",
          transition: opts.cutInTransition || "slide-left",
          startSec: 6.1,
          durationSec: 2.25,
          removeBg: "cutout",
          backgroundRemoved: true,
          fit: "contain",
          zoom: 1.02,
          focusX: 50,
          focusY: 50,
        }
      );
    }

    // Optional automatic artwork macro close-up cut-in
    if (opts.autoCloseup) {
      if (!pyBin) {
        throw new Error("Python 3 is required for --auto-closeup");
      }
      const closeupOut = path.join(tempDir, "auto-closeup.png");
      if (!opts.json) {
        console.error(`[card-showcase] Extracting macro ${opts.autoCloseupRegion} close-up cut-in...`);
      }
      runCardPrep(pyBin, localMainPhoto, closeupOut, {
        mode: "closeup",
        region: opts.autoCloseupRegion,
      });
      preparedCutIns.push({
        id: "cutin-auto-closeup",
        imageUrl: assetServer.register(closeupOut),
        label: opts.autoCloseupRegion === "art" ? "Art Detail" : `${opts.autoCloseupRegion} detail`,
        layout: opts.autoCloseupLayout,
        position: "bottom-right",
        transition: opts.autoCloseupLayout === "pip" ? "zoom" : "fade",
        startSec: preparedCutIns.length === 0 ? 5.15 : undefined,
        durationSec: 2.55,
        removeBg: "none",
        backgroundRemoved: false,
        fit: "cover",
        zoom: 1.04,
        focusX: 50,
        focusY: 50,
      });
    }

    const renderProject = buildCardShowcaseProject(card, {
      photoUrlOverride: assetServer.register(preparedHeroPath),
      brandName: opts.brand || undefined,
      subBrand: opts.subBrand || undefined,
      ctaLine: opts.cta || undefined,
      handle: opts.handle || undefined,
      logoUrl: assetServer.register(resolvedLogo),
      musicUrl: assetServer.register(resolvedMusic),
      background: {
        preset: opts.bgPreset,
        imageUrl: assetServer.register(resolvedBgImage),
        color: opts.bgColor || undefined,
        dim: opts.bgDim !== null && Number.isFinite(opts.bgDim) ? opts.bgDim : undefined,
        motion: opts.bgMotion,
      },
      cardStage: {
        removeBg: opts.bgRemove,
        backgroundRemoved: heroBgRemoved,
        backdropPreset: opts.cardBg,
        backdropImageUrl: assetServer.register(resolvedCardBgImage),
        backdropColor: opts.cardBgColor || undefined,
        frameStyle: opts.frame,
      },
      cutIns: preparedCutIns,
    });

    if (!opts.json) {
      console.error(
        `[card-showcase] Card: ${renderProject.cardShowcase.cardName} (${renderProject.cardShowcase.setName || "—"} ${renderProject.cardShowcase.year || ""} #${renderProject.cardShowcase.cardNumber || "—"})`
      );
      console.error(
        `[card-showcase] Background: ${renderProject.cardShowcase.background?.preset} | Card stage: ${renderProject.cardShowcase.cardStage?.backdropPreset} (${renderProject.cardShowcase.cardStage?.frameStyle}) | Cut-ins: ${renderProject.cardShowcase.cutIns.length}`
      );
      console.error(
        `[card-showcase] Price in vault: ${renderProject.cardShowcase.suggestedPrice !== null ? `$${renderProject.cardShowcase.suggestedPrice.toFixed(2)}` : "none (hidden)"}`
      );
      console.error("[card-showcase] Bundling Remotion video-studio...");
    }

    const entryPoint = path.join(process.cwd(), "video", "index.ts");
    const serveUrl = await bundle({
      entryPoint,
      publicDir: path.join(process.cwd(), "public"),
      onProgress: () => {},
    });

    const composition = await selectComposition({
      serveUrl,
      id: "CardShowcase",
      inputProps: { project: renderProject },
    });

    if (!opts.json) {
      console.error(
        `[card-showcase] Rendering ${composition.width}x${composition.height} @ ${composition.fps}fps (${composition.durationInFrames} frames = ${(composition.durationInFrames / composition.fps).toFixed(1)}s)...`
      );
    }

    let lastBucket = -1;
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      pixelFormat: "yuv420p",
      muted: !resolvedMusic,
      outputLocation: tempOut,
      inputProps: { project: renderProject },
      onProgress: ({ progress }) => {
        if (opts.json) return;
        const bucket = Math.floor(progress * 10);
        if (bucket > lastBucket) {
          lastBucket = bucket;
          console.error(`[card-showcase] Render progress: ${Math.round(progress * 100)}%`);
        }
      },
    });

    await fsp.mkdir(path.dirname(outPath), { recursive: true });
    await fsp.copyFile(tempOut, outPath);

    // 3. Automated post-render Visual & Technical QC audit (100% local)
    let activeProject = renderProject;
    let activeBgDim = opts.bgDim;
    let activeFrameStyle = opts.frame;
    let qcReport = runCommercialQc(pyBin, outPath, {
      category: itemCategory,
      prepStrategy: prepInfo ? prepInfo.strategy : "none",
      bgRemoved: heroBgRemoved,
      coveragePct: prepInfo ? prepInfo.coverage_pct : undefined,
      bgDim: activeBgDim,
      frameStyle: activeFrameStyle,
      cutInCount: activeProject.cardShowcase.cutIns.length,
    });

    let autoImproved = false;
    let firstPassRunId = null;

    // Optional --auto-improve: if QC finds a concrete fixable adjustment and score < 88,
    // apply the adjustment, re-render once, and keep whichever pass scores higher!
    if (opts.autoImprove && qcReport && qcReport.overallScore < 88 && qcReport.adjustments) {
      const adj = qcReport.adjustments;
      const hasFix =
        (typeof adj.bgDimDelta === "number" && Math.abs(adj.bgDimDelta) >= 0.03) ||
        (adj.recommendFrameStyle && adj.recommendFrameStyle !== activeFrameStyle);

      if (hasFix) {
        if (!opts.noLearn) {
          const firstLogged = recordCommercialRun(
            {
              category: itemCategory,
              title: activeProject.cardShowcase.cardName,
              fileName: path.basename(outPath),
              outputPath: outPath,
              prepStrategy: prepInfo ? prepInfo.strategy : "none",
              cutInCount: activeProject.cardShowcase.cutIns.length,
              recipe: {
                bgPreset: opts.bgPreset,
                bgDim: typeof activeBgDim === "number" ? activeBgDim : 0.22,
                bgMotion: opts.bgMotion,
                cardBgPreset: opts.cardBg,
                frameStyle: activeFrameStyle,
                removeBg: opts.bgRemove,
                cutInTransition: opts.cutInTransition || "slide-left",
                cutInLayout: opts.autoCloseupLayout,
                autoCloseup: opts.autoCloseup,
                autoBundleCutins: opts.autoBundleCutins,
              },
              qc: qcReport,
            },
            opts.learningStore || undefined
          );
          firstPassRunId = firstLogged.run.id;
        }

        const nextBgDim =
          typeof adj.bgDimDelta === "number"
            ? Math.max(0.08, Math.min(0.72, Number(((activeBgDim ?? 0.22) + adj.bgDimDelta).toFixed(2))))
            : activeBgDim;
        const nextFrame = adj.recommendFrameStyle || activeFrameStyle;

        if (!opts.json) {
          console.error(
            `[card-showcase] Auto-improve triggered (pass 1 QC ${qcReport.overallScore}/100): tuning bgDim=${nextBgDim}, frame=${nextFrame}...`
          );
        }

        const tunedProject = buildCardShowcaseProject(card, {
          photoUrlOverride: activeProject.cardShowcase.photoUrl,
          brandName: opts.brand || undefined,
          subBrand: opts.subBrand || undefined,
          ctaLine: opts.cta || undefined,
          handle: opts.handle || undefined,
          logoUrl: activeProject.cardShowcase.logoUrl,
          musicUrl: activeProject.audio?.musicUrl,
          background: {
            preset: opts.bgPreset,
            imageUrl: activeProject.cardShowcase.background?.imageUrl,
            color: opts.bgColor || undefined,
            dim: nextBgDim,
            motion: opts.bgMotion,
          },
          cardStage: {
            removeBg: opts.bgRemove,
            backgroundRemoved: heroBgRemoved,
            backdropPreset: opts.cardBg,
            backdropImageUrl: activeProject.cardShowcase.cardStage?.backdropImageUrl,
            backdropColor: opts.cardBgColor || undefined,
            frameStyle: nextFrame,
          },
          cutIns: preparedCutIns,
        });

        const tempImproved = path.join(tempDir, "draft-improved.mp4");
        const tunedComp = await selectComposition({
          serveUrl,
          id: "CardShowcase",
          inputProps: { project: tunedProject },
        });
        await renderMedia({
          composition: tunedComp,
          serveUrl,
          codec: "h264",
          pixelFormat: "yuv420p",
          muted: !resolvedMusic,
          outputLocation: tempImproved,
          inputProps: { project: tunedProject },
        });

        const qcPass2 = runCommercialQc(pyBin, tempImproved, {
          category: itemCategory,
          prepStrategy: prepInfo ? prepInfo.strategy : "none",
          bgRemoved: heroBgRemoved,
          coveragePct: prepInfo ? prepInfo.coverage_pct : undefined,
          bgDim: nextBgDim,
          frameStyle: nextFrame,
          cutInCount: tunedProject.cardShowcase.cutIns.length,
        });

        if (qcPass2 && qcPass2.overallScore >= qcReport.overallScore) {
          await fsp.copyFile(tempImproved, outPath);
          activeProject = tunedProject;
          activeBgDim = nextBgDim;
          activeFrameStyle = nextFrame;
          qcReport = qcPass2;
          autoImproved = true;
          if (!opts.json) {
            console.error(
              `[card-showcase] Auto-improve succeeded: QC improved to ${qcReport.overallScore}/100!`
            );
          }
        }
      }
    }

    const stat = await fsp.stat(outPath);

    // 4. Record run + QC audit into persistent learning memory so the next commercial starts even better
    let learningOutcome = null;
    if (!opts.noLearn) {
      learningOutcome = recordCommercialRun(
        {
          category: itemCategory,
          title: activeProject.cardShowcase.cardName,
          fileName: path.basename(outPath),
          outputPath: outPath,
          prepStrategy: prepInfo ? prepInfo.strategy : "none",
          cutInCount: activeProject.cardShowcase.cutIns.length,
          recipe: {
            bgPreset: opts.bgPreset,
            bgDim: typeof activeBgDim === "number" ? activeBgDim : 0.22,
            bgMotion: opts.bgMotion,
            cardBgPreset: opts.cardBg,
            frameStyle: activeFrameStyle,
            removeBg: opts.bgRemove,
            cutInTransition: opts.cutInTransition || "slide-left",
            cutInLayout: opts.autoCloseupLayout,
            autoCloseup: opts.autoCloseup,
            autoBundleCutins: opts.autoBundleCutins,
          },
          qc: qcReport,
          improvedFromRunId: autoImproved ? firstPassRunId : undefined,
        },
        opts.learningStore || undefined
      );
    }

    const summary = {
      ok: true,
      vaultPath,
      category: itemCategory,
      card: {
        id: activeProject.cardShowcase.cardId,
        name: activeProject.cardShowcase.cardName,
        set: activeProject.cardShowcase.setName,
        year: activeProject.cardShowcase.year,
        cardNumber: activeProject.cardShowcase.cardNumber,
        photo: card.frontImage,
        suggestedPrice: activeProject.cardShowcase.suggestedPrice,
      },
      prep: {
        removeBgMode: opts.bgRemove,
        backgroundRemoved: heroBgRemoved,
        strategy: prepInfo ? prepInfo.strategy : "none",
        bgPreset: opts.bgPreset,
        bgDim: activeBgDim,
        cardBgPreset: opts.cardBg,
        frameStyle: activeFrameStyle,
        cutInCount: activeProject.cardShowcase.cutIns.length,
      },
      qc: qcReport,
      learning: learningOutcome
        ? {
            runId: learningOutcome.run.id,
            effectiveScore: learningOutcome.run.effectiveScore,
            deltaFromPrevAvg: learningOutcome.deltaFromPrevAvg,
            isNewBest: learningOutcome.isNewBest,
            autoImproved,
            categoryRunCount: learningOutcome.playbook.runCount,
            categoryAvgScore: learningOutcome.playbook.avgScore,
            categoryTrendDelta: learningOutcome.playbook.trendDelta,
            appliedFromLearning: learningRec ? learningRec.appliedFromLearning : [],
            explorationApplied: learningRec ? learningRec.explorationApplied : null,
            nextWinningRecipe: learningOutcome.playbook.winningRecipe,
          }
        : null,
      video: {
        compositionId: composition.id,
        width: composition.width,
        height: composition.height,
        fps: composition.fps,
        durationSeconds: Number((composition.durationInFrames / composition.fps).toFixed(2)),
        hasVoiceover: false,
        hasMusic: Boolean(resolvedMusic),
        outputPath: outPath,
        fileName: path.basename(outPath),
        bytes: stat.size,
      },
      posted: false,
      listed: false,
    };

    if (opts.json) {
      console.log(JSON.stringify(summary));
    } else {
      console.log(
        `Rendered Card Showcase: ${outPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB, ${summary.video.width}x${summary.video.height}, ${summary.video.durationSeconds}s)`
      );
      if (qcReport) {
        const deltaStr = learningOutcome && learningOutcome.playbook.runCount > 1
          ? ` (${learningOutcome.deltaFromPrevAvg >= 0 ? "+" : ""}${learningOutcome.deltaFromPrevAvg} vs ${itemCategory} avg)`
          : "";
        const bestTag = learningOutcome && learningOutcome.isNewBest ? " · NEW BEST!" : "";
        console.log(
          `[learning] QC Score: ${qcReport.overallScore}/100${deltaStr}${bestTag} | Run ID: ${learningOutcome ? learningOutcome.run.id : "untracked"}`
        );
      }
    }
  } finally {
    await assetServer.close().catch(() => {});
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error(`[card-showcase] Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
