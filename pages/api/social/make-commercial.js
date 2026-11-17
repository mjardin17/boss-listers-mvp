// pages/api/social/make-commercial.js
// Owner session only.
//   GET  → the items a commercial can be made for (live eBay items).
//   POST → make one commercial for { sku } as a local file in public/commercials.
// It posts nothing and uploads nothing. Posting is a separate step in post-video.js.

const { loadEnvConfig } = require("@next/env");
const { requireOwnerSession } = require("../../../lib/requireSession");
const { listInventory, getProductForCommercial } = require("../../../lib/supabaseInventory");
const { makeCommercial, makeCardShowcaseCommercial } = require("../../../lib/commercialMaker");
const {
  VIDEO_BG_PRESETS,
  CARD_STAGE_BACKDROPS,
  CARD_FRAME_STYLES,
  CARD_BG_REMOVE_MODES,
  CUTIN_LAYOUTS,
} = require("../../../lib/cardCommercial");
const { resolveConfined, publicRoots } = require("../../../lib/safePaths");

const SKU_RULE = /^[A-Za-z0-9._-]{1,80}$/;
const CARD_ID_RULE = /^[A-Za-z0-9._:-]{1,120}$/;
const HEX_COLOR_RULE = /^#[0-9a-fA-F]{3,6}$/;
const SHORT_TEXT_LIMIT = 80;
const ASSET_ROOTS = publicRoots("uploads", "cutouts", "backgrounds", "styleframes");
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
let isMaking = false; // one render at a time: each one uses the whole machine for a minute or two

export const config = { maxDuration: 600 };

function cleanShort(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, SHORT_TEXT_LIMIT);
  return trimmed || undefined;
}

function cleanColor(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return HEX_COLOR_RULE.test(trimmed) ? trimmed : undefined;
}

