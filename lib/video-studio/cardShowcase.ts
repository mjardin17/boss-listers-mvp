import {
  CardShowcaseDataSchema,
  VideoProjectSchema,
  type CardShowcaseData,
  type VideoProject
} from "./types";

export const DEFAULT_BRAND_NAME = "Jardin's Outpost";
export const DEFAULT_SUB_BRAND = "BossListers";
export const DEFAULT_HANDLE = "@jardinoutpost";
export const DEFAULT_CTA_LINE = "Message to claim";
export const CARD_SHOWCASE_DURATION_SECONDS = 12;
export const CARD_SHOWCASE_FPS = 30;
export const CARD_SHOWCASE_TOTAL_FRAMES =
  CARD_SHOWCASE_DURATION_SECONDS * CARD_SHOWCASE_FPS;

export type VaultCardFields = {
  player?: string | null;
  name?: string | null;
  character?: string | null;
  set?: string | null;
  year?: string | number | null;
  cardNumber?: string | null;
  variant?: string | null;
  parallel?: string | null;
  graded?: boolean | null;
  gradingCompany?: string | null;
  grade?: string | null;
  cardGame?: string | null;
  sport?: string | null;
};

export type VaultCardInput = {
  id: string;
  source_key?: string | null;
  frontImage?: string | null;
  front_image_path?: string | null;
  fields?: VaultCardFields | null;
  set_name?: string | null;
  card_number?: string | null;
  variant?: string | null;
  grade?: string | null;
  suggestedPrice?: number | string | null;
  suggested_price?: number | string | null;
  sellerPrice?: number | string | null;
  seller_price?: number | string | null;
  seller_price_cents?: number | null;
  price?: number | string | null;
};

export type CardShowcaseOptions = {
  photoUrlOverride?: string;
  brandName?: string;
  subBrand?: string;
  ctaLine?: string;
  handle?: string;
  logoUrl?: string;
  musicUrl?: string;
  musicVolume?: number;
};

function clean(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function makeId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `card-showcase-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Reads an already-stored price from a vault card record.
 * Returns null if none is stored — never sets, calculates, or invents a price.
 */
export function extractStoredCardPrice(
  card: VaultCardInput | null | undefined
): number | null {
  if (!card || typeof card !== "object") return null;

  const candidates = [
    card.suggestedPrice,
    card.suggested_price,
    card.sellerPrice,
    card.seller_price,
    card.price
  ];

  for (const raw of candidates) {
    if (raw === null || raw === undefined || raw === "" || typeof raw === "boolean") {
      continue;
    }
    const parsed = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed * 100) / 100;
    }
  }

  if (
    typeof card.seller_price_cents === "number" &&
    Number.isInteger(card.seller_price_cents) &&
    card.seller_price_cents > 0
  ) {
    return Math.round(card.seller_price_cents) / 100;
  }

  return null;
}

export function formatCardNumber(cardNumber: string): string {
  const cleaned = clean(cardNumber).replace(/^#+/, "").trim();
  return cleaned ? `#${cleaned}` : "";
}

export function formatSetAndYear(setName: string, year: string): string {
  const parts = [clean(setName), clean(year)].filter(Boolean);
  return parts.join(" · ");
}

export function formatStoredPrice(price: number | null | undefined): string {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return "";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(price);
}

