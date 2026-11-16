import { z } from "zod";

export const AspectRatioSchema = z.enum(["9:16", "1:1", "16:9"]);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export const VideoProjectTypeSchema = z.enum([
  "PRODUCT_COMMERCIAL",
  "SHORT_REEL",
  "MINI_FILM",
  "SERVICE_COMMERCIAL",
  "BEFORE_AFTER",
  "CARD_SHOWCASE"
]);
export type VideoProjectType = z.infer<typeof VideoProjectTypeSchema>;

export const RenderStatusSchema = z.enum([
  "DRAFT",
  "READY",
  "QUEUED",
  "RENDERING",
  "SUCCEEDED",
  "FAILED"
]);
export type RenderStatus = z.infer<typeof RenderStatusSchema>;

export const TransitionSchema = z.enum([
  "cut",
  "fade",
  "crossfade",
  "slide-left",
  "slide-up"
]);

export const MotionSchema = z.enum([
  "none",
  "zoom-in",
  "zoom-out",
  "pan-left",
  "pan-right"
]);

export const TextPositionSchema = z.enum([
  "top",
  "center",
  "bottom"
]);

export const VideoSceneSchema = z.object({
  id: z.string().min(1),
  assetUrl: z.string().min(1),
  assetType: z.enum(["image", "video"]),
  durationSeconds: z.number().min(0.5).max(30),
  headline: z.string().max(160).default(""),
  supportingText: z.string().max(320).default(""),
  textPosition: TextPositionSchema.default("bottom"),
  transition: TransitionSchema.default("fade"),
  motion: MotionSchema.default("zoom-in"),
  cropMode: z.enum(["cover", "contain"]).default("cover")
});

export type VideoScene = z.infer<typeof VideoSceneSchema>;

export const VideoAudioSchema = z.object({
  musicUrl: z.string().optional(),
  narrationUrl: z.string().optional(),
  musicVolume: z.number().min(0).max(1).default(0.35),
  narrationVolume: z.number().min(0).max(1).default(1),
  fadeInSeconds: z.number().min(0).max(10).default(0.5),
  fadeOutSeconds: z.number().min(0).max(10).default(1)
});

export const VideoCtaSchema = z.object({
  text: z.string().max(120).default("Shop now"),
  destinationUrl: z.string().url().optional().or(z.literal("")),
  phone: z.string().max(40).optional(),
  website: z.string().max(200).optional(),
  showQrCode: z.boolean().default(false)
});

export const CardShowcaseBgPresetSchema = z.enum([
  "navy-gold",
  "studio-spotlight",
  "gold-rays",
  "neon-pulse",
  "warm-bokeh",
  "studio-linen",
  "obsidian-velvet",
  "emerald-vault",
  "crimson-vault",
  "custom"
]);
export type CardShowcaseBgPreset = z.infer<typeof CardShowcaseBgPresetSchema>;

export const CardStageBackdropPresetSchema = z.enum([
  "transparent",
  "dark-velvet",
  "gold-glow",
  "spotlight",
  "studio-white",
  "custom"
]);
export type CardStageBackdropPreset = z.infer<typeof CardStageBackdropPresetSchema>;

export const CardFrameStyleSchema = z.enum([
  "gold-frame",
  "floating",
  "minimal"
]);
export type CardFrameStyle = z.infer<typeof CardFrameStyleSchema>;

export const CardBgRemoveModeSchema = z.enum([
  "card",
  "cutout",
  "none"
]);
export type CardBgRemoveMode = z.infer<typeof CardBgRemoveModeSchema>;

export const CardShowcaseBackgroundSchema = z.object({
  preset: CardShowcaseBgPresetSchema.default("navy-gold"),
  imageUrl: z.string().optional(),
  color: z.string().max(32).optional(),
  secondaryColor: z.string().max(32).optional(),
  dim: z.number().min(0).max(0.92).optional(),
  motion: z.enum(["subtle", "none"]).default("subtle")
});
export type CardShowcaseBackground = z.infer<typeof CardShowcaseBackgroundSchema>;

export const CardShowcaseStageSchema = z.object({
  removeBg: CardBgRemoveModeSchema.default("card"),
  backgroundRemoved: z.boolean().default(false),
  originalPhotoUrl: z.string().optional(),
  backdropPreset: CardStageBackdropPresetSchema.default("transparent"),
  backdropImageUrl: z.string().optional(),
  backdropColor: z.string().max(32).optional(),
  frameStyle: CardFrameStyleSchema.default("gold-frame"),
  zoom: z.number().min(0.7).max(2.2).default(1),
  offsetX: z.number().min(-50).max(50).default(0),
  offsetY: z.number().min(-50).max(50).default(0)
});
export type CardShowcaseStage = z.infer<typeof CardShowcaseStageSchema>;

