import type { CrossListDraft } from "../crossListEngine/types";

export function adaptPinterestListing(draft: CrossListDraft): CrossListDraft {
  const hashtags = draft.hashtags.length ? draft.hashtags : ["#resale", "#shopping"];
  return {
    ...draft,
    hashtags,
    description: `${draft.description} ${hashtags.join(" ")}`.trim(),
    metadata: { ...draft.metadata, tone: "visual SEO discovery" }
  };
}
