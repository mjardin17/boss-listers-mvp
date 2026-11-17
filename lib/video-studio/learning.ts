import { z } from "zod";

import {
  CardBgRemoveModeSchema,
  CardFrameStyleSchema,
  CardShowcaseBgPresetSchema,
  CardShowcaseCutInLayoutSchema,
  CardShowcaseCutInTransitionSchema,
  CardStageBackdropPresetSchema
} from "./types";

export const CommercialCategorySchema = z.enum([
  "trading-card",
  "resale-bundle",
  "single-item"
]);
export type CommercialCategory = z.infer<typeof CommercialCategorySchema>;

export const CommercialFeedbackTagSchema = z.enum([
  "loved-backdrop",
  "clean-cutout",
  "great-cutins",
  "great-pacing",
  "bg-too-dark",
  "bg-too-bright",
  "cutout-needs-work",
  "needs-more-cutins",
  "got-inquiries",
  "item-sold"
]);
export type CommercialFeedbackTag = z.infer<typeof CommercialFeedbackTagSchema>;

export const COMMERCIAL_FEEDBACK_TAG_OPTIONS: Array<{
  id: CommercialFeedbackTag;
  label: string;
  polarity: "positive" | "adjustment" | "outcome";
}> = [
  { id: "loved-backdrop", label: "Loved Backdrop", polarity: "positive" },
  { id: "clean-cutout", label: "Clean Cutout", polarity: "positive" },
  { id: "great-cutins", label: "Great Cut-Ins", polarity: "positive" },
  { id: "great-pacing", label: "Great Pacing", polarity: "positive" },
  { id: "bg-too-bright", label: "BG Too Bright", polarity: "adjustment" },
  { id: "bg-too-dark", label: "BG Too Dark", polarity: "adjustment" },
  { id: "cutout-needs-work", label: "Cutout Needs Work", polarity: "adjustment" },
  { id: "needs-more-cutins", label: "Needs More Cut-Ins", polarity: "adjustment" },
  { id: "got-inquiries", label: "Got DMs / Inquiries", polarity: "outcome" },
  { id: "item-sold", label: "Item Sold!", polarity: "outcome" }
];

export const CommercialRecipeSchema = z.object({
  bgPreset: CardShowcaseBgPresetSchema.default("studio-spotlight"),
  bgDim: z.number().min(0).max(0.92).default(0.22),
  bgMotion: z.enum(["subtle", "none"]).default("subtle"),
  cardBgPreset: CardStageBackdropPresetSchema.default("transparent"),
  frameStyle: CardFrameStyleSchema.default("gold-frame"),
  removeBg: CardBgRemoveModeSchema.default("card"),
  cutInTransition: CardShowcaseCutInTransitionSchema.default("slide-left"),
  cutInLayout: CardShowcaseCutInLayoutSchema.default("full"),
  autoCloseup: z.boolean().default(false),
  autoBundleCutins: z.boolean().default(false)
});
export type CommercialRecipe = z.infer<typeof CommercialRecipeSchema>;

export const CommercialQcReportSchema = z.object({
  ok: z.boolean().default(true),
  overallScore: z.number().min(0).max(100),
  scores: z.object({
    technical: z.number().min(0).max(100),
    cutout: z.number().min(0).max(100),
    contrast: z.number().min(0).max(100),
    pacing: z.number().min(0).max(100),
    framing: z.number().min(0).max(100)
  }),
  metrics: z.record(z.string(), z.unknown()).default({}),
  strengths: z.array(z.string()).default([]),
  issues: z.array(z.string()).default([]),
  adjustments: z.record(z.string(), z.unknown()).default({})
});
export type CommercialQcReport = z.infer<typeof CommercialQcReportSchema>;

export const CommercialFeedbackInputSchema = z.object({
  runId: z.string().min(1).max(120),
  rating: z.number().int().min(1).max(5).optional(),
  tags: z.array(CommercialFeedbackTagSchema).max(10).optional(),
  notes: z.string().max(400).optional(),
  views: z.number().int().min(0).max(100_000_000).optional(),
  inquiries: z.number().int().min(0).max(1_000_000).optional(),
  sold: z.boolean().optional()
});
export type CommercialFeedbackInput = z.infer<typeof CommercialFeedbackInputSchema>;

export const CommercialFeedbackRecordSchema = z.object({
  rating: z.number().int().min(1).max(5).nullable().default(null),
  tags: z.array(CommercialFeedbackTagSchema).default([]),
  notes: z.string().default(""),
  views: z.number().int().min(0).nullable().default(null),
  inquiries: z.number().int().min(0).nullable().default(null),
  sold: z.boolean().default(false),
  updatedAt: z.string().optional()
});
export type CommercialFeedbackRecord = z.infer<typeof CommercialFeedbackRecordSchema>;

export const CommercialRunRecordSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  category: CommercialCategorySchema,
  title: z.string().max(200),
  fileName: z.string().max(200).default(""),
  outputPath: z.string().default(""),
  prepStrategy: z.string().default("none"),
  cutInCount: z.number().int().min(0).default(0),
  recipe: CommercialRecipeSchema,
  qc: CommercialQcReportSchema.nullable().default(null),
  feedback: CommercialFeedbackRecordSchema.default({
    rating: null,
    tags: [],
    notes: "",
    views: null,
    inquiries: null,
    sold: false
  }),
  effectiveScore: z.number().min(0).max(100),
  improvedFromRunId: z.string().optional()
});
export type CommercialRunRecord = z.infer<typeof CommercialRunRecordSchema>;

export const CategoryPlaybookSchema = z.object({
  category: CommercialCategorySchema,
  runCount: z.number().int().min(0),
  avgScore: z.number().min(0).max(100),
  bestScore: z.number().min(0).max(100),
  trendDelta: z.number(),
  winningRecipe: CommercialRecipeSchema,
  learnedRules: z.array(z.string()),
  presetScores: z.record(z.string(), z.object({ avg: z.number(), count: z.number() }))
});
export type CategoryPlaybook = z.infer<typeof CategoryPlaybookSchema>;

export type LearningSummaryResponse = {
  ok: boolean;
  totalRuns: number;
  ratedRuns: number;
  soldCount: number;
  overallAvgScore: number;
  overallTrendDelta: number;
  playbooks: Record<CommercialCategory, CategoryPlaybook>;
  recentRuns: CommercialRunRecord[];
};
