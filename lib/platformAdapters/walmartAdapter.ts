import type { CrossListDraft } from "../crossListEngine/types";

export function adaptWalmartListing(draft: CrossListDraft): CrossListDraft {
  return {
    ...draft,
    title: draft.title.replace(/[!?]+/g, "").slice(0, 75),
    metadata: { ...draft.metadata, tone: "clean catalog retail" }
  };
}