function cleanConfinedImage(value) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const resolved = resolveConfined(value.trim(), ASSET_ROOTS);
  if (!resolved || !IMAGE_EXT.test(resolved)) return null;
  return resolved;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const session = await requireOwnerSession(req, res);
  if (!session) return;
  loadEnvConfig(process.cwd());

  try {
    if (req.method === "GET") {
      const rows = await listInventory(session.tenantId);
      const items = rows
        .filter((r) => r.status === "active" && Number(r.price) > 0)
        .map((r) => ({ sku: r.sku, title: r.title, price: Number(r.price) }));
      return res.status(200).json({ ok: true, items, modes: ["product", "card-showcase"] });
    }

    const mode = req.body && req.body.mode === "card-showcase" ? "card-showcase" : "product";

    if (mode === "card-showcase") {
      const rawCardId = req.body && req.body.cardId;
      if (rawCardId !== undefined && rawCardId !== null && rawCardId !== "") {
        if (typeof rawCardId !== "string" || !CARD_ID_RULE.test(rawCardId)) {
          return res.status(400).json({ ok: false, error: "Invalid cardId" });
        }
      }
      if (isMaking) {
        return res.status(409).json({ ok: false, error: "A commercial is already being made. Try again in a minute." });
      }

      const bgPreset = req.body && typeof req.body.bgPreset === "string" && Object.prototype.hasOwnProperty.call(VIDEO_BG_PRESETS, req.body.bgPreset)
        ? req.body.bgPreset
        : undefined;
      const cardBgPreset = req.body && typeof req.body.cardBgPreset === "string" && CARD_STAGE_BACKDROPS.includes(req.body.cardBgPreset)
        ? req.body.cardBgPreset
        : undefined;
      const removeBg = req.body && typeof req.body.removeBg === "string" && CARD_BG_REMOVE_MODES.includes(req.body.removeBg)
        ? req.body.removeBg
        : undefined;
      const frameStyle = req.body && typeof req.body.frameStyle === "string" && CARD_FRAME_STYLES.includes(req.body.frameStyle)
        ? req.body.frameStyle
        : undefined;
      const autoCloseupLayout = req.body && typeof req.body.autoCloseupLayout === "string" && CUTIN_LAYOUTS.includes(req.body.autoCloseupLayout)
        ? req.body.autoCloseupLayout
        : undefined;

      const bgImage = cleanConfinedImage(req.body && req.body.bgImage);
      if (bgImage === null) {
        return res.status(400).json({ ok: false, error: "bgImage is not an allowed image path" });
      }
      const cardBgImage = cleanConfinedImage(req.body && req.body.cardBgImage);
      if (cardBgImage === null) {
        return res.status(400).json({ ok: false, error: "cardBgImage is not an allowed image path" });
      }

      let safeCutIns;
      if (Array.isArray(req.body && req.body.cutIns) && req.body.cutIns.length > 0) {
        safeCutIns = [];
        for (const item of req.body.cutIns.slice(0, 12)) {
          if (!item || typeof item !== "object") continue;
          const resolvedCutImg = cleanConfinedImage(item.image || item.imageUrl);
          if (!resolvedCutImg) {
            return res.status(400).json({ ok: false, error: "cutIns image is not an allowed image path" });
          }
          safeCutIns.push({
            image: resolvedCutImg,
            label: cleanShort(item.label) || "",
            layout: CUTIN_LAYOUTS.includes(item.layout) ? item.layout : "full",
            position: typeof item.position === "string" ? item.position : "bottom-right",
            transition: typeof item.transition === "string" ? item.transition : "fade",
            startSec: typeof item.startSec === "number" ? item.startSec : undefined,
            durationSec: typeof item.durationSec === "number" ? item.durationSec : undefined,
            removeBg: CARD_BG_REMOVE_MODES.includes(item.removeBg) ? item.removeBg : "none",
            zoom: typeof item.zoom === "number" ? item.zoom : 1,
            focusX: typeof item.focusX === "number" ? item.focusX : 50,
            focusY: typeof item.focusY === "number" ? item.focusY : 50,
          });
        }
      }

      isMaking = true;
      try {
        // Vault path comes from server config only (CARD_VAULT_PATH or default local vault),
        // never from an untrusted client filesystem path.
        const made = await makeCardShowcaseCommercial({
          cardId: rawCardId || undefined,
          ctaLine: cleanShort(req.body && req.body.ctaLine),
          handle: cleanShort(req.body && req.body.handle),
          bgPreset,
          bgImage,
          bgColor: cleanColor(req.body && req.body.bgColor),
          cardBgPreset,
          cardBgImage,
          cardBgColor: cleanColor(req.body && req.body.cardBgColor),
          removeBg,
          frameStyle,
          includeBack: Boolean(req.body && req.body.includeBack),
          autoCloseup: Boolean(req.body && req.body.autoCloseup),
          autoCloseupLayout,
          autoImprove: Boolean(req.body && req.body.autoImprove),
          explore: Boolean(req.body && req.body.explore),
          cutIns: safeCutIns,
        });
        if (!made.ok) return res.status(400).json({ ok: false, error: made.error });
        return res.status(200).json({
          ok: true,
          mode: "card-showcase",
          commercial: { name: made.name, bytes: made.bytes },
          card: made.card,
          qc: made.qc || null,
          learning: made.learning || null,
          posted: false,
          listed: false,
        });
      } finally {
        isMaking = false;
      }
    }

    const sku = req.body && req.body.sku;
    if (typeof sku !== "string" || !SKU_RULE.test(sku)) {
      return res.status(400).json({ ok: false, error: "Choose an item" });
    }
    if (isMaking) {
      return res.status(409).json({ ok: false, error: "A commercial is already being made. Try again in a minute." });
    }
    isMaking = true;
    try {
      const product = await getProductForCommercial(session.tenantId, sku);
      const made = await makeCommercial(product);
      if (!made.ok) return res.status(400).json({ ok: false, error: made.error });
      return res.status(200).json({ ok: true, commercial: { name: made.name, bytes: made.bytes }, posted: false });
    } finally {
      isMaking = false;
    }
  } catch (err) {
    console.error("[api/social/make-commercial]", err.message);
    return res.status(err.statusCode || 500).json({ ok: false, error: "The commercial could not be made" });
  }
}