export function formatCardShowcaseSlug(data: {
  year?: string;
  setName?: string;
  cardName?: string;
  cardNumber?: string;
  cardId?: string;
}): string {
  const joined = [
    "card-showcase",
    clean(data.year),
    clean(data.setName),
    clean(data.cardName),
    clean(data.cardNumber).replace(/^#+/, "")
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

function buildDetailTag(fields: VaultCardFields, card: VaultCardInput): string {
  const parts: string[] = [];
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

/**
 * Turns one vault card record into validated CardShowcaseData.
 * Reads photo + stored facts directly from the vault; never invents a price.
 */
export function vaultCardToShowcaseData(
  card: VaultCardInput,
  options: CardShowcaseOptions = {}
): CardShowcaseData {
  if (!card || typeof card !== "object") {
    throw new Error("A vault card record is required");
  }

  const cardId = clean(card.id || card.source_key);
  if (!cardId) {
    throw new Error("Vault card is missing an id");
  }

  const photoUrl = clean(
    options.photoUrlOverride || card.frontImage || card.front_image_path
  );
  if (!photoUrl) {
    throw new Error(`Vault card ${cardId} has no front photo`);
  }

  const fields = (card.fields && typeof card.fields === "object"
    ? card.fields
    : {}) as VaultCardFields;

  const setName = clean(fields.set || card.set_name);
  const year = clean(fields.year);
  const cardNumber = clean(fields.cardNumber || card.card_number);
  const rawName = clean(fields.player || fields.name || fields.character);
  const cardName =
    rawName ||
    [year, setName, cardNumber ? `#${cardNumber.replace(/^#+/, "")}` : ""]
      .filter(Boolean)
      .join(" ") ||
    "Vault Card";

  const suggestedPrice = extractStoredCardPrice(card);

  return CardShowcaseDataSchema.parse({
    cardId,
    cardName,
    setName,
    year,
    cardNumber,
    detailTag: buildDetailTag(fields, card),
    photoUrl,
    suggestedPrice,
    brandName: clean(options.brandName) || DEFAULT_BRAND_NAME,
    subBrand: clean(options.subBrand) || DEFAULT_SUB_BRAND,
    ctaLine: clean(options.ctaLine) || DEFAULT_CTA_LINE,
    handle: clean(options.handle) || DEFAULT_HANDLE,
    logoUrl: clean(options.logoUrl) || undefined
  });
}

/**
 * Builds a 12-second 9:16 (1080x1920) VideoProject in Card Showcase mode.
 * No voiceover. Music only if explicitly provided (free/unlicensed); silent by default.
 * Never invents a price, never lists, never posts.
 */
export function buildCardShowcaseDraft(
  card: VaultCardInput,
  options: CardShowcaseOptions = {}
): VideoProject {
  const showcase = vaultCardToShowcaseData(card, options);
  const now = new Date().toISOString();
  const titleParts = [
    showcase.year,
    showcase.setName,
    showcase.cardName,
    formatCardNumber(showcase.cardNumber)
  ].filter(Boolean);

  const supportingParts = [
    formatSetAndYear(showcase.setName, showcase.year),
    formatCardNumber(showcase.cardNumber)
  ].filter(Boolean);

  return VideoProjectSchema.parse({
    id: makeId(),
    sourceInventoryId: showcase.cardId,
    title: `${titleParts.join(" ") || showcase.cardName} — Card Showcase`,
    projectType: "CARD_SHOWCASE",
    aspectRatio: "9:16",
    fps: CARD_SHOWCASE_FPS,
    scenes: [
      {
        id: `showcase-${showcase.cardId}`,
        assetUrl: showcase.photoUrl,
        assetType: "image",
        durationSeconds: CARD_SHOWCASE_DURATION_SECONDS,
        headline: showcase.cardName,
        supportingText: supportingParts.join(" · "),
        textPosition: "bottom",
        transition: "fade",
        motion: "zoom-in",
        cropMode: "cover"
      }
    ],
    cardShowcase: showcase,
    audio: {
      musicUrl: clean(options.musicUrl) || undefined,
      // No voiceover in Card Showcase mode
      narrationUrl: undefined,
      musicVolume:
        typeof options.musicVolume === "number" &&
        Number.isFinite(options.musicVolume)
          ? Math.max(0, Math.min(1, options.musicVolume))
          : 0.25,
      narrationVolume: 0,
      fadeInSeconds: 0.6,
      fadeOutSeconds: 1.0
    },
    cta: {
      text: showcase.ctaLine,
      destinationUrl: "",
      showQrCode: false
    },
    renderStatus: "DRAFT",
    renderProgress: 0,
    createdAt: now,
    updatedAt: now
  });
}
