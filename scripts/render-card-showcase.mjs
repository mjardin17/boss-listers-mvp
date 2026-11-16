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
  formatCardShowcaseSlug,
} = require("../lib/cardCommercial.js");
const { COMMERCIALS_DIR } = require("../lib/commercialFiles.js");

const CARD_PREP_SCRIPT = path.join(process.cwd(), "scripts", "card_prep.py");

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

Vault & Output:
  --vault <path>              Path to card vault (.json or .sqlite/.sqlite3)
  --card-id <id>              Vault card ID (defaults to first card with a photo)
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
    out: null,
    cta: null,
    handle: null,
    brand: null,
    subBrand: null,
    logo: null,
    music: null,
    bgRemove: CARD_SHOWCASE_DEFAULTS.removeBg,
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
    frame: CARD_SHOWCASE_DEFAULTS.frameStyle,
    cutIns: [],
    cutInsJson: null,
    includeBack: false,
    autoCloseup: false,
    autoCloseupLayout: "pip",
    autoCloseupRegion: "art",
    dryRun: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--no-bg-motion") opts.bgMotion = "none";
    else if (arg === "--include-back") opts.includeBack = true;
    else if (arg === "--auto-closeup") opts.autoCloseup = true;
    else if (arg === "--vault") opts.vault = argv[++i] || null;
    else if (arg === "--card-id") opts.cardId = argv[++i] || null;
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
    } else if (arg === "--crop") opts.crop = argv[++i] || null;
    else if (arg === "--corners") opts.corners = argv[++i] || null;
    else if (arg === "--card-aspect") opts.cardAspect = argv[++i] || null;
    else if (arg === "--bg-preset") {
      const val = argv[++i];
      if (!Object.prototype.hasOwnProperty.call(VIDEO_BG_PRESETS, val)) {
        throw new Error(`Invalid --bg-preset "${val}". Expected one of: ${Object.keys(VIDEO_BG_PRESETS).join(", ")}`);
      }
      opts.bgPreset = val;
    } else if (arg === "--bg-image") {
      opts.bgImage = argv[++i] || null;
      if (opts.bgImage) opts.bgPreset = "custom";
    } else if (arg === "--bg-color") {
      opts.bgColor = argv[++i] || null;
      if (opts.bgColor && opts.bgPreset === CARD_SHOWCASE_DEFAULTS.bgPreset) {
        opts.bgPreset = "custom";
      }
    } else if (arg === "--bg-dim") {
      opts.bgDim = Number(argv[++i]);
    } else if (arg === "--card-bg") {
      const val = argv[++i];
      if (!CARD_STAGE_BACKDROPS.includes(val)) {
        throw new Error(`Invalid --card-bg "${val}". Expected one of: ${CARD_STAGE_BACKDROPS.join(", ")}`);
      }
      opts.cardBg = val;
    } else if (arg === "--card-bg-image") {
      opts.cardBgImage = argv[++i] || null;
      if (opts.cardBgImage) opts.cardBg = "custom";
    } else if (arg === "--card-bg-color") {
      opts.cardBgColor = argv[++i] || null;
      if (opts.cardBgColor) opts.cardBg = "custom";
    } else if (arg === "--frame") {
      const val = argv[++i];
      if (!CARD_FRAME_STYLES.includes(val)) {
        throw new Error(`Invalid --frame "${val}". Expected one of: ${CARD_FRAME_STYLES.join(", ")}`);
      }
      opts.frame = val;
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
  if (opts.cornerRadius !== undefined && opts.cornerRadius !== null) {
    args.push("--corner-radius", String(opts.cornerRadius));
  }

  const res = spawnSync(pyBin, args, { encoding: "utf8", windowsHide: true, timeout: 120_000 });
  if (res.error) {
    throw new Error(`card_prep.py failed to start: ${res.error.message}`);
  }
  if (res.status !== 0) {
    throw new Error(`card_prep.py exited ${res.status}: ${(res.stderr || res.stdout || "").trim()}`);
  }
  return JSON.parse(res.stdout || "{}");
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

  const vaultPath = resolveVaultPath(opts.vault);
  const vaultDir = path.dirname(vaultPath);
  const card = loadVaultCard(vaultPath, opts.cardId);

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

  const slug = formatCardShowcaseSlug(previewProject.cardShowcase);
  const outPath = path.resolve(
    opts.out || path.join(COMMERCIALS_DIR, `${slug}_reel_9_16.mp4`)
  );

  if (opts.dryRun) {
    const summary = {
      ok: true,
      dryRun: true,
      vaultPath,
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

    // 1. Prepare hero card photo (remove background & straighten by default!)
    let preparedHeroPath = localMainPhoto;
    let heroBgRemoved = false;
    let prepInfo = null;

    if (opts.bgRemove !== "none" || opts.crop || opts.corners) {
      if (!pyBin) {
        throw new Error("Python 3 is required for local background removal / card cutout (or pass --bg-remove none)");
      }
      const cutoutOut = path.join(tempDir, "hero-cutout.png");
      if (!opts.json) {
        console.error(`[card-showcase] Removing background & prepping card (mode=${opts.bgRemove})...`);
      }
      prepInfo = runCardPrep(pyBin, localMainPhoto, cutoutOut, {
        mode: opts.bgRemove === "none" ? "crop" : opts.bgRemove,
        crop: opts.crop,
        corners: opts.corners,
        cardAspect: opts.cardAspect,
      });
      preparedHeroPath = cutoutOut;
      heroBgRemoved = Boolean(prepInfo.background_removed);
      if (!opts.json) {
        console.error(
          `[card-showcase] Card prep complete: ${prepInfo.width}x${prepInfo.height} via ${prepInfo.strategy} (bgRemoved=${heroBgRemoved})`
        );
      }
    }

    // 2. Prepare cut-in pictures (optional bg removal, crop, and auto-closeup extraction)
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
    const stat = await fsp.stat(outPath);

    const summary = {
      ok: true,
      vaultPath,
      card: {
        id: renderProject.cardShowcase.cardId,
        name: renderProject.cardShowcase.cardName,
        set: renderProject.cardShowcase.setName,
        year: renderProject.cardShowcase.year,
        cardNumber: renderProject.cardShowcase.cardNumber,
        photo: card.frontImage,
        suggestedPrice: renderProject.cardShowcase.suggestedPrice,
      },
      prep: {
        removeBgMode: opts.bgRemove,
        backgroundRemoved: heroBgRemoved,
        strategy: prepInfo ? prepInfo.strategy : "none",
        bgPreset: opts.bgPreset,
        cardBgPreset: opts.cardBg,
        frameStyle: opts.frame,
        cutInCount: renderProject.cardShowcase.cutIns.length,
      },
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
