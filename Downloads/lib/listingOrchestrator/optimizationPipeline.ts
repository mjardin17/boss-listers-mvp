import type { CrossListDraft } from "../crossListEngine/types";
import { scoreListingDraft } from "./listingScore";

export function optimizeAdaptedListing(draft: CrossListDraft) {
  const score = scoreListingDraft(draft);
  return {
    ...draft,
    optimization: score,
    mobilePreview: {
      title: draft.title,
      subtitle: draft.category,
      body: draft.description.slice(0, 180)
    }
  };
}
