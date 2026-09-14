import { z } from "zod";

export const AspectRatioSchema = z.enum(["9:16", "1:1", "16:9"]);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export const VideoProjectTypeSchema = z.enum([
  "PRODUCT_COMMERCIAL",
  "SHORT_REEL",
  "MINI_FILM",
  "SERVICE_COMMERCIAL",
  "BEFORE_AFTER"
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

export const VideoProjectSchema = z.object({
  id: z.string().min(1),

  sourceListingId: z.string().optional(),
  sourceInventoryId: z.string().optional(),

  title: z.string().min(1).max(200),

  projectType: VideoProjectTypeSchema,

  aspectRatio: AspectRatioSchema,

  fps: z.number().int().min(24).max(60).default(30),

  scenes: z.array(VideoSceneSchema).min(1).max(60),

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
