import {
  CardShowcaseDataSchema,
  VideoProjectSchema,
  type CardBgRemoveMode,
  type CardFrameStyle,
  type CardShowcaseBackground,
  type CardShowcaseBgPreset,
  type CardShowcaseCutIn,
  type CardShowcaseData,
  type CardShowcaseStage,
  type CardStageBackdropPreset,
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

export type VideoBgPresetMeta = {
  id: CardShowcaseBgPreset;
  label: string;
  description: string;
  kind: "gradient" | "image" | "custom";
  publicPath?: string;
  backgroundColor: string;
  gradient?: string;
  defaultDim: number;
  swatch: string;
};

export const VIDEO_BG_PRESETS: Record<CardShowcaseBgPreset, VideoBgPresetMeta> = {
  "navy-gold": {
    id: "navy-gold",
    label: "Navy & Gold",
    description: "Signature Jardin's Outpost dark navy radial studio glow",
    kind: "gradient",
    backgroundColor: "#040812",
    gradient:
      "radial-gradient(ellipse 90% 62% at 50% 42%, #0d172d 0%, #070d1b 52%, #03060d 100%)",
    defaultDim: 0,
    swatch: "linear-gradient(135deg, #102042 0%, #040812 100%)"
  },
  "studio-spotlight": {
    id: "studio-spotlight",
    label: "Studio Spotlight",
    description: "Dramatic dark studio overhead spotlight beam with dust motes",
    kind: "image",
    publicPath: "/backgrounds/bg-hook.jpg",
    backgroundColor: "#05070c",
    defaultDim: 0.24,
    swatch: "linear-gradient(180deg, #4b463d 0%, #0a0c10 100%)"
  },
  "gold-rays": {
    id: "gold-rays",
    label: "Gold Starburst",
    description: "Luxury black & gold light rays with centered focus zone",
    kind: "image",
    publicPath: "/backgrounds/bg-cta.jpg",
    backgroundColor: "#050507",
    defaultDim: 0.34,
    swatch: "linear-gradient(135deg, #c99732 0%, #110c05 100%)"
  },
  "neon-pulse": {
    id: "neon-pulse",
    label: "Cyber Neon",
    description: "Electric cyan & violet collector rim light streaks",
    kind: "image",
    publicPath: "/backgrounds/bg-features.jpg",
    backgroundColor: "#06081a",
    defaultDim: 0.42,
    swatch: "linear-gradient(135deg, #00d2ff 0%, #4b1575 60%, #e11d97 100%)"
  },
  "warm-bokeh": {
    id: "warm-bokeh",
    label: "Warm Bokeh",
    description: "Golden studio bokeh backdrop with dark contrast veil",
    kind: "image",
    publicPath: "/backgrounds/bg-proof.jpg",
    backgroundColor: "#140e09",
    defaultDim: 0.56,
    swatch: "linear-gradient(135deg, #d8a258 0%, #2d1f14 100%)"
  },
  "studio-linen": {
    id: "studio-linen",
    label: "Editorial Linen",
    description: "Sunlit editorial backdrop dimmed for crisp poster typography",
    kind: "image",
    publicPath: "/backgrounds/bg-showcase.jpg",
    backgroundColor: "#141210",
    defaultDim: 0.62,
    swatch: "linear-gradient(135deg, #dfd4c3 0%, #5a5248 100%)"
  },
  "obsidian-velvet": {
    id: "obsidian-velvet",
    label: "Obsidian Velvet",
    description: "Matte charcoal-black display velvet with soft center key",
    kind: "gradient",
    backgroundColor: "#06070a",
    gradient:
      "radial-gradient(ellipse 84% 58% at 50% 42%, #1d212b 0%, #0c0e13 55%, #040507 100%)",
    defaultDim: 0,
    swatch: "linear-gradient(135deg, #272c38 0%, #050608 100%)"
  },
  "emerald-vault": {
    id: "emerald-vault",
    label: "Emerald Vault",
    description: "Deep collector emerald felt with antique gold warmth",
    kind: "gradient",
    backgroundColor: "#04100d",
    gradient:
      "radial-gradient(ellipse 85% 60% at 50% 42%, #0f3a2e 0%, #071e18 54%, #030b09 100%)",
    defaultDim: 0,
    swatch: "linear-gradient(135deg, #134e3e 0%, #04100d 100%)"
  },
  "crimson-vault": {
    id: "crimson-vault",
    label: "Crimson Vault",
    description: "Deep ruby collector showcase velvet",
    kind: "gradient",
    backgroundColor: "#110408",
    gradient:
      "radial-gradient(ellipse 85% 60% at 50% 42%, #471120 0%, #220810 54%, #0b0305 100%)",
    defaultDim: 0,
    swatch: "linear-gradient(135deg, #63162b 0%, #110408 100%)"
  },
  custom: {
    id: "custom",
    label: "Custom Image / Color",
    description: "Use any replacement background image or custom hex color",
    kind: "custom",
    backgroundColor: "#040812",
    defaultDim: 0.36,
    swatch: "linear-gradient(135deg, #d8ac46 0%, #0e1a36 100%)"
  }
};

export type CardStageBackdropMeta = {
  id: CardStageBackdropPreset;
  label: string;
  description: string;
  backgroundColor: string;
  gradient?: string;
};

export const CARD_STAGE_BACKDROP_PRESETS: Record<
  CardStageBackdropPreset,
  CardStageBackdropMeta
> = {
  transparent: {
    id: "transparent",
    label: "Transparent Floating",
    description: "Cutout card floats with studio shadow over the replaced poster background",
    backgroundColor: "transparent"
  },
  "dark-velvet": {
    id: "dark-velvet",
    label: "Dark Velvet Matte",
    description: "Deep obsidian-navy velvet behind the cutout card",
    backgroundColor: "#070c18",
    gradient:
      "radial-gradient(ellipse 85% 70% at 50% 44%, #182746 0%, #091020 62%, #04070f 100%)"
  },
  "gold-glow": {
    id: "gold-glow",
    label: "Royal Gold Aura",
    description: "Warm metallic gold rim aura behind the floating card",
    backgroundColor: "#0a0806",
    gradient:
      "radial-gradient(circle at 50% 48%, rgba(226,184,78,0.34) 0%, rgba(112,80,22,0.18) 42%, #070a14 82%)"
  },
  spotlight: {
    id: "spotlight",
    label: "Studio Softbox",
    description: "Crisp top-down studio light cone behind the card",
    backgroundColor: "#06080f",
    gradient:
      "radial-gradient(ellipse 72% 88% at 50% 18%, rgba(235,240,255,0.24) 0%, rgba(30,42,68,0.22) 50%, #050810 92%)"
  },
  "studio-white": {
    id: "studio-white",
    label: "Collector Pure White",
    description: "High-key pure white collector light-box behind the card",
    backgroundColor: "#f7f8fa",
    gradient:
      "radial-gradient(circle at 50% 42%, #ffffff 0%, #eef1f6 76%, #dde3ec 100%)"
  },
  custom: {
    id: "custom",
    label: "Custom Backdrop",
    description: "Replace the behind-card backdrop with your own image or color",
    backgroundColor: "#070c18"
  }
};

export const DEFAULT_CARD_SHOWCASE_BACKGROUND: CardShowcaseBackground = {
  preset: "navy-gold",
  motion: "subtle"
};

export const DEFAULT_CARD_SHOWCASE_STAGE: CardShowcaseStage = {
  removeBg: "card",
  backgroundRemoved: false,
  backdropPreset: "transparent",
  frameStyle: "gold-frame",
  zoom: 1,
  offsetX: 0,
  offsetY: 0
};

export function resolveShowcaseBackground(
  bg?: Partial<CardShowcaseBackground> | null
): CardShowcaseBackground {
  const preset =
    bg?.preset && bg.preset in VIDEO_BG_PRESETS ? bg.preset : "navy-gold";
  return {
    preset,
    imageUrl: bg?.imageUrl || undefined,
    color: bg?.color || undefined,
    secondaryColor: bg?.secondaryColor || undefined,
    dim: typeof bg?.dim === "number" ? bg.dim : undefined,
    motion: bg?.motion === "none" ? "none" : "subtle"
  };
}

export function resolveShowcaseStage(
  stage?: Partial<CardShowcaseStage> | null
): CardShowcaseStage {
  const backdropPreset =
    stage?.backdropPreset && stage.backdropPreset in CARD_STAGE_BACKDROP_PRESETS
      ? stage.backdropPreset
      : "transparent";
  const frameStyle: CardFrameStyle =
    stage?.frameStyle === "floating" || stage?.frameStyle === "minimal"
      ? stage.frameStyle
      : "gold-frame";
  const removeBg: CardBgRemoveMode =
    stage?.removeBg === "cutout" || stage?.removeBg === "none"
      ? stage.removeBg
      : "card";
  return {
    removeBg,
    backgroundRemoved: Boolean(stage?.backgroundRemoved),
    originalPhotoUrl: stage?.originalPhotoUrl || undefined,
    backdropPreset,
    backdropImageUrl: stage?.backdropImageUrl || undefined,
    backdropColor: stage?.backdropColor || undefined,
    frameStyle,
    zoom: typeof stage?.zoom === "number" ? stage.zoom : 1,
    offsetX: typeof stage?.offsetX === "number" ? stage.offsetX : 0,
    offsetY: typeof stage?.offsetY === "number" ? stage.offsetY : 0
  };
}

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
  backImage?: string | null;
  back_image_path?: string | null;
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
  background?: Partial<CardShowcaseBackground>;
  cardStage?: Partial<CardShowcaseStage>;
  cutIns?: Array<Partial<CardShowcaseCutIn> & { imageUrl: string }>;
};

