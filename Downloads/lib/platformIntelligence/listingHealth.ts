import type { CrossListDraft } from "../crossListEngine/types";
import { PLATFORM_PROFILES } from "./platformProfiles";

export type ListingHealthStatus = "READY" | "NEEDS_REVIEW" | "BLOCKED";

export function scoreListingHealth(draft: CrossListDraft) {
  const profile = PLATFORM_PROFILES[draft.platform];
  const titleFit = draft.title.length <= profile.titleLimit;
  const hasBrand = !draft.metadata.requiresBrand || /\w/.test(draft.bulletPoints.find((item) => item.startsWith("Brand:")) || "");
  const warningCount = draft.metadata.warnings.length;
  const score = Math.max(0, 100 - (titleFit ? 0 : 35) - (hasBrand ? 0 : 25) - warningCount * 15);
  const status: ListingHealthStatus = score >= 80 ? "READY" : score >= 45 ? "NEEDS_REVIEW" : "BLOCKED";
  return {
    platform: draft.platform,
    displayName: draft.displayName,
    score,
    status,
    reasons: [
      titleFit ? "" : "Title exceeds platform limit.",
      hasBrand ? "" : "Verified brand required before publishing.",
      ...draft.metadata.warnings
    ].filter(Boolean)
  };
}
