// lib/cardCommercial.js
// Turns the card vault's inventory feed into commercial scripts and single-card showcase specs.
// Only already-stored vault facts are used. Prices are NEVER invented:
// - buildCardCommercial() never carries a price (price belongs to the live listing).
// - buildCardShowcaseProject() carries suggestedPrice ONLY if the vault already has one stored.

const crypto = require("node:crypto");
const { getStoredSuggestedPrice } = require("./cardVault");

const CARD_SHOWCASE_DEFAULTS = {
  brandName: "Jardin's Outpost",
  subBrand: "BossListers",
  ctaLine: "Message to claim",
  handle: "@jardinoutpost",
  durationSeconds: 12,
  fps: 30,
  aspectRatio: "9:16",
  width: 1080,
  height: 1920,
};

function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function buildCardCommercial(feedRows, options = {}) {
  const ready = (feedRows || []).filter((row) => row && row.needsReview === false && row.frontImage);
  if (ready.length === 0) return { scenes: [], audio: { volume_levels: { music: 0.3 } } };
  const scenes = [{ type: "title", duration: 3, text: options.title || "Listed now", product_images: [ready[0].frontImage] }];
  for (const row of ready) {
    scenes.push({
      type: "product_showcase",
      duration: 4,
      caption: row.title,
      product_images: [row.frontImage],
      motion: "1",
    });
  }
  scenes.push({ type: "product_loop", duration: 3, product_images: [ready[0].frontImage], caption: options.closing || "Ask about these today." });
  return { scenes, audio: { volume_levels: { music: 0.3 } } };
}

function buildDetailTag(fields, card) {
  const parts = [];
  const variant = clean(fields.variant || fields.parallel || card.variant);
  if (variant) parts.push(variant);

  const grade = clean(fields.grade || card.grade);
  const company = clean(fields.gradingCompany);
  if (fields.graded && (company || grade)) {
    parts.push([company, grade].filter(Boolean).join(" "));
  } else if (grade && company && company.toLowerCase() !== "ungraded") {
    parts.push(`${company} ${grade}`);
  } else if (grade && grade.toLowerCase() !== "ungraded") {
    parts.push(grade);
  }
  return parts.join(" · ");
}

function formatCardShowcaseSlug(data) {
  const joined = [
    "card-showcase",
    clean(data.year),
    clean(data.setName),
    clean(data.cardName),
    clean(data.cardNumber).replace(/^#+/, ""),
  ]
    .filter(Boolean)
    .join("-");

  const slug = joined
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  if (slug && slug !== "card-showcase") return slug;
  const fallback = clean(data.cardId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `card-showcase-${fallback || "item"}`;
}

/**
 * Turns one vault card into the Card Showcase data shape consumed by Remotion's CardShowcase composition.
 * Reads photo + stored facts from the vault; never invents a price.
 */
function buildCardShowcaseSpec(card, options = {}) {
  if (!card || typeof card !== "object") {
    throw new Error("A vault card record is required");
  }
  const cardId = clean(card.id || card.source_key);
  if (!cardId) throw new Error("Vault card is missing an id");

  const photoUrl = clean(options.photoUrlOverride || card.frontImage || card.front_image_path);
  if (!photoUrl) throw new Error(`Vault card ${cardId} has no photo`);

  const fields = card.fields && typeof card.fields === "object" ? card.fields : {};
  const setName = clean(fields.set || card.set_name);
  const year = clean(fields.year);
  const cardNumber = clean(fields.cardNumber || card.card_number);
  const rawName = clean(fields.player || fields.name || fields.character);
  const cardName =
    rawName ||
    [year, setName, cardNumber ? `#${cardNumber.replace(/^#+/, "")}` : ""].filter(Boolean).join(" ") ||
    "Vault Card";

  // Strictly read an already-stored vault price; null when none is stored.
  const suggestedPrice = getStoredSuggestedPrice(card);

  return {
    cardId,
    cardName,
    setName,
    year,
    cardNumber,
    detailTag: buildDetailTag(fields, card),
    photoUrl,
    suggestedPrice,
    brandName: clean(options.brandName) || CARD_SHOWCASE_DEFAULTS.brandName,
    subBrand: clean(options.subBrand) || CARD_SHOWCASE_DEFAULTS.subBrand,
    ctaLine: clean(options.ctaLine) || CARD_SHOWCASE_DEFAULTS.ctaLine,
    handle: clean(options.handle) || CARD_SHOWCASE_DEFAULTS.handle,
    logoUrl: clean(options.logoUrl) || undefined,
  };
}

/**
 * Builds a complete Remotion VideoProject payload for Card Showcase mode (1080x1920, 9:16, 12s, 30fps).
 * No voiceover; music only if explicitly provided. Never auto-lists or auto-posts.
 */
function buildCardShowcaseProject(card, options = {}) {
  const showcase = buildCardShowcaseSpec(card, options);
  const now = new Date().toISOString();
  const formattedNumber = showcase.cardNumber ? `#${showcase.cardNumber.replace(/^#+/, "")}` : "";
  const titleParts = [showcase.year, showcase.setName, showcase.cardName, formattedNumber].filter(Boolean);
  const supportingParts = [[showcase.setName, showcase.year].filter(Boolean).join(" · "), formattedNumber].filter(Boolean);

  return {
    id: `card-showcase-${crypto.randomUUID()}`,
    sourceInventoryId: showcase.cardId,
    title: `${titleParts.join(" ") || showcase.cardName} — Card Showcase`,
    projectType: "CARD_SHOWCASE",
    aspectRatio: CARD_SHOWCASE_DEFAULTS.aspectRatio,
    fps: CARD_SHOWCASE_DEFAULTS.fps,
    scenes: [
      {
        id: `showcase-${showcase.cardId}`,
        assetUrl: showcase.photoUrl,
        assetType: "image",
        durationSeconds: CARD_SHOWCASE_DEFAULTS.durationSeconds,
        headline: showcase.cardName,
        supportingText: supportingParts.join(" · "),
        textPosition: "bottom",
        transition: "fade",
        motion: "zoom-in",
        cropMode: "cover",
      },
    ],
    cardShowcase: showcase,
    audio: {
      musicUrl: clean(options.musicUrl) || undefined,
      narrationUrl: undefined,
      musicVolume:
        typeof options.musicVolume === "number" && Number.isFinite(options.musicVolume)
          ? Math.max(0, Math.min(1, options.musicVolume))
          : 0.25,
      narrationVolume: 0,
      fadeInSeconds: 0.6,
      fadeOutSeconds: 1.0,
    },
    cta: {
      text: showcase.ctaLine,
      destinationUrl: "",
      showQrCode: false,
    },
    renderStatus: "DRAFT",
    renderProgress: 0,
    createdAt: now,
    updatedAt: now,
  };
}

module.exports = {
  CARD_SHOWCASE_DEFAULTS,
  buildCardCommercial,
  buildCardShowcaseSpec,
  buildCardShowcaseProject,
  formatCardShowcaseSlug,
};