function clean(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function makeId(prefix = "card-showcase"): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
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

  const normalizedCutIns = Array.isArray(options.cutIns)
    ? options.cutIns.map((item, idx) => ({
        id: clean(item.id) || `cutin-${idx + 1}`,
        imageUrl: clean(item.imageUrl),
        originalImageUrl: clean(item.originalImageUrl) || undefined,
        label: clean(item.label),
        layout: item.layout || "full",
        position: item.position || "bottom-right",
        transition: item.transition || "fade",
        startSec:
          typeof item.startSec === "number"
            ? item.startSec
            : Number((5.0 + idx * 2.1).toFixed(2)),
        durationSec:
          typeof item.durationSec === "number" ? item.durationSec : 2.1,
        removeBg: item.removeBg || "none",
        backgroundRemoved: Boolean(item.backgroundRemoved),
        fit: item.fit || (item.backgroundRemoved ? "contain" : "cover"),
        zoom: typeof item.zoom === "number" ? item.zoom : 1,
        focusX: typeof item.focusX === "number" ? item.focusX : 50,
        focusY: typeof item.focusY === "number" ? item.focusY : 50
      }))
    : [];

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
    logoUrl: clean(options.logoUrl) || undefined,
    background: options.background
      ? resolveShowcaseBackground(options.background)
      : undefined,
    cardStage: options.cardStage
      ? resolveShowcaseStage(options.cardStage)
      : undefined,
    cutIns: normalizedCutIns
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
        cropMode: "contain"
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