export const CardShowcaseCutInLayoutSchema = z.enum([
  "full",
  "pip",
  "split",
  "closeup"
]);
export type CardShowcaseCutInLayout = z.infer<typeof CardShowcaseCutInLayoutSchema>;

export const CardShowcaseCutInPositionSchema = z.enum([
  "top-right",
  "bottom-right",
  "bottom-left",
  "top-left"
]);
export type CardShowcaseCutInPosition = z.infer<typeof CardShowcaseCutInPositionSchema>;

export const CardShowcaseCutInTransitionSchema = z.enum([
  "fade",
  "cut",
  "slide-left",
  "slide-up",
  "zoom"
]);
export type CardShowcaseCutInTransition = z.infer<typeof CardShowcaseCutInTransitionSchema>;

export const CardShowcaseCutInSchema = z.object({
  id: z.string().min(1),
  imageUrl: z.string().min(1),
  originalImageUrl: z.string().optional(),
  label: z.string().max(60).default(""),
  layout: CardShowcaseCutInLayoutSchema.default("full"),
  position: CardShowcaseCutInPositionSchema.default("bottom-right"),
  transition: CardShowcaseCutInTransitionSchema.default("fade"),
  startSec: z.number().min(0).max(30).default(5.2),
  durationSec: z.number().min(0.4).max(12).default(2.2),
  removeBg: CardBgRemoveModeSchema.default("none"),
  backgroundRemoved: z.boolean().default(false),
  fit: z.enum(["contain", "cover"]).default("contain"),
  zoom: z.number().min(1).max(3).default(1),
  focusX: z.number().min(0).max(100).default(50),
  focusY: z.number().min(0).max(100).default(50)
});
export type CardShowcaseCutIn = z.infer<typeof CardShowcaseCutInSchema>;

export const CardShowcaseDataSchema = z.object({
  cardId: z.string().min(1),
  cardName: z.string().min(1).max(160),
  setName: z.string().max(160).default(""),
  year: z.string().max(16).default(""),
  cardNumber: z.string().max(64).default(""),
  detailTag: z.string().max(120).default(""),
  photoUrl: z.string().min(1),
  // Strictly populated ONLY if the card vault already has a price stored for this card.
  // Never invented, guessed, or defaulted.
  suggestedPrice: z.number().positive().nullable().default(null),
  brandName: z.string().min(1).max(80).default("Jardin's Outpost"),
  subBrand: z.string().max(80).default("BossListers"),
  ctaLine: z.string().min(1).max(80).default("Message to claim"),
  handle: z.string().min(1).max(80).default("@jardinoutpost"),
  logoUrl: z.string().optional(),
  background: CardShowcaseBackgroundSchema.optional(),
  cardStage: CardShowcaseStageSchema.optional(),
  cutIns: z.array(CardShowcaseCutInSchema).max(12).default([])
});

export type CardShowcaseData = z.infer<typeof CardShowcaseDataSchema>;

export const VideoProjectSchema = z.object({
  id: z.string().min(1),

  sourceListingId: z.string().optional(),
  sourceInventoryId: z.string().optional(),

  title: z.string().min(1).max(200),

  projectType: VideoProjectTypeSchema,

  aspectRatio: AspectRatioSchema,

  fps: z.number().int().min(24).max(60).default(30),

  scenes: z.array(VideoSceneSchema).min(1).max(60),

  cardShowcase: CardShowcaseDataSchema.optional(),

  // Zod 4's .default() requires the fully-resolved output shape, not a
  // partial {} that relies on nested field defaults to fill in — explicit
  // here rather than relying on VideoAudioSchema/VideoCtaSchema's own
  // per-field .default() calls to satisfy this outer .default().
  audio: VideoAudioSchema.default({
    musicVolume: 0.35,
    narrationVolume: 1,
    fadeInSeconds: 0.5,
    fadeOutSeconds: 1,
  }),

  cta: VideoCtaSchema.default({
    text: "Shop now",
    showQrCode: false,
  }),

  renderStatus: RenderStatusSchema.default("DRAFT"),

  renderProgress: z.number().min(0).max(100).default(0),

  renderError: z.string().optional(),

  outputUrl: z.string().optional(),

  createdAt: z.string(),

  updatedAt: z.string()
});

export type VideoProject = z.infer<typeof VideoProjectSchema>;

export type ListingVideoSource = {
  id: string;
  inventoryId?: string;

  title: string;
  description?: string;

  price?: number | null;

  photos: string[];

  marketplace?: string;

  listingUrl?: string;

  brand?: string;

  category?: string;
};
