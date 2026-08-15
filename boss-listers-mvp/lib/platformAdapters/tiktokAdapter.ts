import type { CrossListDraft } from "../crossListEngine/types";

export function adaptTiktokListing(draft: CrossListDraft): CrossListDraft {
  return {
    ...draft,
    title: draft.title.slice(0, 60),
    description: `${draft.description.slice(0, 140)} Limited quantity. Review photos before buying.`,
    metadata: { ...draft.metadata, tone: "short social commerce" }
  };
}
