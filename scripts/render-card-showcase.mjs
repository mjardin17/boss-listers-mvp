#!/usr/bin/env node
// scripts/render-card-showcase.mjs
// Commercial Maker v6 — Card Showcase mode (Remotion volume lane).
// Reads ONE card from the local card vault (photo + stored facts: name, set, year, card number,
// and an optional already-stored price — never invented) and renders a ~12s 1080x1920 9:16 vertical
// showcase reel using BossListers' Remotion video-studio composition.
//
// Render-only: never auto-lists, never auto-posts, never modifies the card vault,
// no paid AI video, no voiceover.
//
// Usage:
//   node scripts/render-card-showcase.mjs --vault data/card-vault.json
//   node scripts/render-card-showcase.mjs --vault data/card-vault.json --card-id <id>
//   node scripts/render-card-showcase.mjs --vault data/card-vault.json --out public/commercials/my-card_reel_9_16.mp4

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
  CARD_SHOWCASE_DEFAULTS,
  buildCardShowcaseProject,
  formatCardShowcaseSlug,
} = require("../lib/cardCommercial.js");
const { COMMERCIALS_DIR } = require("../lib/commercialFiles.js");

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

Options:
  --vault <path>       Path to card vault (.json from lib/cardVault.js or .sqlite/.sqlite3)
                       Defaults to CARD_VAULT_PATH, ./data/card-vault.json,
                       ~/BossListers/card-vault.json, or ~/BossListers/card-factory.sqlite3
  --card-id <id>       Vault card ID (or source_key). Defaults to the first card with a photo.
  --out <path>         Output MP4 file path (default: public/commercials/<slug>_reel_9_16.mp4)
  --cta <text>         Gold pill CTA line (default: "${CARD_SHOWCASE_DEFAULTS.ctaLine}")
  --handle <text>      Bottom social handle (default: "${CARD_SHOWCASE_DEFAULTS.handle}")
  --brand <text>       Brand name (default: "${CARD_SHOWCASE_DEFAULTS.brandName}")
  --sub-brand <text>   Sub-brand label (default: "${CARD_SHOWCASE_DEFAULTS.subBrand}")
  --logo <path|url>    Optional circular logo image (default: built-in gold JO crest)
  --music <path|url>   Optional free/unlicensed audio bed (default: silent; no voiceover)
  --dry-run            Resolve vault card and print showcase spec without rendering
  --json               Print structured JSON summary to stdout
  --help, -h           Show this help
`);
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
    dryRun: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--vault") {
      opts.vault = argv[++i] || null;
    } else if (arg === "--card-id") {
      opts.cardId = argv[++i] || null;
    } else if (arg === "--out") {
      opts.out = argv[++i] || null;
    } else if (arg === "--cta") {
      opts.cta = argv[++i] || null;
    } else if (arg === "--handle") {
      opts.handle = argv[++i] || null;
    } else if (arg === "--brand") {
      opts.brand = argv[++i] || null;
    } else if (arg === "--sub-brand") {
      opts.subBrand = argv[++i] || null;
    } else if (arg === "--logo") {
      opts.logo = argv[++i] || null;
    } else if (arg === "--music") {
      opts.music = argv[++i] || null;
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

  for (const bin of ["python3", "python"]) {
    const result = spawnSync(bin, ["-c", pyCode, dbPath], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.error && result.error.code === "ENOENT") continue;
    if (result.status !== 0) {
      throw new Error(`Could not read SQLite card vault (${dbPath}): ${(result.stderr || "").trim()}`);
    }
    return JSON.parse(result.stdout || "[]");
  }
  throw new Error("Python 3 is required to read a SQLite (.sqlite/.sqlite3) card vault");
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

  const candidates = path.isAbsolute(value)
    ? [value]
    : [
        path.resolve(vaultDir, value),
        path.resolve(process.cwd(), value),
        path.resolve(process.cwd(), "public", value.replace(/^\/+/, "")),
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`Asset file not found on disk: ${value}`);
}

/**
 * Serves ONLY explicitly registered local asset files over an ephemeral 127.0.0.1 HTTP port
 * so Remotion's headless Chromium can load local card photos and optional local audio/logos
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

  const previewProject = buildCardShowcaseProject(card, {
    photoUrlOverride: resolvedPhoto,
    brandName: opts.brand || undefined,
    subBrand: opts.subBrand || undefined,
    ctaLine: opts.cta || undefined,
    handle: opts.handle || undefined,
    logoUrl: resolvedLogo,
    musicUrl: resolvedMusic,
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
    const renderProject = buildCardShowcaseProject(card, {
      photoUrlOverride: assetServer.register(resolvedPhoto),
      brandName: opts.brand || undefined,
      subBrand: opts.subBrand || undefined,
      ctaLine: opts.cta || undefined,
      handle: opts.handle || undefined,
      logoUrl: assetServer.register(resolvedLogo),
      musicUrl: assetServer.register(resolvedMusic),
    });

    if (!opts.json) {
      console.error(
        `[card-showcase] Card: ${renderProject.cardShowcase.cardName} (${renderProject.cardShowcase.setName || "—"} ${renderProject.cardShowcase.year || ""} #${renderProject.cardShowcase.cardNumber || "—"})`
      );
      console.error(
        `[card-showcase] Price in vault: ${renderProject.cardShowcase.suggestedPrice !== null ? `$${renderProject.cardShowcase.suggestedPrice.toFixed(2)}` : "none (hidden)"}`
      );
      console.error("[card-showcase] Bundling Remotion video-studio...");
    }

    const entryPoint = path.join(process.cwd(), "video", "index.ts");
    const serveUrl = await bundle({
      entryPoint,
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
