import type { CrossListDraft } from "../crossListEngine/types";

export interface ListingOptimizationScore {
  listingQualityScore: number;
  seoScore: number;
  conversionScore: number;
  mobileReadabilityScore: number;
  trustScore: number;
  warnings: string[];
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function scoreListingDraft(draft: CrossListDraft): ListingOptimizationScore {
  const titleFit = draft.title.length <= draft.metadata.titleLimit;
  const hasBullets = draft.bulletPoints.length >= 2;
  const hasDescription = draft.description.length >= 40;
  const keywordStuffed = /(rare|wow|l@@k|must see|!!!)/i.test(draft.title);
  const mobileReadable = draft.title.length <= Math.min(draft.metadata.titleLimit, 80) && draft.description.length <= 900;
  const warnings = [
    titleFit ? "" : "Title exceeds platform limit.",
    hasBullets ? "" : "Add more structured item details.",
    hasDescription ? "" : "Description is thin.",
    keywordStuffed ? "Keyword stuffing or unsafe punctuation detected." : "",
    mobileReadable ? "" : "Mobile preview may be too dense."
  ].filter(Boolean);

  return {
    listingQualityScore: clamp(85 - warnings.length * 12 + (draft.metadata.publishReady ? 5 : -15)),
    seoScore: clamp((titleFit ? 35 : 10) + (draft.category ? 20 : 0) + Math.min(30, draft.bulletPoints.length * 8)),
    conversionScore: clamp((hasDescription ? 35 : 10) + (hasBullets ? 25 : 8) + (draft.metadata.publishReady ? 25 : 0)),
    mobileReadabilityScore: clamp(mobileReadable ? 90 : 55),
    trustScore: clamp(90 - draft.metadata.warnings.length * 18 - (keywordStuffed ? 25 : 0)),
    warnings
  };
}
